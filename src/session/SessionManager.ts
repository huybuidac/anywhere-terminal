// src/session/SessionManager.ts — Central registry for all terminal sessions
// See: docs/design/session-manager.md

import * as crypto from "node:crypto";
import * as PtyManager from "../pty/PtyManager";
import { PtySession } from "../pty/PtySession";
import type { MessageSender } from "./OutputBuffer";
import { OutputBuffer } from "./OutputBuffer";

// ─── Constants ──────────────────────────────────────────────────────

/** Maximum total size of scrollback cache per session (in characters). Default 512KB. */
const SCROLLBACK_MAX_SIZE = 512 * 1024;

// ─── Data Model ─────────────────────────────────────────────────────

/** A single terminal session with its PTY, buffer, and metadata. */
export interface TerminalSession {
  /** Unique session identifier (UUID) */
  id: string;
  /** Which view this session belongs to (e.g., 'anywhereTerminal.sidebar') */
  viewId: string;
  /** The PTY process wrapper */
  pty: PtySession;
  /** Display name: "Terminal 1", "Terminal 2", etc. */
  name: string;
  /** Whether this is the active tab in its view */
  isActive: boolean;
  /** Assigned terminal number (for name and recycling) */
  number: number;
  /** Output buffer instance for this session */
  outputBuffer: OutputBuffer;
  /** Cached scrollback chunks for view restore */
  scrollbackCache: string[];
  /** Total character count across all scrollback chunks */
  scrollbackSize: number;
  /** Timestamp of session creation */
  createdAt: number;
  /** Current terminal columns */
  cols: number;
  /** Current terminal rows */
  rows: number;
  /** Per-session event subscriptions for cleanup */
  disposables: Array<{ dispose(): void }>;
  /** Webview message sender for this session */
  webview: MessageSender;
}

// ─── SessionManager ─────────────────────────────────────────────────

/**
 * Central registry for all terminal sessions across all views.
 *
 * Owns the lifecycle of each terminal session: creation, input/output routing,
 * resize, and destruction. Handles tab numbering with gap-filling recycling,
 * serializes destructive operations via operation queue, and maintains
 * scrollback cache for view restore.
 *
 * See: docs/design/session-manager.md
 */
export class SessionManager {
  /** All sessions indexed by session ID */
  private sessions = new Map<string, TerminalSession>();

  /** View ID → ordered list of session IDs */
  private viewSessions = new Map<string, string[]>();

  /** Set of terminal numbers currently in use (for recycling) */
  private usedNumbers = new Set<number>();

  /** Set of session IDs currently being killed (prevent re-entrant cleanup) */
  private terminalBeingKilled = new Set<string>();

  /** Serialized operation queue for destructive operations */
  private operationQueue: Promise<void> = Promise.resolve();

  /** Whether this manager has been disposed */
  private _disposed = false;

  // ─── Public API: Core CRUD ──────────────────────────────────────

  /**
   * Create a new terminal session for a view.
   *
   * Spawns a PTY, creates an OutputBuffer, wires events, and registers
   * the session in all maps. The new session becomes the active tab.
   *
   * @returns The session ID (UUID)
   */
  createSession(viewId: string, webview: MessageSender): string {
    const id = crypto.randomUUID();
    const number = this.findAvailableNumber();
    const name = `Terminal ${number}`;

    // Load PTY infrastructure
    const nodePty = PtyManager.loadNodePty();
    const { shell, args } = PtyManager.detectShell();
    const env = PtyManager.buildEnvironment();
    const cwd = PtyManager.resolveWorkingDirectory();

    // Spawn PTY
    const pty = new PtySession(id);
    pty.spawn(nodePty, shell, args, { cwd, env });

    // Create OutputBuffer
    const outputBuffer = new OutputBuffer(id, webview, pty);

    // Create session object
    const session: TerminalSession = {
      id,
      viewId,
      pty,
      name,
      isActive: true,
      number,
      outputBuffer,
      scrollbackCache: [],
      scrollbackSize: 0,
      createdAt: Date.now(),
      cols: 80,
      rows: 30,
      disposables: [],
      webview,
    };

    // Deactivate other sessions in the same view
    const viewSessionIds = this.viewSessions.get(viewId);
    if (viewSessionIds) {
      for (const sid of viewSessionIds) {
        const s = this.sessions.get(sid);
        if (s) {
          s.isActive = false;
        }
      }
    }

    // Register in maps
    this.sessions.set(id, session);
    if (!this.viewSessions.has(viewId)) {
      this.viewSessions.set(viewId, []);
    }
    this.viewSessions.get(viewId)!.push(id);

    // Wire PTY events
    pty.onData = (data: string) => {
      outputBuffer.append(data);
      this.appendToScrollback(session, data);
    };

    pty.onExit = (code: number) => {
      // If this is an intentional kill, skip cleanup (destroySession handles it)
      if (this.terminalBeingKilled.has(id)) {
        return;
      }

      // Unexpected crash — run cleanup and notify webview
      this.cleanupSession(id);
      this.safePostMessage(webview, { type: "exit", tabId: id, code });
    };

    return id;
  }

