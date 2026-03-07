// src/providers/TerminalViewProvider.test.ts — Unit tests for TerminalViewProvider
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAll, __setAppRoot, __setWorkspaceFolders } from "../test/__mocks__/vscode";

// Track mock PtySession instances for assertions
const mockPtySessions: Array<{
  id: string;
  onData: ((data: string) => void) | undefined;
  onExit: ((code: number) => void) | undefined;
}> = [];

// Mock PtyManager so no real PTY is spawned
vi.mock("../pty/PtyManager", () => ({
  loadNodePty: vi.fn(() => ({
    spawn: vi.fn(() => ({
      onData: vi.fn(() => ({ dispose: () => {} })),
      onExit: vi.fn(() => ({ dispose: () => {} })),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      pid: 12345,
    })),
  })),
  detectShell: vi.fn(() => ({ shell: "/bin/zsh", args: ["--login"] })),
  buildEnvironment: vi.fn(() => ({ PATH: "/usr/bin" })),
  resolveWorkingDirectory: vi.fn(() => "/tmp"),
}));

// Mock PtySession
vi.mock("../pty/PtySession", () => {
  class MockPtySession {
    id: string;
    spawn = vi.fn();
    write = vi.fn();
    resize = vi.fn();
    kill = vi.fn();
    pause = vi.fn();
    resume = vi.fn();
    private _onDataCallback: ((data: string) => void) | undefined;
    private _onExitCallback: ((code: number) => void) | undefined;

    get onData(): ((data: string) => void) | undefined {
      return this._onDataCallback;
    }
    set onData(cb: ((data: string) => void) | undefined) {
      this._onDataCallback = cb;
      const tracked = mockPtySessions.find((p) => p.id === this.id);
      if (tracked) {
        tracked.onData = cb;
      }
    }

    get onExit(): ((code: number) => void) | undefined {
      return this._onExitCallback;
    }
    set onExit(cb: ((code: number) => void) | undefined) {
      this._onExitCallback = cb;
      const tracked = mockPtySessions.find((p) => p.id === this.id);
      if (tracked) {
        tracked.onExit = cb;
      }
    }

    constructor(id: string) {
      this.id = id;
      mockPtySessions.push({
        id,
        onData: undefined,
        onExit: undefined,
      });
    }
  }
  return { PtySession: MockPtySession };
});

// Mock OutputBuffer
vi.mock("../session/OutputBuffer", () => {
  class MockOutputBuffer {
    append = vi.fn();
    handleAck = vi.fn();
    dispose = vi.fn();
    flush = vi.fn();
    pauseOutput = vi.fn();
    resumeOutput = vi.fn();
    updateWebview = vi.fn();
    constructor(
      public _tabId: string,
      public _webview: unknown,
      public _pty: unknown,
    ) {}
  }
  return { OutputBuffer: MockOutputBuffer };
});

import type * as vscode from "vscode";
import { SessionManager } from "../session/SessionManager";
import { TerminalViewProvider } from "./TerminalViewProvider";

// ─── Test Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  __resetAll();
  __setAppRoot("/mock/vscode/app");
  __setWorkspaceFolders([{ uri: { fsPath: "/mock/workspace" } }]);
  vi.clearAllMocks();
  mockPtySessions.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────────

