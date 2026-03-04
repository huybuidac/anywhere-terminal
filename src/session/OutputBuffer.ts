// src/session/OutputBuffer.ts — Output buffering + flow control for PTY → WebView
// See: docs/design/output-buffering.md, specs/output-buffer/spec.md

// ─── Interfaces ─────────────────────────────────────────────────────

/** Minimal interface for PTY flow control (pause/resume). */
export interface FlowControllable {
  pause(): void;
  resume(): void;
}

/** Minimal interface for sending messages to the webview. */
export interface MessageSender {
  postMessage(message: unknown): Thenable<boolean>;
}

// ─── Constants ──────────────────────────────────────────────────────

/** Flush interval in milliseconds. Compromise between VS Code (5ms) and reference (16ms). */
const FLUSH_INTERVAL_MS = 8;

/** Maximum buffer size in characters (string .length). Triggers immediate flush. */
const MAX_BUFFER_SIZE = 65_536;

/** Maximum number of chunks in the buffer array. Safety cap. */
const MAX_CHUNKS = 100;

/** Pause PTY when this many chars are unacknowledged by the webview. */
const HIGH_WATERMARK_CHARS = 100_000;

/** Resume PTY when unacked drops below this. */
const LOW_WATERMARK_CHARS = 5_000;

// ─── OutputBuffer ───────────────────────────────────────────────────

/**
 * Coalesces rapid PTY output into fewer, larger postMessage calls
 * and implements watermark-based flow control.
 *
 * Lifecycle: created per PTY session, disposed when session ends.
 *
 * See: docs/design/output-buffering.md
 */
export class OutputBuffer {
  /** Buffer of PTY output chunks, joined on flush. */
  private _chunks: string[] = [];
  /** Total character count of all chunks in buffer. */
  private _bufferSize = 0;

  /** Characters sent to webview but not yet acknowledged. */
  private _unackedCharCount = 0;
  /** Whether the PTY is currently paused due to backpressure. */
  private _isPaused = false;

  /** One-shot flush timer. Started on first append, cleared after flush or on dispose. */
  private _flushTimer: ReturnType<typeof setTimeout> | undefined;
  /** Whether this buffer has been disposed. */
  private _disposed = false;

  /** Accessor for testing: current unacked char count. */
  get unackedCharCount(): number {
    return this._unackedCharCount;
  }

  /** Accessor for testing: whether PTY is paused. */
  get isPaused(): boolean {
    return this._isPaused;
  }

  constructor(
    /** Tab/session ID for output messages. */
    private readonly _tabId: string,
    /** Webview to send output messages to. */
    private readonly _webview: MessageSender,
    /** PTY process for pause/resume flow control. */
    private readonly _pty: FlowControllable,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────

  /**
   * Append PTY output data to the buffer.
   * May trigger immediate flush if buffer exceeds size or chunk limits.
   */
  append(data: string): void {
    if (this._disposed) {
      return;
    }

    this._chunks.push(data);
    this._bufferSize += data.length;

    // Start a one-shot flush timer on first data (or if no timer is pending)
    if (!this._flushTimer) {
      this._flushTimer = setTimeout(() => {
        this._flushTimer = undefined;
        this._flush();
      }, FLUSH_INTERVAL_MS);
    }

    // Immediate flush if buffer exceeds size or chunk limits
    if (this._bufferSize >= MAX_BUFFER_SIZE || this._chunks.length >= MAX_CHUNKS) {
      this._flush();
    }
  }

  /**
   * Force-flush all buffered data. Used on PTY exit.
   */
  flush(): void {
    this._flush();
  }

  /**
   * Handle acknowledgment from the webview (flow control).
   * Decreases unacked count and resumes PTY if below low watermark.
   */
  handleAck(charCount: number): void {
    if (this._disposed) {
      return;
    }

    // Validate input: must be a finite number >= 0
    const safeCount = Number.isFinite(charCount) && charCount > 0 ? charCount : 0;
    if (safeCount === 0) {
      return;
    }

    this._unackedCharCount = Math.max(0, this._unackedCharCount - safeCount);

    // Resume PTY if we've drained enough
    if (this._isPaused && this._unackedCharCount < LOW_WATERMARK_CHARS) {
      this._isPaused = false;
      this._pty.resume();
    }
  }

  /**
   * Dispose the buffer. Flushes remaining data (best-effort), clears timer.
   */
  dispose(): void {
    if (this._disposed) {
      return;
    }

    this._disposed = true;

    // Clear the flush timer
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = undefined;
    }

    // Best-effort final flush
    this._flush();

    // Reset state
    this._chunks = [];
    this._bufferSize = 0;
    this._unackedCharCount = 0;
    this._isPaused = false;
  }

  // ─── Private ────────────────────────────────────────────────────

  /**
   * Flush all buffered chunks to the webview as a single output message.
   */
  private _flush(): void {
    // Cancel pending timer since we're flushing now
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = undefined;
    }

    if (this._chunks.length === 0) {
      return;
    }

    const data = this._chunks.join("");
    this._chunks = [];
    this._bufferSize = 0;

    // Track unacked chars for flow control
    this._unackedCharCount += data.length;

    // Send to webview (best-effort — may fail if webview disposed)
    try {
      void this._webview.postMessage({ type: "output", tabId: this._tabId, data }).then(undefined, () => {
        // Async rejection — webview may be disposed
      });
    } catch {
      // Sync throw — webview may be disposed
    }

    // Check high watermark — pause PTY if needed (skip during dispose)
    if (!this._disposed && !this._isPaused && this._unackedCharCount > HIGH_WATERMARK_CHARS) {
      this._isPaused = true;
      this._pty.pause();
    }
  }
}
