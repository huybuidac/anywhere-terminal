// src/webview/messaging/MessageRouter.test.ts — Unit tests for MessageRouter

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionToWebViewMessage } from "../../types/messages";
import { createMessageRouter, type MessageHandlers } from "./MessageRouter";

// ─── Helpers ────────────────────────────────────────────────────────

/** Create a MessageHandlers object with all handlers as vi.fn() stubs. */
function createMockHandlers(): MessageHandlers {
  return {
    onOutput: vi.fn(),
    onExit: vi.fn(),
    onTabCreated: vi.fn(),
    onTabRemoved: vi.fn(),
    onRestore: vi.fn(),
    onConfigUpdate: vi.fn(),
    onViewShow: vi.fn(),
    onSplitPane: vi.fn(),
    onSplitPaneCreated: vi.fn(),
    onCloseSplitPane: vi.fn(),
    onCloseSplitPaneById: vi.fn(),
    onSplitPaneAt: vi.fn(),
    onCtxClear: vi.fn(),
    onError: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────

describe("createMessageRouter", () => {
  it("dispatches each message type to the correct handler", () => {
    const handlers = createMockHandlers();
    const dispatch = createMessageRouter(handlers);

    const messages: ExtensionToWebViewMessage[] = [
      { type: "output", tabId: "t1", data: "hello" },
      { type: "exit", tabId: "t1", code: 0 },
      { type: "tabCreated", tabId: "t2", name: "Terminal 2" },
      { type: "tabRemoved", tabId: "t1" },
      { type: "restore", tabId: "t1", data: "cached" },
      { type: "configUpdate", config: { fontSize: 16 } },
      { type: "viewShow" },
      { type: "splitPane", direction: "horizontal" },
      {
        type: "splitPaneCreated",
        sourcePaneId: "t1",
        newSessionId: "t2",
        newSessionName: "Terminal 2",
        direction: "vertical",
      },
      { type: "closeSplitPane" },
      { type: "closeSplitPaneById", sessionId: "t1" },
      { type: "splitPaneAt", direction: "horizontal", sourcePaneId: "t1" },
      { type: "ctxClear", sessionId: "t1" },
      { type: "error", message: "boom", severity: "error" },
    ];

    const handlerMap: Record<string, keyof MessageHandlers> = {
      output: "onOutput",
      exit: "onExit",
      tabCreated: "onTabCreated",
      tabRemoved: "onTabRemoved",
      restore: "onRestore",
      configUpdate: "onConfigUpdate",
      viewShow: "onViewShow",
      splitPane: "onSplitPane",
      splitPaneCreated: "onSplitPaneCreated",
      closeSplitPane: "onCloseSplitPane",
      closeSplitPaneById: "onCloseSplitPaneById",
      splitPaneAt: "onSplitPaneAt",
      ctxClear: "onCtxClear",
      error: "onError",
    };

    for (const msg of messages) {
      dispatch(msg);
      const handlerName = handlerMap[msg.type];
      expect(handlers[handlerName]).toHaveBeenCalledTimes(1);
    }
  });

  it("does NOT route init messages (handled by main.ts bootstrap)", () => {
    const handlers = createMockHandlers();
    const dispatch = createMessageRouter(handlers);

    dispatch({
      type: "init",
      tabs: [{ id: "t1", name: "Terminal 1", isActive: true }],
      config: { fontSize: 14, cursorBlink: true, scrollback: 10000, fontFamily: "" },
    });

    // None of the handlers should be called
    for (const fn of Object.values(handlers)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("silently ignores unknown message types without throwing", () => {
    const handlers = createMockHandlers();
    const dispatch = createMessageRouter(handlers);

    expect(() => {
      dispatch({ type: "unknownType" } as unknown as ExtensionToWebViewMessage);
    }).not.toThrow();

    for (const fn of Object.values(handlers)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});
