// src/types/messages.ts — Shared message type definitions for AnyWhere Terminal
// Used by both Extension Host and WebView code.
// See: docs/design/message-protocol.md

// ─── Shared Types ───────────────────────────────────────────────────

/** Terminal configuration (maps to anywhereTerminal.* settings). */
export interface TerminalConfig {
  /** Font size in pixels (0 = inherit from VS Code editor) */
  fontSize: number;
  /** Whether the cursor should blink */
  cursorBlink: boolean;
  /** Maximum number of lines in the scrollback buffer */
  scrollback: number;
}

// ─── WebView → Extension Messages ───────────────────────────────────

/** Sent once when the WebView DOM is fully loaded and xterm.js is initialized. */
export interface ReadyMessage {
  type: "ready";
}

/** Raw terminal input from the user (keystrokes, paste data, IME output). */
export interface InputMessage {
  type: "input";
  /** Target terminal session ID */
  tabId: string;
  /** Raw input data (may contain ANSI escape sequences) */
  data: string;
}

/** Terminal viewport resized (e.g., sidebar dragged, window resized). */
export interface ResizeMessage {
  type: "resize";
  /** Target terminal session ID */
  tabId: string;
  /** New column count */
  cols: number;
  /** New row count */
  rows: number;
}

/** User requested creation of a new terminal tab. */
export interface CreateTabMessage {
  type: "createTab";
}

/** User switched to a different terminal tab. */
export interface SwitchTabMessage {
  type: "switchTab";
  /** Tab to activate */
  tabId: string;
}

/** User requested closing a terminal tab. */
export interface CloseTabMessage {
  type: "closeTab";
  /** Tab to close */
  tabId: string;
}

/** User requested terminal clear (scrollback + viewport). */
export interface ClearMessage {
  type: "clear";
  /** Target terminal session ID */
  tabId: string;
}

/** Acknowledgment that the WebView has processed terminal output data. */
export interface AckMessage {
  type: "ack";
  /** Number of characters processed (sent in batches of ACK_BATCH_SIZE = 5000) */
  charCount: number;
}

/**
 * All messages that can be sent from the WebView to the Extension Host.
 * Use msg.type as the discriminant in switch/case for exhaustive handling.
 */
export type WebViewToExtensionMessage =
  | ReadyMessage
  | InputMessage
  | ResizeMessage
  | CreateTabMessage
  | SwitchTabMessage
  | CloseTabMessage
  | ClearMessage
  | AckMessage;

// ─── Extension → WebView Messages ───────────────────────────────────

/** Initial state sent to the WebView after the ready handshake. */
export interface InitMessage {
  type: "init";
  /** List of existing terminal tabs (at least one, the initial tab) */
  tabs: Array<{
    /** Unique session ID */
    id: string;
    /** Display name (e.g., "Terminal 1") */
    name: string;
    /** Whether this tab is currently active */
    isActive: boolean;
  }>;
  /** Terminal configuration from user settings */
  config: TerminalConfig;
}

/**
 * Buffered PTY output data.
 * May contain raw text, ANSI escape sequences, and control characters.
 */
export interface OutputMessage {
  type: "output";
  /** Source terminal session ID */
  tabId: string;
  /** Raw terminal output (ANSI sequences included) */
  data: string;
}

/** PTY process has exited. */
export interface ExitMessage {
  type: "exit";
  /** Terminal session ID that exited */
  tabId: string;
  /** Process exit code (0 = normal, non-zero = error/signal) */
  code: number;
}

/** A new terminal tab has been created and its PTY is ready. */
export interface TabCreatedMessage {
  type: "tabCreated";
  /** New session ID */
  tabId: string;
  /** Display name (e.g., "Terminal 2") */
  name: string;
}

/** A terminal tab has been removed and its PTY destroyed. */
export interface TabRemovedMessage {
  type: "tabRemoved";
  /** Removed session ID */
  tabId: string;
}

/** Cached scrollback data for view restoration. */
export interface RestoreMessage {
  type: "restore";
  /** Terminal session ID to restore */
  tabId: string;
  /** Cached terminal output (raw ANSI data) */
  data: string;
}

/** Terminal configuration has changed (user edited settings). */
export interface ConfigUpdateMessage {
  type: "configUpdate";
  /** Only the changed configuration fields */
  config: Partial<TerminalConfig>;
}

/** Error notification for the WebView to display. */
export interface ErrorMessage {
  type: "error";
  /** Human-readable error message */
  message: string;
  /** Severity level determines display style */
  severity: "info" | "warn" | "error";
}

/**
 * Internal: sent when the view becomes visible again (for deferred resize).
 * Not part of the public protocol spec — used internally between provider and webview.
 */
export interface ViewShowMessage {
  type: "viewShow";
}

/**
 * All messages that can be sent from the Extension Host to the WebView.
 * Use msg.type as the discriminant in switch/case for exhaustive handling.
 */
export type ExtensionToWebViewMessage =
  | InitMessage
  | OutputMessage
  | ExitMessage
  | TabCreatedMessage
  | TabRemovedMessage
  | RestoreMessage
  | ConfigUpdateMessage
  | ErrorMessage
  | ViewShowMessage;
