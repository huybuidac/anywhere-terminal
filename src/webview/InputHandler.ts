// src/webview/InputHandler.ts — Extracted input handling logic for testability
//
// Provides the custom key event handler factory.
// Dependencies are injected to enable unit testing without browser/webview APIs.
//
// See: docs/design/keyboard-input.md, docs/design/flow-clipboard.md

// ─── Types ──────────────────────────────────────────────────────────

/** Abstraction over the system clipboard for dependency injection. */
export interface ClipboardProvider {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

/** Minimal terminal surface used by the key handler (subset of xterm.js Terminal). */
export interface TerminalLike {
  hasSelection(): boolean;
  getSelection(): string;
  clearSelection(): void;
  clear(): void;
  selectAll(): void;
}

/** Dependencies injected into the key event handler factory. */
export interface KeyHandlerDeps {
  terminal: TerminalLike;
  clipboard: ClipboardProvider | undefined;
  postMessage: (msg: unknown) => void;
  getActiveTabId: () => string | null;
  getIsComposing: () => boolean;
  /** Whether running on macOS (uses metaKey). Pass `navigator.platform.includes("Mac")`. */
  isMac: boolean;
}

// ─── Key Event Handler Factory ──────────────────────────────────────

/**
 * Create a custom key event handler for xterm.js.
 *
 * Returns a function suitable for `terminal.attachCustomKeyEventHandler()`.
 * All browser/platform dependencies are injected via `deps`.
 *
 * See: docs/design/keyboard-input.md#§2
 */
export function createKeyEventHandler(deps: KeyHandlerDeps): (event: KeyboardEvent) => boolean {
  const { terminal, clipboard, postMessage, getActiveTabId, getIsComposing, isMac } = deps;

  return (event: KeyboardEvent): boolean => {
    // Only process keydown events
    if (event.type !== "keydown") {
      return true;
    }

    // Don't intercept during IME composition
    if (getIsComposing()) {
      return true;
    }

    // Escape key: clear selection if present, otherwise pass through to shell
    if (event.key === "Escape") {
      if (terminal.hasSelection()) {
        terminal.clearSelection();
        return false;
      }
      return true;
    }

    // Check for platform modifier (Cmd on macOS, Ctrl on others)
    const modifier = isMac ? event.metaKey : event.ctrlKey;

    if (!modifier) {
      return true;
    }

    switch (event.key.toLowerCase()) {
      case "c":
        if (terminal.hasSelection()) {
          const selection = terminal.getSelection();
          if (selection) {
            if (clipboard) {
              clipboard.writeText(selection).catch((err) => {
                console.warn("[AnyWhere Terminal] Clipboard write failed:", err);
              });
            }
            terminal.clearSelection();
            return false;
          }
        }
        // No selection or empty selection: let xterm handle -> sends \x03 (SIGINT)
        return true;

      case "v":
        // Let xterm.js handle paste natively via browser paste event on its textarea.
        // Both VS Code and vscode-sidebar-terminal use this approach.
        // Returning false tells xterm to skip its own keydown processing,
        // but the browser's native Cmd+V still fires the paste event which
        // xterm captures on its textarea and routes through onData.
        return false;

      case "k":
        terminal.clear();
        postMessage({ type: "clear", tabId: getActiveTabId() });
        return false;

      case "a":
        terminal.selectAll();
        return false;

      case "backspace":
        // Cmd+Delete (macOS) / Ctrl+Backspace: kill current input line
        // Sends Ctrl+U (\x15) — the Unix line-kill control character.
        // Must use postMessage (raw PTY input) instead of terminal.paste()
        // to avoid bracketed paste wrapping which would print ^U literally.
        postMessage({ type: "input", tabId: getActiveTabId(), data: "\x15" });
        return false;

      default:
        return true;
    }
  };
}
