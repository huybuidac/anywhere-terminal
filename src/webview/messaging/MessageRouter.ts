// src/webview/messaging/MessageRouter.ts — Typed message dispatch
//
// Replaces the monolithic switch statement with a typed dispatch table.
// Each message type maps to a named handler from the MessageHandlers interface.
//
// See: docs/design/message-protocol.md

import type {
  CloseSplitPaneByIdMessage,
  ConfigUpdateMessage,
  CtxClearMessage,
  ErrorMessage,
  ExitMessage,
  ExtensionToWebViewMessage,
  OutputMessage,
  RestoreMessage,
  SplitPaneAtMessage,
  SplitPaneCreatedMessage,
  SplitPaneMessage,
  TabCreatedMessage,
  TabRemovedMessage,
} from "../../types/messages";

// ─── Types ──────────────────────────────────────────────────────────

/**
 * Handler interface for non-init message types.
 * Each handler receives the typed message payload.
 * Handlers with no payload take no arguments.
 *
 * `init` is excluded — it's bootstrap orchestration handled directly by main.ts.
 */
export interface MessageHandlers {
  onOutput(msg: OutputMessage): void;
  onExit(msg: ExitMessage): void;
  onTabCreated(msg: TabCreatedMessage): void;
  onTabRemoved(msg: TabRemovedMessage): void;
  onRestore(msg: RestoreMessage): void;
  onConfigUpdate(msg: ConfigUpdateMessage): void;
  onViewShow(): void;
  onSplitPane(msg: SplitPaneMessage): void;
  onSplitPaneCreated(msg: SplitPaneCreatedMessage): void;
  onCloseSplitPane(): void;
  onCloseSplitPaneById(msg: CloseSplitPaneByIdMessage): void;
  onSplitPaneAt(msg: SplitPaneAtMessage): void;
  onCtxClear(msg: CtxClearMessage): void;
  onError(msg: ErrorMessage): void;
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Create a message router function that dispatches to typed handlers.
 *
 * The `init` message type is NOT routed — it must be handled separately
 * by the caller (main.ts bootstrap). Unknown message types are silently
 * ignored (matches current behavior).
 *
 * @param handlers - Object implementing the MessageHandlers interface
 * @returns A dispatch function that routes ExtensionToWebViewMessage to the correct handler
 */
export function createMessageRouter(handlers: MessageHandlers): (msg: ExtensionToWebViewMessage) => void {
  return (msg: ExtensionToWebViewMessage): void => {
    switch (msg.type) {
      case "output":
        handlers.onOutput(msg);
        break;
      case "exit":
        handlers.onExit(msg);
        break;
      case "tabCreated":
        handlers.onTabCreated(msg);
        break;
      case "tabRemoved":
        handlers.onTabRemoved(msg);
        break;
      case "restore":
        handlers.onRestore(msg);
        break;
      case "configUpdate":
        handlers.onConfigUpdate(msg);
        break;
      case "viewShow":
        handlers.onViewShow();
        break;
      case "splitPane":
        handlers.onSplitPane(msg);
        break;
      case "splitPaneCreated":
        handlers.onSplitPaneCreated(msg);
        break;
      case "closeSplitPane":
        handlers.onCloseSplitPane();
        break;
      case "closeSplitPaneById":
        handlers.onCloseSplitPaneById(msg);
        break;
      case "splitPaneAt":
        handlers.onSplitPaneAt(msg);
        break;
      case "ctxClear":
        handlers.onCtxClear(msg);
        break;
      case "error":
        handlers.onError(msg);
        break;
      case "init":
        // init is handled directly by main.ts — not routed
        break;
      default:
        // Silently ignore unknown message types
        break;
    }
  };
}
