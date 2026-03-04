// src/pty/PtyManager.test.ts — Unit tests for PtyManager functions
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAll, __setAppRoot, __setExtension, __setWorkspaceFolders } from "../test/__mocks__/vscode";
import { PtyLoadError, ShellNotFoundError } from "../types/errors";
import {
  _resetCache,
  buildEnvironment,
  detectShell,
  loadNodePty,
  resolveWorkingDirectory,
  validateShell,
} from "./PtyManager";

// Mock node:fs at module level so PtyManager's import resolves to the mock
vi.mock("node:fs", () => {
  return {
    default: {
      statSync: vi.fn(),
    },
    statSync: vi.fn(),
  };
});

// Import the mocked fs AFTER vi.mock declaration
import * as fs from "node:fs";

const mockedStatSync = vi.mocked(fs.statSync);

// ─── Test Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  __resetAll();
  _resetCache();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── validateShell ──────────────────────────────────────────────────

describe("validateShell", () => {
  it("returns true for an existing executable file", () => {
    mockedStatSync.mockReturnValue({
      isFile: () => true,
      mode: 0o755,
    } as unknown as fs.Stats);

    expect(validateShell("/bin/zsh")).toBe(true);
  });

  it("returns false for a non-existent path", () => {
    mockedStatSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(validateShell("/nonexistent/shell")).toBe(false);
  });

  it("returns false for a directory", () => {
    mockedStatSync.mockReturnValue({
      isFile: () => false,
      mode: 0o755,
    } as unknown as fs.Stats);

    expect(validateShell("/usr/bin")).toBe(false);
  });

  it("returns false for a file without execute permission", () => {
    mockedStatSync.mockReturnValue({
      isFile: () => true,
      mode: 0o644,
    } as unknown as fs.Stats);

    expect(validateShell("/bin/noexec")).toBe(false);
  });
});

// ─── detectShell ────────────────────────────────────────────────────

describe("detectShell", () => {
  function mockShellExists(validPaths: Set<string>) {
    mockedStatSync.mockImplementation((p) => {
      const pathStr = typeof p === "string" ? p : p.toString();
      if (validPaths.has(pathStr)) {
        return { isFile: () => true, mode: 0o755 } as unknown as fs.Stats;
      }
      throw new Error("ENOENT");
    });
  }

  it("returns $SHELL when valid", () => {
    const origShell = process.env.SHELL;
    process.env.SHELL = "/bin/zsh";
    mockShellExists(new Set(["/bin/zsh"]));

    try {
      const result = detectShell();
      expect(result.shell).toBe("/bin/zsh");
      expect(result.args).toEqual(["--login"]);
    } finally {
      if (origShell !== undefined) {
        process.env.SHELL = origShell;
      } else {
        delete process.env.SHELL;
      }
    }
  });

  /** Helper to safely restore process.env.SHELL after test */
  function restoreShell(origShell: string | undefined) {
    if (origShell !== undefined) {
      process.env.SHELL = origShell;
    } else {
      delete process.env.SHELL;
    }
  }

  it("falls back to /bin/bash when $SHELL is unset and /bin/zsh is missing", () => {
    const origShell = process.env.SHELL;
    delete process.env.SHELL;
    mockShellExists(new Set(["/bin/bash"]));

    try {
      const result = detectShell();
      expect(result.shell).toBe("/bin/bash");
      expect(result.args).toEqual(["--login"]);
    } finally {
      restoreShell(origShell);
    }
  });

  it("falls back to /bin/sh with no --login arg", () => {
    const origShell = process.env.SHELL;
    delete process.env.SHELL;
    mockShellExists(new Set(["/bin/sh"]));

    try {
      const result = detectShell();
      expect(result.shell).toBe("/bin/sh");
      expect(result.args).toEqual([]);
    } finally {
      restoreShell(origShell);
    }
  });

  it("throws ShellNotFoundError when no valid shell exists", () => {
    const origShell = process.env.SHELL;
    delete process.env.SHELL;
    mockShellExists(new Set());

    try {
      expect(() => detectShell()).toThrow(ShellNotFoundError);
    } finally {
      restoreShell(origShell);
    }
  });

  it("includes all attempted shells in ShellNotFoundError", () => {
    const origShell = process.env.SHELL;
    delete process.env.SHELL;
    mockShellExists(new Set());

    try {
      expect(() => detectShell()).toThrow(/\/bin\/zsh.*\/bin\/bash.*\/bin\/sh/);
    } finally {
      restoreShell(origShell);
    }
  });

  it("returns --login for /usr/local/bin/bash (basename check)", () => {
    const origShell = process.env.SHELL;
    process.env.SHELL = "/usr/local/bin/bash";
    mockShellExists(new Set(["/usr/local/bin/bash"]));

    try {
      const result = detectShell();
      expect(result.shell).toBe("/usr/local/bin/bash");
      expect(result.args).toEqual(["--login"]);
    } finally {
      restoreShell(origShell);
    }
  });
});

