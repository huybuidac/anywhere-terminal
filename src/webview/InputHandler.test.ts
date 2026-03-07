// src/webview/InputHandler.test.ts — Unit tests for InputHandler
//
// Tests the extracted key event handler and paste logic with mocked dependencies.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ClipboardProvider,
  createKeyEventHandler,
  handlePaste,
  type KeyHandlerDeps,
  type TerminalLike,
} from "./InputHandler";

// ─── Helpers ────────────────────────────────────────────────────────

/** Create a mock TerminalLike with vi.fn() stubs. */
function createMockTerminal(): TerminalLike {
  return {
    hasSelection: vi.fn(() => false),
    getSelection: vi.fn(() => ""),
    clearSelection: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    selectAll: vi.fn(),
  };
}

/** Create a mock ClipboardProvider with vi.fn() stubs. */
function createMockClipboard(text = ""): ClipboardProvider {
  return {
    readText: vi.fn(() => Promise.resolve(text)),
    writeText: vi.fn(() => Promise.resolve()),
  };
}

/** Create a minimal KeyboardEvent-like object for testing. */
function makeKeyEvent(
  overrides: Partial<{
    type: string;
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
  }> = {},
): KeyboardEvent {
  return {
    type: "keydown",
    key: "a",
    metaKey: false,
    ctrlKey: false,
    ...overrides,
  } as unknown as KeyboardEvent;
}

/** Create default KeyHandlerDeps with mocks (macOS by default). */
function createDeps(overrides: Partial<KeyHandlerDeps> = {}): KeyHandlerDeps {
  return {
    terminal: createMockTerminal(),
    clipboard: createMockClipboard(),
    postMessage: vi.fn(),
    getActiveTabId: vi.fn(() => "tab-1"),
    getIsComposing: vi.fn(() => false),
    isMac: true,
    ...overrides,
  };
}

// ─── Setup ──────────────────────────────────────────────────────────

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── createKeyEventHandler ──────────────────────────────────────────

