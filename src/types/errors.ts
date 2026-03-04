// src/types/errors.ts — Custom error classes for AnyWhere Terminal
// See: docs/design/error-handling.md

// ─── Error Codes ────────────────────────────────────────────────────

/** Error code enum for programmatic error handling. String enum for runtime inspection. */
export enum ErrorCode {
  PtyLoadFailed = "PTY_LOAD_FAILED",
  ShellNotFound = "SHELL_NOT_FOUND",
  SpawnFailed = "SPAWN_FAILED",
  CwdNotFound = "CWD_NOT_FOUND",
  WebViewDisposed = "WEBVIEW_DISPOSED",
  SessionNotFound = "SESSION_NOT_FOUND",
  BufferOverflow = "BUFFER_OVERFLOW",
}

// ─── Base Error ─────────────────────────────────────────────────────

/** Base class for all AnyWhere Terminal errors. */
export class AnyWhereTerminalError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
  ) {
    super(message);
    this.name = "AnyWhereTerminalError";
  }
}

// ─── Specific Errors ────────────────────────────────────────────────

/** node-pty could not be loaded from VS Code's internals. */
export class PtyLoadError extends AnyWhereTerminalError {
  constructor(
    /** Paths that were attempted */
    public readonly attemptedPaths: string[],
  ) {
    super(`Could not load node-pty. Tried: ${attemptedPaths.join(", ")}`, ErrorCode.PtyLoadFailed);
    this.name = "PtyLoadError";
  }
}

/** No valid shell executable could be found. */
export class ShellNotFoundError extends AnyWhereTerminalError {
  constructor(
    /** Shells that were tried */
    public readonly attemptedShells: string[],
  ) {
    super(`No valid shell found. Tried: ${attemptedShells.join(", ")}`, ErrorCode.ShellNotFound);
    this.name = "ShellNotFoundError";
  }
}

/** PTY spawn failed for a specific shell. */
export class SpawnError extends AnyWhereTerminalError {
  constructor(
    /** Shell path that failed */
    public readonly shellPath: string,
    /** Original error from node-pty */
    public readonly cause: Error,
  ) {
    super(`Failed to spawn shell: ${shellPath} — ${cause.message}`, ErrorCode.SpawnFailed);
    this.name = "SpawnError";
  }
}

/** Working directory does not exist. */
export class CwdNotFoundError extends AnyWhereTerminalError {
  constructor(
    /** Path that was not found */
    public readonly cwdPath: string,
    /** Fallback path that will be used */
    public readonly fallbackPath: string,
  ) {
    super(`Working directory not found: ${cwdPath}. Falling back to: ${fallbackPath}`, ErrorCode.CwdNotFound);
    this.name = "CwdNotFoundError";
  }
}

/** WebView was disposed during a postMessage attempt. */
export class WebViewDisposedError extends AnyWhereTerminalError {
  constructor(
    /** View ID that was disposed */
    public readonly viewId: string,
  ) {
    super(`WebView disposed: ${viewId}`, ErrorCode.WebViewDisposed);
    this.name = "WebViewDisposedError";
  }
}

/** A terminal session could not be found. */
export class SessionNotFoundError extends AnyWhereTerminalError {
  constructor(
    /** Session ID that was not found */
    public readonly sessionId: string,
  ) {
    super(`Session not found: ${sessionId}`, ErrorCode.SessionNotFound);
    this.name = "SessionNotFoundError";
  }
}
