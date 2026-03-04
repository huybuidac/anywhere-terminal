// src/types/errors.test.ts — Unit tests for custom error classes
import { describe, expect, it } from "vitest";
import {
  AnyWhereTerminalError,
  CwdNotFoundError,
  ErrorCode,
  PtyLoadError,
  SessionNotFoundError,
  ShellNotFoundError,
  SpawnError,
  WebViewDisposedError,
} from "./errors";

// ─── ErrorCode enum ─────────────────────────────────────────────────

describe("ErrorCode", () => {
  it("contains all expected values", () => {
    expect(ErrorCode.PtyLoadFailed).toBe("PTY_LOAD_FAILED");
    expect(ErrorCode.ShellNotFound).toBe("SHELL_NOT_FOUND");
    expect(ErrorCode.SpawnFailed).toBe("SPAWN_FAILED");
    expect(ErrorCode.CwdNotFound).toBe("CWD_NOT_FOUND");
    expect(ErrorCode.WebViewDisposed).toBe("WEBVIEW_DISPOSED");
    expect(ErrorCode.SessionNotFound).toBe("SESSION_NOT_FOUND");
    expect(ErrorCode.BufferOverflow).toBe("BUFFER_OVERFLOW");
  });

  it("has 7 members", () => {
    const values = Object.values(ErrorCode);
    expect(values).toHaveLength(7);
  });
});

// ─── AnyWhereTerminalError (base) ───────────────────────────────────

describe("AnyWhereTerminalError", () => {
  it("sets message, code, and name", () => {
    const err = new AnyWhereTerminalError("test error", ErrorCode.PtyLoadFailed);
    expect(err.message).toBe("test error");
    expect(err.code).toBe(ErrorCode.PtyLoadFailed);
    expect(err.name).toBe("AnyWhereTerminalError");
  });

  it("is instanceof Error", () => {
    const err = new AnyWhereTerminalError("test", ErrorCode.SpawnFailed);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AnyWhereTerminalError);
  });
});

// ─── PtyLoadError ───────────────────────────────────────────────────

describe("PtyLoadError", () => {
  const paths = ["/app/node_modules.asar/node-pty", "/app/node_modules/node-pty"];

  it("formats message with attempted paths", () => {
    const err = new PtyLoadError(paths);
    expect(err.message).toContain(paths[0]);
    expect(err.message).toContain(paths[1]);
  });

  it("stores attemptedPaths", () => {
    const err = new PtyLoadError(paths);
    expect(err.attemptedPaths).toBe(paths);
  });

  it("has correct code and name", () => {
    const err = new PtyLoadError(paths);
    expect(err.code).toBe(ErrorCode.PtyLoadFailed);
    expect(err.name).toBe("PtyLoadError");
  });

  it("is instanceof AnyWhereTerminalError and Error", () => {
    const err = new PtyLoadError(paths);
    expect(err).toBeInstanceOf(AnyWhereTerminalError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── ShellNotFoundError ─────────────────────────────────────────────

describe("ShellNotFoundError", () => {
  const shells = ["/bin/zsh", "/bin/bash", "/bin/sh"];

  it("formats message with attempted shells", () => {
    const err = new ShellNotFoundError(shells);
    expect(err.message).toContain("/bin/zsh");
    expect(err.message).toContain("/bin/bash");
    expect(err.message).toContain("/bin/sh");
  });

  it("stores attemptedShells", () => {
    const err = new ShellNotFoundError(shells);
    expect(err.attemptedShells).toBe(shells);
  });

  it("has correct code and name", () => {
    const err = new ShellNotFoundError(shells);
    expect(err.code).toBe(ErrorCode.ShellNotFound);
    expect(err.name).toBe("ShellNotFoundError");
  });

  it("is instanceof AnyWhereTerminalError and Error", () => {
    const err = new ShellNotFoundError(shells);
    expect(err).toBeInstanceOf(AnyWhereTerminalError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── SpawnError ─────────────────────────────────────────────────────

describe("SpawnError", () => {
  it("includes shell path and cause message", () => {
    const cause = new Error("Permission denied");
    const err = new SpawnError("/bin/zsh", cause);
    expect(err.message).toContain("/bin/zsh");
    expect(err.message).toContain("Permission denied");
  });

  it("stores shellPath and cause", () => {
    const cause = new Error("fail");
    const err = new SpawnError("/bin/bash", cause);
    expect(err.shellPath).toBe("/bin/bash");
    expect(err.cause).toBe(cause);
  });

  it("has correct code and name", () => {
    const err = new SpawnError("/bin/zsh", new Error("fail"));
    expect(err.code).toBe(ErrorCode.SpawnFailed);
    expect(err.name).toBe("SpawnError");
  });

  it("is instanceof AnyWhereTerminalError and Error", () => {
    const err = new SpawnError("/bin/zsh", new Error("fail"));
    expect(err).toBeInstanceOf(AnyWhereTerminalError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── CwdNotFoundError ───────────────────────────────────────────────

describe("CwdNotFoundError", () => {
  it("includes cwd and fallback paths in message", () => {
    const err = new CwdNotFoundError("/missing/path", "/home/user");
    expect(err.message).toContain("/missing/path");
    expect(err.message).toContain("/home/user");
  });

  it("stores cwdPath and fallbackPath", () => {
    const err = new CwdNotFoundError("/missing", "/fallback");
    expect(err.cwdPath).toBe("/missing");
    expect(err.fallbackPath).toBe("/fallback");
  });

  it("has correct code and name", () => {
    const err = new CwdNotFoundError("/a", "/b");
    expect(err.code).toBe(ErrorCode.CwdNotFound);
    expect(err.name).toBe("CwdNotFoundError");
  });

  it("is instanceof AnyWhereTerminalError and Error", () => {
    const err = new CwdNotFoundError("/a", "/b");
    expect(err).toBeInstanceOf(AnyWhereTerminalError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── WebViewDisposedError ───────────────────────────────────────────

describe("WebViewDisposedError", () => {
  it("includes viewId in message", () => {
    const err = new WebViewDisposedError("anywhereTerminal.sidebar");
    expect(err.message).toContain("anywhereTerminal.sidebar");
  });

  it("stores viewId", () => {
    const err = new WebViewDisposedError("test-view");
    expect(err.viewId).toBe("test-view");
  });

  it("has correct code and name", () => {
    const err = new WebViewDisposedError("v1");
    expect(err.code).toBe(ErrorCode.WebViewDisposed);
    expect(err.name).toBe("WebViewDisposedError");
  });

  it("is instanceof AnyWhereTerminalError and Error", () => {
    const err = new WebViewDisposedError("v1");
    expect(err).toBeInstanceOf(AnyWhereTerminalError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── SessionNotFoundError ───────────────────────────────────────────

describe("SessionNotFoundError", () => {
  it("includes sessionId in message", () => {
    const err = new SessionNotFoundError("session-123");
    expect(err.message).toContain("session-123");
  });

  it("stores sessionId", () => {
    const err = new SessionNotFoundError("s-abc");
    expect(err.sessionId).toBe("s-abc");
  });

  it("has correct code and name", () => {
    const err = new SessionNotFoundError("s1");
    expect(err.code).toBe(ErrorCode.SessionNotFound);
    expect(err.name).toBe("SessionNotFoundError");
  });

  it("is instanceof AnyWhereTerminalError and Error", () => {
    const err = new SessionNotFoundError("s1");
    expect(err).toBeInstanceOf(AnyWhereTerminalError);
    expect(err).toBeInstanceOf(Error);
  });
});