describe("createKeyEventHandler", () => {
  describe("event type filtering", () => {
    it("returns true for keyup events (ignored)", () => {
      const deps = createDeps();
      const handler = createKeyEventHandler(deps);
      const result = handler(makeKeyEvent({ type: "keyup", key: "c", metaKey: true }));
      expect(result).toBe(true);
    });

    it("returns true for keypress events (ignored)", () => {
      const deps = createDeps();
      const handler = createKeyEventHandler(deps);
      const result = handler(makeKeyEvent({ type: "keypress", key: "v", metaKey: true }));
      expect(result).toBe(true);
    });
  });

  describe("IME composition guard", () => {
    it("returns true for all events when composing", () => {
      const deps = createDeps({ getIsComposing: vi.fn(() => true) });
      const handler = createKeyEventHandler(deps);

      // Even Cmd+C during composition should pass through
      const result = handler(makeKeyEvent({ key: "c", metaKey: true }));
      expect(result).toBe(true);
      expect(deps.terminal.hasSelection).not.toHaveBeenCalled();
    });
  });

  describe("no-modifier passthrough", () => {
    it("returns true for regular keys without modifier", () => {
      const deps = createDeps();
      const handler = createKeyEventHandler(deps);
      const result = handler(makeKeyEvent({ key: "a" }));
      expect(result).toBe(true);
    });

    it("returns true for Enter without modifier", () => {
      const deps = createDeps();
      const handler = createKeyEventHandler(deps);
      const result = handler(makeKeyEvent({ key: "Enter" }));
      expect(result).toBe(true);
    });
  });

  describe("platform modifier", () => {
    it("uses metaKey on macOS", () => {
      const terminal = createMockTerminal();
      const deps = createDeps({ terminal, isMac: true });
      const handler = createKeyEventHandler(deps);

      // metaKey should trigger
      handler(makeKeyEvent({ key: "a", metaKey: true }));
      expect(terminal.selectAll).toHaveBeenCalled();
    });

    it("uses ctrlKey on non-macOS", () => {
      const terminal = createMockTerminal();
      const deps = createDeps({ terminal, isMac: false });
      const handler = createKeyEventHandler(deps);

      // ctrlKey should trigger on non-Mac
      handler(makeKeyEvent({ key: "a", ctrlKey: true }));
      expect(terminal.selectAll).toHaveBeenCalled();
    });

    it("ignores ctrlKey on macOS (passes through to xterm for SIGINT)", () => {
      const terminal = createMockTerminal();
      const deps = createDeps({ terminal, isMac: true });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "a", ctrlKey: true }));
      expect(result).toBe(true);
      expect(terminal.selectAll).not.toHaveBeenCalled();
    });
  });

  // ─── Cmd+C ──────────────────────────────────────────────────────

  describe("Cmd+C (copy / SIGINT)", () => {
    it("copies selection to clipboard when text is selected", () => {
      const terminal = createMockTerminal();
      vi.mocked(terminal.hasSelection).mockReturnValue(true);
      vi.mocked(terminal.getSelection).mockReturnValue("hello world");
      const clipboard = createMockClipboard();
      const deps = createDeps({ terminal, clipboard });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "c", metaKey: true }));

      expect(result).toBe(false);
      expect(clipboard.writeText).toHaveBeenCalledWith("hello world");
      expect(terminal.clearSelection).toHaveBeenCalled();
    });

    it("returns true (SIGINT) when no text is selected", () => {
      const terminal = createMockTerminal();
      vi.mocked(terminal.hasSelection).mockReturnValue(false);
      const clipboard = createMockClipboard();
      const deps = createDeps({ terminal, clipboard });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "c", metaKey: true }));

      expect(result).toBe(true);
      expect(clipboard.writeText).not.toHaveBeenCalled();
      expect(terminal.clearSelection).not.toHaveBeenCalled();
    });

    it("returns true (SIGINT) when hasSelection is true but getSelection returns empty string", () => {
      const terminal = createMockTerminal();
      vi.mocked(terminal.hasSelection).mockReturnValue(true);
      vi.mocked(terminal.getSelection).mockReturnValue("");
      const clipboard = createMockClipboard();
      const deps = createDeps({ terminal, clipboard });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "c", metaKey: true }));

      expect(result).toBe(true);
      expect(clipboard.writeText).not.toHaveBeenCalled();
      expect(terminal.clearSelection).not.toHaveBeenCalled();
    });

    it("handles clipboard write failure gracefully", () => {
      const terminal = createMockTerminal();
      vi.mocked(terminal.hasSelection).mockReturnValue(true);
      vi.mocked(terminal.getSelection).mockReturnValue("text");
      const clipboard = createMockClipboard();
      vi.mocked(clipboard.writeText).mockRejectedValue(new Error("clipboard denied"));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const deps = createDeps({ terminal, clipboard });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "c", metaKey: true }));

      // Should still return false (event consumed) even if clipboard write will fail
      expect(result).toBe(false);
      expect(terminal.clearSelection).toHaveBeenCalled();
      // The warn will fire asynchronously when the promise rejects
      return vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith("[AnyWhere Terminal] Clipboard write failed:", expect.any(Error));
      });
    });

    it("still clears selection when clipboard is undefined", () => {
      const terminal = createMockTerminal();
      vi.mocked(terminal.hasSelection).mockReturnValue(true);
      vi.mocked(terminal.getSelection).mockReturnValue("text");
      const deps = createDeps({ terminal, clipboard: undefined });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "c", metaKey: true }));

      expect(result).toBe(false);
      expect(terminal.clearSelection).toHaveBeenCalled();
    });

    it("works with uppercase C key", () => {
      const terminal = createMockTerminal();
      vi.mocked(terminal.hasSelection).mockReturnValue(false);
      const deps = createDeps({ terminal });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "C", metaKey: true }));
      expect(result).toBe(true); // SIGINT passthrough
    });
  });

  // ─── Cmd+V ──────────────────────────────────────────────────────

  describe("Cmd+V (paste)", () => {
    it("returns false and calls handlePaste when clipboard is available", () => {
      const deps = createDeps();
      const handler = createKeyEventHandler(deps);
      const result = handler(makeKeyEvent({ key: "v", metaKey: true }));
      expect(result).toBe(false);
    });

    it("returns false (native paste via browser) when clipboard is undefined", () => {
      const deps = createDeps({ clipboard: undefined });
      const handler = createKeyEventHandler(deps);
      const result = handler(makeKeyEvent({ key: "v", metaKey: true }));
      // Always returns false — xterm.js handles paste natively via browser paste event
      expect(result).toBe(false);
    });
  });

  // ─── Cmd+K ──────────────────────────────────────────────────────

  describe("Cmd+K (clear)", () => {
    it("clears terminal and sends clear message to extension", () => {
      const terminal = createMockTerminal();
      const postMessage = vi.fn();
      const deps = createDeps({
        terminal,
        postMessage,
        getActiveTabId: vi.fn(() => "tab-42"),
      });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "k", metaKey: true }));

      expect(result).toBe(false);
      expect(terminal.clear).toHaveBeenCalled();
      expect(postMessage).toHaveBeenCalledWith({ type: "clear", tabId: "tab-42" });
    });

    it("sends null tabId when no active tab", () => {
      const postMessage = vi.fn();
      const deps = createDeps({
        postMessage,
        getActiveTabId: vi.fn(() => null),
      });
      const handler = createKeyEventHandler(deps);

      handler(makeKeyEvent({ key: "k", metaKey: true }));

      expect(postMessage).toHaveBeenCalledWith({ type: "clear", tabId: null });
    });
  });

  // ─── Cmd+A ──────────────────────────────────────────────────────

  describe("Cmd+A (select all)", () => {
    it("calls selectAll and returns false", () => {
      const terminal = createMockTerminal();
      const deps = createDeps({ terminal });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "a", metaKey: true }));

      expect(result).toBe(false);
      expect(terminal.selectAll).toHaveBeenCalled();
    });
  });

  // ─── Cmd+Backspace ─────────────────────────────────────────────

  describe("Cmd+Backspace (kill line)", () => {
    it("sends Ctrl+U (\\x15) via postMessage and returns false on macOS", () => {
      const terminal = createMockTerminal();
      const postMessage = vi.fn();
      const deps = createDeps({ terminal, postMessage, isMac: true, getActiveTabId: vi.fn(() => "tab-7") });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "Backspace", metaKey: true }));

      expect(result).toBe(false);
      expect(postMessage).toHaveBeenCalledWith({ type: "input", tabId: "tab-7", data: "\x15" });
      expect(terminal.paste).not.toHaveBeenCalled();
    });

    it("sends Ctrl+U (\\x15) via postMessage and returns false on non-Mac (Ctrl+Backspace)", () => {
      const terminal = createMockTerminal();
      const postMessage = vi.fn();
      const deps = createDeps({ terminal, postMessage, isMac: false, getActiveTabId: vi.fn(() => "tab-3") });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "Backspace", ctrlKey: true }));

      expect(result).toBe(false);
      expect(postMessage).toHaveBeenCalledWith({ type: "input", tabId: "tab-3", data: "\x15" });
      expect(terminal.paste).not.toHaveBeenCalled();
    });
  });

  // ─── Escape Key ──────────────────────────────────────────────────

  describe("Escape key (clear selection)", () => {
    it("clears selection and returns false when text is selected", () => {
      const terminal = createMockTerminal();
      vi.mocked(terminal.hasSelection).mockReturnValue(true);
      const deps = createDeps({ terminal });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "Escape" }));

      expect(result).toBe(false);
      expect(terminal.clearSelection).toHaveBeenCalled();
    });

    it("returns true (passes through to shell) when no selection", () => {
      const terminal = createMockTerminal();
      vi.mocked(terminal.hasSelection).mockReturnValue(false);
      const deps = createDeps({ terminal });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "Escape" }));

      expect(result).toBe(true);
      expect(terminal.clearSelection).not.toHaveBeenCalled();
    });

    it("returns true without checking selection during IME composition", () => {
      const terminal = createMockTerminal();
      const deps = createDeps({ terminal, getIsComposing: vi.fn(() => true) });
      const handler = createKeyEventHandler(deps);

      const result = handler(makeKeyEvent({ key: "Escape" }));

      expect(result).toBe(true);
      expect(terminal.hasSelection).not.toHaveBeenCalled();
    });
  });

  // ─── Unknown Cmd combos ─────────────────────────────────────────

  describe("unknown Cmd+ combos", () => {
    it("returns true for Cmd+P (pass to VS Code)", () => {
      const deps = createDeps();
      const handler = createKeyEventHandler(deps);
      const result = handler(makeKeyEvent({ key: "p", metaKey: true }));
      expect(result).toBe(true);
    });

    it("returns true for Cmd+S (pass to VS Code)", () => {
      const deps = createDeps();
      const handler = createKeyEventHandler(deps);
      const result = handler(makeKeyEvent({ key: "s", metaKey: true }));
      expect(result).toBe(true);
    });
  });
});

