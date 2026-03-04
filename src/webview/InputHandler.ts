// src/webview/InputHandler.ts — Extracted input handling logic for testability
//
// Provides the custom key event handler factory and paste helper.
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
  paste(data: string): void;
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

// ─── Paste Helper ───────────────────────────────────────────────────

/**
 * Handle paste — reads from clipboard and delegates to terminal.paste()
 * which handles bracketed paste mode and line ending normalization natively.
 *
 * See: docs/design/keyboard-input.md#§4
 */
export async function handlePaste(terminal: TerminalLike, clipboard: ClipboardProvider | undefined): Promise<void> {
  if (!clipboard?.readText) {
    console.warn("[AnyWhere Terminal] Clipboard API not available");
    return;
  }
  try {
    const text = await clipboard.readText();
    if (text) {
      terminal.paste(text);
    }
  } catch (err) {
    console.warn("[AnyWhere Terminal] Clipboard read failed:", err);
  }
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
        // If clipboard API is unavailable, let the browser/xterm handle paste natively
        if (!clipboard) {
          return true;
        }
        void handlePaste(terminal, clipboard);
        return false;

      case "k":
        terminal.clear();
        postMessage({ type: "clear", tabId: getActiveTabId() });
        return false;

      case "a":
        terminal.selectAll();
        return false;

      default:
        return true;
    }
  };
}