// ─── buildEnvironment ───────────────────────────────────────────────

describe("buildEnvironment", () => {
  it("sets TERM and COLORTERM", () => {
    const env = buildEnvironment();
    expect(env.TERM).toBe("xterm-256color");
    expect(env.COLORTERM).toBe("truecolor");
  });

  it("sets TERM_PROGRAM to AnyWhereTerminal", () => {
    const env = buildEnvironment();
    expect(env.TERM_PROGRAM).toBe("AnyWhereTerminal");
  });

  it("sets LANG to en_US.UTF-8 when LANG is not set", () => {
    const origLang = process.env.LANG;
    delete process.env.LANG;

    try {
      const env = buildEnvironment();
      expect(env.LANG).toBe("en_US.UTF-8");
    } finally {
      if (origLang !== undefined) {
        process.env.LANG = origLang;
      }
    }
  });

  it("preserves existing LANG when already set", () => {
    const origLang = process.env.LANG;
    process.env.LANG = "ja_JP.UTF-8";

    try {
      const env = buildEnvironment();
      expect(env.LANG).toBe("ja_JP.UTF-8");
    } finally {
      if (origLang !== undefined) {
        process.env.LANG = origLang;
      } else {
        delete process.env.LANG;
      }
    }
  });

  it("returns TERM_PROGRAM_VERSION from extension metadata", () => {
    // biome-ignore lint/style/useNamingConvention: matches VS Code Extension API shape
    __setExtension({ packageJSON: { version: "1.2.3" } });
    const env = buildEnvironment();
    expect(env.TERM_PROGRAM_VERSION).toBe("1.2.3");
  });

  it("falls back to 0.0.0 when extension is not found", () => {
    __setExtension(undefined);
    const env = buildEnvironment();
    expect(env.TERM_PROGRAM_VERSION).toBe("0.0.0");
  });

  it("filters out undefined values from process.env", () => {
    const env = buildEnvironment();
    for (const value of Object.values(env)) {
      expect(value).not.toBeUndefined();
    }
  });
});

// ─── resolveWorkingDirectory ────────────────────────────────────────

describe("resolveWorkingDirectory", () => {
  it("returns first workspace folder when available", () => {
    __setWorkspaceFolders([{ uri: { fsPath: "/projects/my-app" } }]);
    expect(resolveWorkingDirectory()).toBe("/projects/my-app");
  });

  it("returns first folder when multiple workspace folders exist", () => {
    __setWorkspaceFolders([{ uri: { fsPath: "/projects/first" } }, { uri: { fsPath: "/projects/second" } }]);
    expect(resolveWorkingDirectory()).toBe("/projects/first");
  });

  it("falls back to os.homedir() when no workspace folders", () => {
    __setWorkspaceFolders(undefined);
    expect(resolveWorkingDirectory()).toBe(os.homedir());
  });

  it("falls back to os.homedir() when workspace folders is empty array", () => {
    __setWorkspaceFolders([]);
    expect(resolveWorkingDirectory()).toBe(os.homedir());
  });
});

// ─── loadNodePty ────────────────────────────────────────────────────

describe("loadNodePty", () => {
  beforeEach(() => {
    _resetCache();
    __setAppRoot("/mock/vscode/app");
  });

  it("throws PtyLoadError when all candidate paths fail", () => {
    expect(() => loadNodePty()).toThrow(PtyLoadError);
  });

  it("includes attempted paths in PtyLoadError", () => {
    try {
      loadNodePty();
    } catch (err) {
      expect(err).toBeInstanceOf(PtyLoadError);
      const ptyErr = err as PtyLoadError;
      expect(ptyErr.attemptedPaths).toHaveLength(2);
      expect(ptyErr.attemptedPaths[0]).toContain("node_modules.asar/node-pty");
      expect(ptyErr.attemptedPaths[1]).toContain("node_modules/node-pty");
    }
  });

  it("_resetCache allows re-attempting load", () => {
    // First call fails
    expect(() => loadNodePty()).toThrow(PtyLoadError);
    // Reset and try again — should throw again (not return stale cache)
    _resetCache();
    expect(() => loadNodePty()).toThrow(PtyLoadError);
  });
});
