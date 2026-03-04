// src/pty/PtySession.ts — Wraps a single PTY process with lifecycle management
// See: docs/design/pty-manager.md#§5 (Graceful Shutdown)

import type { NodePtyModule, Pty, PtyForkOptions } from "./PtyManager";

// ─── Constants ──────────────────────────────────────────────────────

/**
 * Wait for data flush after last onData event before killing.
 * From VS Code ShutdownConstants.DataFlushTimeout.
 */
const DATA_FLUSH_TIMEOUT_MS = 250;

/**
 * Maximum time to wait for process to exit after kill() before force-killing.
 * From VS Code ShutdownConstants.MaximumShutdownTime.
 */
const MAX_SHUTDOWN_TIME_MS = 5000;

/**
 * Hard deadline from kill() start — if data never quiesces (e.g., `yes`, `tail -f`),
 * force the kill after this timeout regardless. Prevents indefinite stall.
 */
const MAX_GRACE_PERIOD_MS = 3000;

// ─── PtySession ─────────────────────────────────────────────────────

/**
 * Wraps a single node-pty process with spawn, write, resize, kill, and graceful shutdown.
 *
 * Lifecycle:
 *   new PtySession(id) → spawn() → write/resize → kill() → onExit fires
 *
 * The session does NOT own output buffering or flow control — those are
 * the responsibility of the caller (SessionManager / OutputBuffer).
 */
export class PtySession {
  readonly id: string;

  private _ptyProcess: Pty | undefined;
  private _isAlive = false;
  private _isShuttingDown = false;
  private _hasSpawned = false;
  private _killSent = false;

  /** Timer for data flush during shutdown (250ms after last onData). */
  private _flushTimer: ReturnType<typeof setTimeout> | undefined;
  /** Timer for force-kill if process doesn't exit after pty.kill(). */
  private _forceKillTimer: ReturnType<typeof setTimeout> | undefined;
  /** Hard deadline timer — kills process even if data keeps flowing. */
  private _graceTimer: ReturnType<typeof setTimeout> | undefined;

  /** Disposables from node-pty event subscriptions. */
  private _disposables: Array<{ dispose(): void }> = [];

  /** Data event callback — set by consumer. */
  private _onDataCallback: ((data: string) => void) | undefined;
  /** Exit event callback — set by consumer. */
  private _onExitCallback: ((code: number) => void) | undefined;

  get isAlive(): boolean {
    return this._isAlive;
  }

  get pid(): number | undefined {
    return this._ptyProcess?.pid;
  }

  constructor(id: string) {
    this.id = id;
  }

  // ─── Event Setters ──────────────────────────────────────────────

  set onData(callback: ((data: string) => void) | undefined) {
    this._onDataCallback = callback;
  }

  set onExit(callback: ((code: number) => void) | undefined) {
    this._onExitCallback = callback;
  }

  // ─── Core Operations ────────────────────────────────────────────

  /**
   * Spawn a new PTY process.
   *
   * @param nodePty - The loaded node-pty module (from PtyManager.loadNodePty())
   * @param shell - Path to the shell executable
   * @param args - Shell arguments (e.g., ['--login'])
   * @param options - PTY fork options (cols, rows, cwd, env)
   */
  spawn(
    nodePty: NodePtyModule,
    shell: string,
    args: string[],
    options: { cols?: number; rows?: number; cwd?: string; env?: Record<string, string> },
  ): void {
    if (this._isAlive) {
      console.warn(`[AnyWhere Terminal] PtySession ${this.id}: spawn() called while already alive`);
      return;
    }

    // Prevent re-spawning on a previously used session — create a new PtySession instead
    if (this._hasSpawned) {
      console.warn(`[AnyWhere Terminal] PtySession ${this.id}: spawn() called on already-used session`);
      return;
    }

    const ptyOptions: PtyForkOptions = {
      name: "xterm-256color",
      cols: Math.max(1, options.cols ?? 80),
      rows: Math.max(1, options.rows ?? 30),
      cwd: options.cwd,
      env: options.env,
    };

    this._ptyProcess = nodePty.spawn(shell, args, ptyOptions);
    this._isAlive = true;
    this._isShuttingDown = false;
    this._hasSpawned = true;

    // Wire data events
    const dataDisposable = this._ptyProcess.onData((data: string) => {
      // During shutdown (before kill sent), reset the flush timer on each data event.
      // Once _killSent is true, stop resetting — we're past the flush phase.
      if (this._isShuttingDown && !this._killSent) {
        this._resetFlushTimer();
      }
      this._onDataCallback?.(data);
    });
    this._disposables.push(dataDisposable);

    // Wire exit events
    const exitDisposable = this._ptyProcess.onExit((e: { exitCode: number; signal?: number }) => {
      this._isAlive = false;
      this._isShuttingDown = false;
      this._clearTimers();

      // Dispose event subscriptions to prevent leaks
      for (const d of this._disposables) {
        d.dispose();
      }
      this._disposables = [];
      this._ptyProcess = undefined;

      this._onExitCallback?.(e.exitCode);
    });
    this._disposables.push(exitDisposable);
  }

