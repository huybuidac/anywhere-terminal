// src/settings/SettingsReader.test.ts — Unit tests for SettingsReader
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAll, __setConfigValues, __setWorkspaceFolders } from "../test/__mocks__/vscode";
import { affectsTerminalConfig, readTerminalConfig, readTerminalSettings } from "./SettingsReader";

// Mock node:fs for PtyManager's detectShell
vi.mock("node:fs", () => {
  return {
    default: {
      statSync: vi.fn(),
    },
    statSync: vi.fn(),
  };
});

import * as fs from "node:fs";

const mockedStatSync = vi.mocked(fs.statSync);

// ─── Test Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  __resetAll();
  vi.clearAllMocks();
  // Default: make /bin/zsh exist for shell detection
  mockedStatSync.mockImplementation((p) => {
    const pathStr = typeof p === "string" ? p : p.toString();
    if (pathStr === "/bin/zsh" || pathStr === "/bin/bash" || pathStr === "/bin/sh") {
      return { isFile: () => true, mode: 0o755 } as unknown as fs.Stats;
    }
    throw new Error("ENOENT");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Font Size Resolution ───────────────────────────────────────────

describe("readTerminalSettings — font size resolution", () => {
  it("uses anywhereTerminal.fontSize when > 0", () => {
    __setConfigValues({ "anywhereTerminal.fontSize": 18 });
    const settings = readTerminalSettings();
    expect(settings.fontSize).toBe(18);
  });

  it("falls back to terminal.integrated.fontSize when extension fontSize is 0", () => {
    __setConfigValues({
      "anywhereTerminal.fontSize": 0,
      "terminal.integrated.fontSize": 16,
    });
    const settings = readTerminalSettings();
    expect(settings.fontSize).toBe(16);
  });

  it("falls back to editor.fontSize when both extension and terminal fontSize are 0", () => {
    __setConfigValues({
      "anywhereTerminal.fontSize": 0,
      "terminal.integrated.fontSize": 0,
      "editor.fontSize": 20,
    });
    const settings = readTerminalSettings();
    expect(settings.fontSize).toBe(20);
  });

  it("uses default 14 when all font sizes are 0 or unset", () => {
    __setConfigValues({});
    const settings = readTerminalSettings();
    expect(settings.fontSize).toBe(14);
  });

  it("clamps font size to minimum 6", () => {
    __setConfigValues({ "anywhereTerminal.fontSize": 2 });
    const settings = readTerminalSettings();
    expect(settings.fontSize).toBe(6);
  });

  it("clamps font size to maximum 100", () => {
    __setConfigValues({ "anywhereTerminal.fontSize": 200 });
    const settings = readTerminalSettings();
    expect(settings.fontSize).toBe(100);
  });

  it("clamps font size at exactly 6", () => {
    __setConfigValues({ "anywhereTerminal.fontSize": 6 });
    const settings = readTerminalSettings();
    expect(settings.fontSize).toBe(6);
  });

  it("clamps font size at exactly 100", () => {
    __setConfigValues({ "anywhereTerminal.fontSize": 100 });
    const settings = readTerminalSettings();
    expect(settings.fontSize).toBe(100);
  });
});

// ─── Font Family Resolution ─────────────────────────────────────────

describe("readTerminalSettings — font family resolution", () => {
  it("uses anywhereTerminal.fontFamily when non-empty", () => {
    __setConfigValues({ "anywhereTerminal.fontFamily": "Fira Code" });
    const settings = readTerminalSettings();
    expect(settings.fontFamily).toBe("Fira Code");
  });

  it("falls back to terminal.integrated.fontFamily when extension fontFamily is empty", () => {
    __setConfigValues({
      "anywhereTerminal.fontFamily": "",
      "terminal.integrated.fontFamily": "JetBrains Mono",
    });
    const settings = readTerminalSettings();
    expect(settings.fontFamily).toBe("JetBrains Mono");
  });

  it("falls back to editor.fontFamily when both extension and terminal fontFamily are empty", () => {
    __setConfigValues({
      "anywhereTerminal.fontFamily": "",
      "terminal.integrated.fontFamily": "",
      "editor.fontFamily": "Cascadia Code",
    });
    const settings = readTerminalSettings();
    expect(settings.fontFamily).toBe("Cascadia Code");
  });

  it("uses default 'monospace' when all font families are empty or unset", () => {
    __setConfigValues({});
    const settings = readTerminalSettings();
    expect(settings.fontFamily).toBe("monospace");
  });

  it("trims whitespace from font family", () => {
    __setConfigValues({ "anywhereTerminal.fontFamily": "  Fira Code  " });
    const settings = readTerminalSettings();
    expect(settings.fontFamily).toBe("Fira Code");
  });
});

// ─── Other Settings ─────────────────────────────────────────────────

describe("readTerminalSettings — other settings", () => {
  it("reads cursorBlink with default true", () => {
    __setConfigValues({});
    const settings = readTerminalSettings();
    expect(settings.cursorBlink).toBe(true);
  });

  it("reads cursorBlink when set to false", () => {
    __setConfigValues({ "anywhereTerminal.cursorBlink": false });
    const settings = readTerminalSettings();
    expect(settings.cursorBlink).toBe(false);
  });

  it("reads scrollback with default 10000", () => {
    __setConfigValues({});
    const settings = readTerminalSettings();
    expect(settings.scrollback).toBe(10000);
  });

  it("reads custom scrollback value", () => {
    __setConfigValues({ "anywhereTerminal.scrollback": 5000 });
    const settings = readTerminalSettings();
    expect(settings.scrollback).toBe(5000);
  });
});

// ─── Shell Resolution ───────────────────────────────────────────────

describe("readTerminalSettings — shell resolution", () => {
  it("uses custom shell when configured", () => {
    __setConfigValues({ "anywhereTerminal.shell.macOS": "/usr/local/bin/fish" });
    const settings = readTerminalSettings();
    expect(settings.shell).toBe("/usr/local/bin/fish");
  });

  it("auto-detects shell when custom shell is empty", () => {
    __setConfigValues({ "anywhereTerminal.shell.macOS": "" });
    const settings = readTerminalSettings();
    // Should detect from $SHELL or fallback chain
    expect(settings.shell).toBeTruthy();
  });

  it("uses custom args when configured with custom shell", () => {
    __setConfigValues({
      "anywhereTerminal.shell.macOS": "/usr/local/bin/fish",
      "anywhereTerminal.shell.args": ["-l", "--init-command", "echo hi"],
    });
    const settings = readTerminalSettings();
    expect(settings.shellArgs).toEqual(["-l", "--init-command", "echo hi"]);
  });

  it("uses detected args when custom args are empty", () => {
    __setConfigValues({
      "anywhereTerminal.shell.macOS": "",
      "anywhereTerminal.shell.args": [],
    });
    const settings = readTerminalSettings();
    // Should use detected shell's default args
    expect(settings.shellArgs).toBeDefined();
  });
});

// ─── CWD Resolution ─────────────────────────────────────────────────

describe("readTerminalSettings — CWD resolution", () => {
  it("uses custom CWD when configured and valid directory", () => {
    mockedStatSync.mockImplementation((p) => {
      const pathStr = typeof p === "string" ? p : p.toString();
      if (pathStr === "/tmp/my-project") {
        return { isFile: () => false, isDirectory: () => true, mode: 0o755 } as unknown as fs.Stats;
      }
      // Default: shells exist
      if (pathStr === "/bin/zsh" || pathStr === "/bin/bash" || pathStr === "/bin/sh") {
        return { isFile: () => true, mode: 0o755 } as unknown as fs.Stats;
      }
      throw new Error("ENOENT");
    });
    __setConfigValues({ "anywhereTerminal.defaultCwd": "/tmp/my-project" });
    const settings = readTerminalSettings();
    expect(settings.cwd).toBe("/tmp/my-project");
  });

  it("falls back to workspace root when CWD is empty", () => {
    __setConfigValues({ "anywhereTerminal.defaultCwd": "" });
    __setWorkspaceFolders([{ uri: { fsPath: "/projects/my-app" } }]);
    const settings = readTerminalSettings();
    expect(settings.cwd).toBe("/projects/my-app");
  });

  it("falls back to home directory when no workspace and no custom CWD", () => {
    __setConfigValues({ "anywhereTerminal.defaultCwd": "" });
    __setWorkspaceFolders(undefined);
    const settings = readTerminalSettings();
    expect(settings.cwd).toBe(os.homedir());
  });

  it("falls back to workspace root when custom CWD is invalid path", () => {
    mockedStatSync.mockImplementation((p) => {
      const pathStr = typeof p === "string" ? p : p.toString();
      if (pathStr === "/nonexistent/path") {
        throw new Error("ENOENT");
      }
      // Default: shells exist
      if (pathStr === "/bin/zsh" || pathStr === "/bin/bash" || pathStr === "/bin/sh") {
        return { isFile: () => true, mode: 0o755 } as unknown as fs.Stats;
      }
      throw new Error("ENOENT");
    });
    __setConfigValues({ "anywhereTerminal.defaultCwd": "/nonexistent/path" });
    __setWorkspaceFolders([{ uri: { fsPath: "/projects/my-app" } }]);
    const settings = readTerminalSettings();
    expect(settings.cwd).toBe("/projects/my-app");
  });

  it("falls back when custom CWD is a file, not a directory", () => {
    mockedStatSync.mockImplementation((p) => {
      const pathStr = typeof p === "string" ? p : p.toString();
      if (pathStr === "/tmp/some-file.txt") {
        return { isFile: () => true, isDirectory: () => false, mode: 0o644 } as unknown as fs.Stats;
      }
      // Default: shells exist
      if (pathStr === "/bin/zsh" || pathStr === "/bin/bash" || pathStr === "/bin/sh") {
        return { isFile: () => true, mode: 0o755 } as unknown as fs.Stats;
      }
      throw new Error("ENOENT");
    });
    __setConfigValues({ "anywhereTerminal.defaultCwd": "/tmp/some-file.txt" });
    __setWorkspaceFolders(undefined);
    const settings = readTerminalSettings();
    expect(settings.cwd).toBe(os.homedir());
  });
});

// ─── readTerminalConfig ─────────────────────────────────────────────

describe("readTerminalConfig", () => {
  it("returns only TerminalConfig fields", () => {
    __setConfigValues({
      "anywhereTerminal.fontSize": 16,
      "anywhereTerminal.fontFamily": "Fira Code",
      "anywhereTerminal.cursorBlink": false,
      "anywhereTerminal.scrollback": 5000,
    });
    const config = readTerminalConfig();
    expect(config).toEqual({
      fontSize: 16,
      fontFamily: "Fira Code",
      cursorBlink: false,
      scrollback: 5000,
    });
    // Should NOT have shell/cwd fields
    expect("shell" in config).toBe(false);
    expect("cwd" in config).toBe(false);
  });
});

// ─── affectsTerminalConfig ──────────────────────────────────────────

describe("affectsTerminalConfig", () => {
  const makeEvent = (sections: string[]) => ({
    affectsConfiguration: (section: string) => sections.some((s) => s === section || s.startsWith(`${section}.`)),
  });

  it("returns true for anywhereTerminal changes", () => {
    expect(affectsTerminalConfig(makeEvent(["anywhereTerminal.fontSize"]))).toBe(true);
  });

  it("returns true for editor.fontSize changes", () => {
    expect(affectsTerminalConfig(makeEvent(["editor.fontSize"]))).toBe(true);
  });

  it("returns true for editor.fontFamily changes", () => {
    expect(affectsTerminalConfig(makeEvent(["editor.fontFamily"]))).toBe(true);
  });

  it("returns true for terminal.integrated.fontSize changes", () => {
    expect(affectsTerminalConfig(makeEvent(["terminal.integrated.fontSize"]))).toBe(true);
  });

  it("returns true for terminal.integrated.fontFamily changes", () => {
    expect(affectsTerminalConfig(makeEvent(["terminal.integrated.fontFamily"]))).toBe(true);
  });

  it("returns false for unrelated changes", () => {
    expect(affectsTerminalConfig(makeEvent(["editor.wordWrap"]))).toBe(false);
  });

  it("returns false for completely unrelated section", () => {
    expect(affectsTerminalConfig(makeEvent(["workbench.colorTheme"]))).toBe(false);
  });
});