  /**
   * Write input data to a session's PTY.
   * Silently ignores calls with unknown session IDs.
   */
  writeToSession(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.pty.write(data);
  }

  /**
   * Resize a session's PTY and update stored dimensions.
   * Silently ignores calls with unknown session IDs.
   */
  resizeSession(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.pty.resize(cols, rows);
    session.cols = cols;
    session.rows = rows;
  }

  /**
   * Switch active session within a view.
   * Sets isActive=true on target, false on all others in the same view.
   * Silently ignores calls with unknown viewId or sessionId.
   */
  switchActiveSession(viewId: string, sessionId: string): void {
    const viewSessionIds = this.viewSessions.get(viewId);
    if (!viewSessionIds) {
      return;
    }

    // Verify the target session exists and belongs to this view
    if (!viewSessionIds.includes(sessionId)) {
      return;
    }

    for (const sid of viewSessionIds) {
      const s = this.sessions.get(sid);
      if (s) {
        s.isActive = sid === sessionId;
      }
    }
  }

  /**
   * Get tab info for a view (for init/restore messages).
   * Returns an empty array for unknown viewIds.
   */
  getTabsForView(viewId: string): Array<{ id: string; name: string; isActive: boolean }> {
    const viewSessionIds = this.viewSessions.get(viewId);
    if (!viewSessionIds) {
      return [];
    }

    return viewSessionIds
      .map((sid) => {
        const s = this.sessions.get(sid);
        if (!s) {
          return undefined;
        }
        return { id: s.id, name: s.name, isActive: s.isActive };
      })
      .filter((tab): tab is { id: string; name: string; isActive: boolean } => tab !== undefined);
  }

  /**
   * Get a session by ID.
   * Returns undefined if not found.
   */
  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Clear scrollback cache for a session.
   * Silently ignores calls with unknown session IDs.
   */
  clearScrollback(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.scrollbackCache = [];
    session.scrollbackSize = 0;
  }

  /**
   * Handle ack message for a session's output buffer.
   * Silently ignores calls with unknown session IDs.
   */
  handleAck(sessionId: string, charCount: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.outputBuffer.handleAck(charCount);
  }

  // ─── Public API: Destructive Operations (Queued) ────────────────

  /**
   * Destroy a session (queued, serialized via operation queue).
   */
  destroySession(sessionId: string): void {
    this.operationQueue = this.operationQueue
      .then(async () => {
        await this.performDestroy(sessionId);
      })
      .catch((err) => {
        console.error("[AnyWhere Terminal] Destroy operation failed:", err);
      });
  }

  /**
   * Destroy all sessions for a specific view (queued, serialized).
   */
  destroyAllForView(viewId: string): void {
    this.operationQueue = this.operationQueue
      .then(async () => {
        const viewSessionIds = this.viewSessions.get(viewId);
        if (!viewSessionIds) {
          return;
        }
        // Copy the array since performDestroy modifies viewSessions
        const ids = [...viewSessionIds];
        for (const sid of ids) {
          await this.performDestroy(sid);
        }
      })
      .catch((err) => {
        console.error("[AnyWhere Terminal] DestroyAllForView operation failed:", err);
      });
  }