function createMockWebviewView(): {
  webviewView: vscode.WebviewView;
  messageHandlers: Array<(msg: unknown) => void>;
  disposeHandlers: Array<() => void>;
  visibilityHandlers: Array<() => void>;
  postMessageSpy: ReturnType<typeof vi.fn>;
  setVisible: (visible: boolean) => void;
} {
  const messageHandlers: Array<(msg: unknown) => void> = [];
  const disposeHandlers: Array<() => void> = [];
  const visibilityHandlers: Array<() => void> = [];
  const postMessageSpy = vi.fn(() => Promise.resolve(true));
  let _visible = true;

  const webviewView = {
    visible: true,
    viewType: "anywhereTerminal.sidebar",
    webview: {
      html: "",
      options: {},
      cspSource: "https://mock.csp.source",
      asWebviewUri: (uri: { fsPath: string }) => uri.fsPath,
      onDidReceiveMessage: (handler: (msg: unknown) => void) => {
        messageHandlers.push(handler);
        return { dispose: () => {} };
      },
      postMessage: postMessageSpy,
    },
    onDidChangeVisibility: (handler: () => void) => {
      visibilityHandlers.push(handler);
      return { dispose: () => {} };
    },
    onDidDispose: (handler: () => void) => {
      disposeHandlers.push(handler);
      return { dispose: () => {} };
    },
  } as unknown as vscode.WebviewView;

  const setVisible = (visible: boolean) => {
    _visible = visible;
    (webviewView as { visible: boolean }).visible = visible;
    for (const handler of visibilityHandlers) {
      handler();
    }
  };

  return { webviewView, messageHandlers, disposeHandlers, visibilityHandlers, postMessageSpy, setVisible };
}

// ─── getActiveSessionId ─────────────────────────────────────────────

describe("TerminalViewProvider: getActiveSessionId", () => {
  it("returns undefined when no sessions exist", () => {
    const sm = new SessionManager();
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    expect(provider.getActiveSessionId()).toBeUndefined();

    sm.dispose();
  });

  it("returns the active session ID after resolveWebviewView + ready", () => {
    const sm = new SessionManager();
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    const { webviewView, messageHandlers } = createMockWebviewView();
    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

    // Simulate ready
    for (const handler of messageHandlers) {
      handler({ type: "ready" });
    }

    const activeId = provider.getActiveSessionId();
    expect(activeId).toBeDefined();
    expect(typeof activeId).toBe("string");

    sm.dispose();
  });

  it("returns the most recently created session as active", () => {
    const sm = new SessionManager();
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    const { webviewView, messageHandlers } = createMockWebviewView();
    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

    // Simulate ready — creates first session
    for (const handler of messageHandlers) {
      handler({ type: "ready" });
    }

    // Create a second session via createTab message
    for (const handler of messageHandlers) {
      handler({ type: "createTab" });
    }

    const tabs = sm.getTabsForView(provider.getViewId());
    expect(tabs).toHaveLength(2);

    // The second session should be active
    const activeId = provider.getActiveSessionId();
    expect(activeId).toBe(tabs[1].id);

    sm.dispose();
  });
});

// ─── safeSendWithRetry ──────────────────────────────────────────────

describe("TerminalViewProvider: safeSendWithRetry via createTab", () => {
  it("retries postMessage when first attempt returns false then succeeds", async () => {
    const sm = new SessionManager();
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    const { webviewView, messageHandlers, postMessageSpy } = createMockWebviewView();
    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

    // Simulate ready
    for (const handler of messageHandlers) {
      handler({ type: "ready" });
    }

    // Reset spy and make it fail once then succeed
    postMessageSpy.mockReset();
    let callCount = 0;
    postMessageSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(false); // First attempt fails
      }
      return Promise.resolve(true); // Retry succeeds
    });

    // Trigger createTab which uses safeSendWithRetry
    for (const handler of messageHandlers) {
      handler({ type: "createTab" });
    }

    // Wait for retries to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    // Should have been called at least twice (retry)
    expect(postMessageSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    sm.dispose();
  });

  it("returns false after all retries exhausted", async () => {
    const sm = new SessionManager();
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    const { webviewView, messageHandlers, postMessageSpy } = createMockWebviewView();
    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

    // Simulate ready
    for (const handler of messageHandlers) {
      handler({ type: "ready" });
    }

    // Reset spy and make it always fail
    postMessageSpy.mockReset();
    postMessageSpy.mockImplementation(() => Promise.resolve(false));

    // Trigger createTab which uses safeSendWithRetry
    for (const handler of messageHandlers) {
      handler({ type: "createTab" });
    }

    // Wait for all retries to complete (3 attempts × 50ms delay)
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    // Should have been called 3 times (initial + 2 retries)
    expect(postMessageSpy.mock.calls.length).toBe(3);

    sm.dispose();
  });
});