  /**
   * Write data to the PTY process.
   * No-op if the process is not alive or is shutting down.
   */
  write(data: string): void {
    if (!this._isAlive || this._isShuttingDown || !this._ptyProcess) {
      return;
    }
    this._ptyProcess.write(data);
  }

  /**
   * Resize the PTY process.
   * Cols and rows are clamped to a minimum of 1.
   * No-op if the process is not alive.
   */
  resize(cols: number, rows: number): void {
    if (!this._isAlive || !this._ptyProcess) {
      return;
    }
    this._ptyProcess.resize(Math.max(1, cols), Math.max(1, rows));
  }

  /**
   * Initiate graceful shutdown of the PTY process.
   *
   * Sequence (from VS Code's TerminalProcess.shutdown()):
   * 1. Stop accepting new input (_isShuttingDown = true)
   * 2. Wait for data flush (250ms after last onData event)
   * 3. Call pty.kill() (sends SIGHUP on macOS)
   * 4. If process doesn't exit within 5s, force-kill with SIGKILL
   */
  kill(): void {
    if (!this._isAlive || !this._ptyProcess) {
      return;
    }

    if (this._isShuttingDown) {
      return; // Already shutting down
    }

    this._isShuttingDown = true;

    // Start the data flush timer (resets on each onData event)
    this._resetFlushTimer();

    // Hard deadline: if data never quiesces, force kill after MAX_GRACE_PERIOD_MS
    this._graceTimer = setTimeout(() => {
      this._graceTimer = undefined;
      if (this._isAlive) {
        if (this._flushTimer) {
          clearTimeout(this._flushTimer);
          this._flushTimer = undefined;
        }
        this._executeKill();
      }
    }, MAX_GRACE_PERIOD_MS);
  }

  /**
   * Dispose all resources. Kills the process immediately if still alive.
   */
  dispose(): void {
    this._clearTimers();

    if (this._isAlive && this._ptyProcess) {
      try {
        this._ptyProcess.kill();
      } catch {
        // Process may already be dead
      }
    }

    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];

    this._ptyProcess = undefined;
    this._isAlive = false;
    this._isShuttingDown = false;
    this._onDataCallback = undefined;
    this._onExitCallback = undefined;
  }

  // ─── Private Helpers ────────────────────────────────────────────

  /**
   * Reset the data flush timer. Called during shutdown on each onData event.
   * After 250ms of quiet (no data), proceeds to kill the process.
   */
  private _resetFlushTimer(): void {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
    }

    this._flushTimer = setTimeout(() => {
      this._flushTimer = undefined;
      this._executeKill();
    }, DATA_FLUSH_TIMEOUT_MS);
  }

  /**
   * Execute the actual kill after data flush timeout.
   * Sends SIGHUP (default on macOS), then starts force-kill timer.
   * Idempotent — safe to call multiple times (grace timer + flush timer may both trigger).
   */
  private _executeKill(): void {
    if (this._killSent || !this._ptyProcess || !this._isAlive) {
      return;
    }

    this._killSent = true;

    // Clear remaining shutdown timers (grace timer, flush timer)
    if (this._graceTimer) {
      clearTimeout(this._graceTimer);
      this._graceTimer = undefined;
    }
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = undefined;
    }

    try {
      this._ptyProcess.kill();
    } catch {
      // Process may already be dead
    }

    // Start force-kill timer in case process doesn't exit cleanly
    this._forceKillTimer = setTimeout(() => {
      this._forceKillTimer = undefined;
      if (this._isAlive && this._ptyProcess) {
        try {
          this._ptyProcess.kill("SIGKILL");
        } catch {
          // Process may already be dead
        }
      }
    }, MAX_SHUTDOWN_TIME_MS);
  }

  /**
   * Clear all shutdown-related timers.
   */
  private _clearTimers(): void {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = undefined;
    }
    if (this._forceKillTimer) {
      clearTimeout(this._forceKillTimer);
      this._forceKillTimer = undefined;
    }
    if (this._graceTimer) {
      clearTimeout(this._graceTimer);
      this._graceTimer = undefined;
    }
  }
}