  /**
   * Dispose the SessionManager. Kills all PTY processes and clears all state.
   * Registered in context.subscriptions for automatic cleanup on extension deactivation.
   */
  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    // Kill all PTY processes immediately (no queue — we're shutting down)
    for (const session of this.sessions.values()) {
      try {
        session.outputBuffer.dispose();
      } catch {
        // Best-effort
      }
      try {
        session.pty.kill();
      } catch {
        // Best-effort
      }
      for (const d of session.disposables) {
        try {
          d.dispose();
        } catch {
          // Best-effort
        }
      }
    }

    this.sessions.clear();
    this.viewSessions.clear();
    this.usedNumbers.clear();
    this.terminalBeingKilled.clear();
  }

  // ─── Private: Destroy Implementation ────────────────────────────

  /**
   * Perform the actual destruction of a session.
   * Called from the operation queue — guaranteed serial execution.
   */
  private async performDestroy(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return; // Already destroyed or never existed
    }

    // Mark as being killed to prevent re-entrant cleanup from onExit
    this.terminalBeingKilled.add(sessionId);

    // Flush and dispose the output buffer
    try {
      session.outputBuffer.dispose();
    } catch {
      // Best-effort
    }

    // Kill the PTY (graceful shutdown)
    try {
      session.pty.kill();
    } catch {
      // Best-effort
    }

    // Wait a tick for onExit to fire (it will be skipped due to terminalBeingKilled)
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // Clean up maps
    this.cleanupSession(sessionId);

    // Remove from kill tracking
    this.terminalBeingKilled.delete(sessionId);
  }

  // ─── Private: Cleanup ───────────────────────────────────────────

  /**
   * Remove a session from all maps and free its resources.
   */
  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Dispose per-session resources
    for (const d of session.disposables) {
      try {
        d.dispose();
      } catch {
        // Best-effort
      }
    }

    // Remove from maps
    this.sessions.delete(sessionId);
    this.usedNumbers.delete(session.number);

    const viewSessionIds = this.viewSessions.get(session.viewId);
    if (viewSessionIds) {
      const idx = viewSessionIds.indexOf(sessionId);
      if (idx !== -1) {
        viewSessionIds.splice(idx, 1);
      }
      if (viewSessionIds.length === 0) {
        this.viewSessions.delete(session.viewId);
      }
    }
  }

  // ─── Private: Number Recycling ──────────────────────────────────

  /**
   * Find the lowest available terminal number starting from 1.
   * Gap-filling algorithm: if numbers {1, 3} are in use, returns 2.
   */
  private findAvailableNumber(): number {
    for (let i = 1; ; i++) {
      if (!this.usedNumbers.has(i)) {
        this.usedNumbers.add(i);
        return i;
      }
    }
  }

  // ─── Private: Scrollback Cache ──────────────────────────────────

  /**
   * Append data to a session's scrollback cache with FIFO eviction.
   */
  private appendToScrollback(session: TerminalSession, data: string): void {
    session.scrollbackCache.push(data);
    session.scrollbackSize += data.length;

    // Evict oldest chunks until under limit
    while (session.scrollbackSize > SCROLLBACK_MAX_SIZE && session.scrollbackCache.length > 0) {
      const evicted = session.scrollbackCache.shift()!;
      session.scrollbackSize -= evicted.length;
    }
  }

  // ─── Private: Safe Message Posting ──────────────────────────────

  /**
   * Safely post a message to a webview, handling both sync throws and async rejections.
   */
  private safePostMessage(webview: MessageSender, message: unknown): void {
    try {
      void (webview.postMessage(message) as Thenable<boolean>).then(undefined, () => {
        // Async rejection — webview may be disposed
      });
    } catch {
      // Sync throw — webview may be disposed
    }
  }
}