// ─── Scrollback Replay on Re-creation ───────────────────────────────

describe("TerminalViewProvider: scrollback replay on re-creation", () => {
  it("first-time creation creates a new session", () => {
    const sm = new SessionManager();
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    const { webviewView, messageHandlers, postMessageSpy } = createMockWebviewView();
    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

    // Simulate ready
    for (const handler of messageHandlers) {
      handler({ type: "ready" });
    }

    const tabs = sm.getTabsForView(provider.getViewId());
    expect(tabs).toHaveLength(1);

    // Should have sent init with the new session
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "init",
        tabs: expect.arrayContaining([expect.objectContaining({ isActive: true })]),
      }),
    );

    sm.dispose();
  });

  it("re-creation restores existing sessions without creating new ones", () => {
    const sm = new SessionManager();
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    // First creation
    const { webviewView: wv1, messageHandlers: mh1 } = createMockWebviewView();
    provider.resolveWebviewView(wv1, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
    for (const handler of mh1) {
      handler({ type: "ready" });
    }

    const tabsBefore = sm.getTabsForView(provider.getViewId());
    expect(tabsBefore).toHaveLength(1);
    const sessionId = tabsBefore[0].id;

    // Simulate PTY output to build scrollback
    const ptyMock = mockPtySessions.find((p) => p.id === sessionId);
    ptyMock!.onData?.("hello world");

    // Simulate re-creation (new webview view)
    const { webviewView: wv2, messageHandlers: mh2, postMessageSpy: pms2 } = createMockWebviewView();
    provider.resolveWebviewView(wv2, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
    for (const handler of mh2) {
      handler({ type: "ready" });
    }

    // Should NOT have created a new session
    const tabsAfter = sm.getTabsForView(provider.getViewId());
    expect(tabsAfter).toHaveLength(1);
    expect(tabsAfter[0].id).toBe(sessionId);

    // Should have sent init with existing tabs
    expect(pms2).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "init",
        tabs: expect.arrayContaining([expect.objectContaining({ id: sessionId })]),
      }),
    );

    // Should have sent restore message with scrollback data
    expect(pms2).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "restore",
        tabId: sessionId,
        data: "hello world",
      }),
    );

    sm.dispose();
  });
});

// ─── Visibility Pause/Resume ────────────────────────────────────────

describe("TerminalViewProvider: visibility pause/resume", () => {
  it("pauses output when view becomes hidden", () => {
    const sm = new SessionManager();
    const pauseSpy = vi.spyOn(sm, "pauseOutputForView");
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    const { webviewView, messageHandlers, setVisible } = createMockWebviewView();
    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

    // Simulate ready
    for (const handler of messageHandlers) {
      handler({ type: "ready" });
    }

    // Hide the view
    setVisible(false);

    expect(pauseSpy).toHaveBeenCalledWith(provider.getViewId());

    sm.dispose();
  });

  it("resumes output when view becomes visible", () => {
    const sm = new SessionManager();
    const resumeSpy = vi.spyOn(sm, "resumeOutputForView");
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    const { webviewView, messageHandlers, setVisible } = createMockWebviewView();
    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

    // Simulate ready
    for (const handler of messageHandlers) {
      handler({ type: "ready" });
    }

    // Hide then show
    setVisible(false);
    setVisible(true);

    expect(resumeSpy).toHaveBeenCalledWith(provider.getViewId());

    sm.dispose();
  });

  it("does NOT destroy sessions on webview dispose (PTY survives)", () => {
    const sm = new SessionManager();
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    const { webviewView, messageHandlers, disposeHandlers } = createMockWebviewView();
    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

    // Simulate ready — creates a session
    for (const handler of messageHandlers) {
      handler({ type: "ready" });
    }

    const tabsBefore = sm.getTabsForView(provider.getViewId());
    expect(tabsBefore).toHaveLength(1);

    // Simulate webview dispose
    for (const handler of disposeHandlers) {
      handler();
    }

    // Sessions should still exist (PTY anchored to Extension Host)
    const tabsAfter = sm.getTabsForView(provider.getViewId());
    expect(tabsAfter).toHaveLength(1);
    expect(tabsAfter[0].id).toBe(tabsBefore[0].id);

    sm.dispose();
  });

  it("pauses output on webview dispose", () => {
    const sm = new SessionManager();
    const pauseSpy = vi.spyOn(sm, "pauseOutputForView");
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    const { webviewView, messageHandlers, disposeHandlers } = createMockWebviewView();
    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

    // Simulate ready
    for (const handler of messageHandlers) {
      handler({ type: "ready" });
    }

    // Simulate webview dispose
    for (const handler of disposeHandlers) {
      handler();
    }

    expect(pauseSpy).toHaveBeenCalledWith(provider.getViewId());

    sm.dispose();
  });
});

