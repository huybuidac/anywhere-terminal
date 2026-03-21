// src/types/errors.test.ts — Unit tests for custom error classes
import { describe, expect, it } from "vitest";
import { AnyWhereTerminalError, ErrorCode, PtyLoadError, ShellNotFoundError } from "./errors";

// ─── ErrorCode enum ─────────────────────────────────────────────────

describe("ErrorCode", () => {
  it("contains all expected values", () => {
    expect(ErrorCode.PtyLoadFailed).toBe("PTY_LOAD_FAILED");
    expect(ErrorCode.ShellNotFound).toBe("SHELL_NOT_FOUND");
    expect(ErrorCode.BufferOverflow).toBe("BUFFER_OVERFLOW");
  });

  it("has 3 members", () => {
    const values = Object.values(ErrorCode);
    expect(values).toHaveLength(3);
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
    const err = new AnyWhereTerminalError("test", ErrorCode.PtyLoadFailed);
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