// ─── handlePaste ────────────────────────────────────────────────────

describe("handlePaste", () => {
  it("pastes text from clipboard to terminal", async () => {
    const terminal = createMockTerminal();
    const clipboard = createMockClipboard("hello world");

    await handlePaste(terminal, clipboard);

    expect(clipboard.readText).toHaveBeenCalled();
    expect(terminal.paste).toHaveBeenCalledWith("hello world");
  });

  it("does nothing when clipboard returns empty string", async () => {
    const terminal = createMockTerminal();
    const clipboard = createMockClipboard("");

    await handlePaste(terminal, clipboard);

    expect(clipboard.readText).toHaveBeenCalled();
    expect(terminal.paste).not.toHaveBeenCalled();
  });

  it("logs warning and returns when clipboard is undefined", async () => {
    const terminal = createMockTerminal();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await handlePaste(terminal, undefined);

    expect(terminal.paste).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("[AnyWhere Terminal] Clipboard API not available");
  });

  it("logs warning and returns when clipboard has no readText", async () => {
    const terminal = createMockTerminal();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Simulate clipboard object without readText
    const clipboard = { writeText: vi.fn() } as unknown as ClipboardProvider;

    await handlePaste(terminal, clipboard);

    expect(terminal.paste).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("[AnyWhere Terminal] Clipboard API not available");
  });

  it("catches clipboard read errors and logs warning", async () => {
    const terminal = createMockTerminal();
    const clipboard = createMockClipboard();
    vi.mocked(clipboard.readText).mockRejectedValue(new Error("permission denied"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await handlePaste(terminal, clipboard);

    expect(terminal.paste).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("[AnyWhere Terminal] Clipboard read failed:", expect.any(Error));
  });

  it("pastes multi-line text correctly", async () => {
    const terminal = createMockTerminal();
    const multiLine = "line1\nline2\nline3";
    const clipboard = createMockClipboard(multiLine);

    await handlePaste(terminal, clipboard);

    // terminal.paste() handles line ending normalization natively
    expect(terminal.paste).toHaveBeenCalledWith(multiLine);
  });
});