// ─── Split Pane Ghost Tab Fix ───────────────────────────────────────

describe("TerminalViewProvider: split pane ghost tab fix", () => {
  it("creates split pane session with isSplitPane flag", () => {
    const sm = new SessionManager();
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    const { webviewView, messageHandlers } = createMockWebviewView();
    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);

    // Simulate ready — creates root session
    for (const handler of messageHandlers) {
      handler({ type: "ready" });
    }

    const tabsBefore = sm.getTabsForView(provider.getViewId());
    expect(tabsBefore).toHaveLength(1);
    const rootTabId = tabsBefore[0].id;

    // Simulate split request
    for (const handler of messageHandlers) {
      handler({ type: "requestSplitSession", direction: "vertical", sourcePaneId: rootTabId });
    }

    // getTabsForView should still return only the root tab (split pane filtered out)
    const tabsAfter = sm.getTabsForView(provider.getViewId());
    expect(tabsAfter).toHaveLength(1);
    expect(tabsAfter[0].id).toBe(rootTabId);

    // Root tab should still be active
    expect(tabsAfter[0].isActive).toBe(true);

    sm.dispose();
  });

  it("split pane sessions are excluded from init on re-creation", () => {
    const sm = new SessionManager();
    const provider = new TerminalViewProvider({ fsPath: "/mock/extension" } as vscode.Uri, sm, "sidebar");

    // First creation
    const { webviewView: wv1, messageHandlers: mh1 } = createMockWebviewView();
    provider.resolveWebviewView(wv1, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
    for (const handler of mh1) {
      handler({ type: "ready" });
    }

    const rootTabId = sm.getTabsForView(provider.getViewId())[0].id;

    // Create a split pane
    for (const handler of mh1) {
      handler({ type: "requestSplitSession", direction: "horizontal", sourcePaneId: rootTabId });
    }

    // Re-creation (simulate webview dispose and re-resolve)
    const { webviewView: wv2, messageHandlers: mh2, postMessageSpy: pms2 } = createMockWebviewView();
    provider.resolveWebviewView(wv2, {} as vscode.WebviewViewResolveContext, {} as vscode.CancellationToken);
    for (const handler of mh2) {
      handler({ type: "ready" });
    }

    // Init message should only contain the root tab, NOT the split pane
    const initCall = pms2.mock.calls.find((call: unknown[]) => (call[0] as { type: string }).type === "init");
    expect(initCall).toBeDefined();
    const initMsg = initCall![0] as { tabs: Array<{ id: string }> };
    expect(initMsg.tabs).toHaveLength(1);
    expect(initMsg.tabs[0].id).toBe(rootTabId);

    sm.dispose();
  });
});
