// src/session/SessionManager.test.ts — Unit tests for SessionManager
// See: specs/session-manager-core/spec.md, specs/session-manager-lifecycle/spec.md, specs/session-manager-numbering/spec.md

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAll, __setAppRoot, __setWorkspaceFolders } from "../test/__mocks__/vscode";
import type { MessageSender } from "./OutputBuffer";

// ─── Mocks ──────────────────────────────────────────────────────────

// Track mock PtySession instances for assertions
const mockPtySessions: Array<{
  id: string;
  spawn: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  onData: ((data: string) => void) | undefined;
  onExit: ((code: number) => void) | undefined;
}> = [];

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
      // Update the tracked instance
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
        spawn: this.spawn,
        write: this.write,
        resize: this.resize,
        kill: this.kill,
        onData: undefined,
        onExit: undefined,
      });
    }
  }
  return { PtySession: MockPtySession };
});

vi.mock("./OutputBuffer", () => {
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

import { SessionManager } from "./SessionManager";

// ─── Test Setup ─────────────────────────────────────────────────────

function createMockWebview(): MessageSender & { messages: unknown[] } {
  return {
    messages: [],
    postMessage(message: unknown): Thenable<boolean> {
      this.messages.push(message);
      return Promise.resolve(true);
    },
  };
}

beforeEach(() => {
  __resetAll();
  __setAppRoot("/mock/vscode/app");
  __setWorkspaceFolders([{ uri: { fsPath: "/mock/workspace" } }]);
  vi.clearAllMocks();
  mockPtySessions.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Session CRUD ───────────────────────────────────────────────────

describe("SessionManager: createSession", () => {
  it("creates a session and returns a UUID", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("anywhereTerminal.sidebar", webview);

    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    sm.dispose();
  });

  it("populates all maps on creation", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("anywhereTerminal.sidebar", webview);

    // Session exists
    const session = sm.getSession(id);
    expect(session).toBeDefined();
    expect(session!.viewId).toBe("anywhereTerminal.sidebar");
    expect(session!.id).toBe(id);

    // Tabs for view
    const tabs = sm.getTabsForView("anywhereTerminal.sidebar");
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe(id);

    sm.dispose();
  });

  it("first session in a view is automatically active", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("anywhereTerminal.sidebar", webview);
    const session = sm.getSession(id);

    expect(session!.isActive).toBe(true);

    sm.dispose();
  });

  it("subsequent sessions in a view are active, previous deactivated", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("anywhereTerminal.sidebar", webview);
    const id2 = sm.createSession("anywhereTerminal.sidebar", webview);

    expect(sm.getSession(id1)!.isActive).toBe(false);
    expect(sm.getSession(id2)!.isActive).toBe(true);

    sm.dispose();
  });

  it("assigns name based on terminal number", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("anywhereTerminal.sidebar", webview);
    const id2 = sm.createSession("anywhereTerminal.sidebar", webview);

    expect(sm.getSession(id1)!.name).toBe("Terminal 1");
    expect(sm.getSession(id2)!.name).toBe("Terminal 2");

    sm.dispose();
  });

  it("spawns a PtySession", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    sm.createSession("anywhereTerminal.sidebar", webview);

    expect(mockPtySessions).toHaveLength(1);
    expect(mockPtySessions[0].spawn).toHaveBeenCalled();

    sm.dispose();
  });
});

// ─── writeToSession ─────────────────────────────────────────────────

describe("SessionManager: writeToSession", () => {
  it("forwards data to the session's PTY", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("anywhereTerminal.sidebar", webview);
    sm.writeToSession(id, "ls\r");

    const ptyMock = mockPtySessions.find((p) => p.id === id);
    expect(ptyMock!.write).toHaveBeenCalledWith("ls\r");

    sm.dispose();
  });

  it("silently ignores unknown session IDs", () => {
    const sm = new SessionManager();

    expect(() => sm.writeToSession("nonexistent", "data")).not.toThrow();

    sm.dispose();
  });
});

// ─── resizeSession ──────────────────────────────────────────────────

describe("SessionManager: resizeSession", () => {
  it("resizes the PTY and updates session dimensions", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("anywhereTerminal.sidebar", webview);
    sm.resizeSession(id, 120, 40);

    const ptyMock = mockPtySessions.find((p) => p.id === id);
    expect(ptyMock!.resize).toHaveBeenCalledWith(120, 40);

    const session = sm.getSession(id);
    expect(session!.cols).toBe(120);
    expect(session!.rows).toBe(40);

    sm.dispose();
  });

  it("silently ignores unknown session IDs", () => {
    const sm = new SessionManager();

    expect(() => sm.resizeSession("nonexistent", 80, 24)).not.toThrow();

    sm.dispose();
  });
});

// ─── switchActiveSession ────────────────────────────────────────────

describe("SessionManager: switchActiveSession", () => {
  it("switches active session in a view", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("sidebar", webview);
    const id2 = sm.createSession("sidebar", webview);

    // id2 is active after creation
    expect(sm.getSession(id2)!.isActive).toBe(true);
    expect(sm.getSession(id1)!.isActive).toBe(false);

    // Switch to id1
    sm.switchActiveSession("sidebar", id1);

    expect(sm.getSession(id1)!.isActive).toBe(true);
    expect(sm.getSession(id2)!.isActive).toBe(false);

    sm.dispose();
  });

  it("silently ignores unknown viewId", () => {
    const sm = new SessionManager();

    expect(() => sm.switchActiveSession("nonexistent", "s1")).not.toThrow();

    sm.dispose();
  });

  it("silently ignores unknown sessionId within a valid view", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("sidebar", webview);

    // Try to switch to a non-existent session
    sm.switchActiveSession("sidebar", "nonexistent");

    // Original session should still be active
    expect(sm.getSession(id1)!.isActive).toBe(true);

    sm.dispose();
  });
});

// ─── getTabsForView ─────────────────────────────────────────────────

describe("SessionManager: getTabsForView", () => {
  it("returns ordered session info", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("sidebar", webview);
    sm.createSession("sidebar", webview);

    // Switch back to id1 to test isActive
    sm.switchActiveSession("sidebar", id1);

    const tabs = sm.getTabsForView("sidebar");
    expect(tabs).toHaveLength(2);
    expect(tabs[0].name).toBe("Terminal 1");
    expect(tabs[0].isActive).toBe(true);
    expect(tabs[1].name).toBe("Terminal 2");
    expect(tabs[1].isActive).toBe(false);

    sm.dispose();
  });

  it("returns empty array for unknown viewId", () => {
    const sm = new SessionManager();

    expect(sm.getTabsForView("nonexistent")).toEqual([]);

    sm.dispose();
  });
});

// ─── isSplitPane ────────────────────────────────────────────────────

describe("SessionManager: isSplitPane", () => {
  it("defaults isSplitPane to false", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview);
    const session = sm.getSession(id);

    expect(session!.isSplitPane).toBe(false);

    sm.dispose();
  });

  it("marks session as split pane when isSplitPane option is true", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview, { isSplitPane: true });
    const session = sm.getSession(id);

    expect(session!.isSplitPane).toBe(true);

    sm.dispose();
  });

  it("excludes split pane sessions from getTabsForView", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const rootId = sm.createSession("sidebar", webview);
    sm.createSession("sidebar", webview, { isSplitPane: true });
    sm.createSession("sidebar", webview, { isSplitPane: true });

    const tabs = sm.getTabsForView("sidebar");
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe(rootId);

    sm.dispose();
  });

  it("split pane creation does NOT deactivate the root tab", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const rootId = sm.createSession("sidebar", webview);
    expect(sm.getSession(rootId)!.isActive).toBe(true);

    // Create split pane — should NOT deactivate root
    const splitId = sm.createSession("sidebar", webview, { isSplitPane: true });
    expect(sm.getSession(rootId)!.isActive).toBe(true);
    expect(sm.getSession(splitId)!.isActive).toBe(false);

    sm.dispose();
  });

  it("split pane session is still accessible via getSession", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const splitId = sm.createSession("sidebar", webview, { isSplitPane: true });
    const session = sm.getSession(splitId);

    expect(session).toBeDefined();
    expect(session!.isSplitPane).toBe(true);

    sm.dispose();
  });
});

// ─── getSession ─────────────────────────────────────────────────────

describe("SessionManager: getSession", () => {
  it("returns the session for a valid ID", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview);
    const session = sm.getSession(id);

    expect(session).toBeDefined();
    expect(session!.id).toBe(id);

    sm.dispose();
  });

  it("returns undefined for unknown ID", () => {
    const sm = new SessionManager();

    expect(sm.getSession("nonexistent")).toBeUndefined();

    sm.dispose();
  });
});

// ─── clearScrollback ────────────────────────────────────────────────

describe("SessionManager: clearScrollback", () => {
  it("clears the scrollback cache", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview);

    // Simulate data arriving (triggers scrollback append via onData)
    const ptyMock = mockPtySessions.find((p) => p.id === id);
    ptyMock!.onData?.("some output data");

    const session = sm.getSession(id);
    expect(session!.scrollbackCache.length).toBeGreaterThan(0);

    sm.clearScrollback(id);

    expect(session!.scrollbackCache).toEqual([]);
    expect(session!.scrollbackSize).toBe(0);

    sm.dispose();
  });

  it("silently ignores unknown session IDs", () => {
    const sm = new SessionManager();

    expect(() => sm.clearScrollback("nonexistent")).not.toThrow();

    sm.dispose();
  });
});

// ─── Terminal Number Recycling ──────────────────────────────────────

describe("SessionManager: number recycling", () => {
  it("assigns sequential numbers starting from 1", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("sidebar", webview);
    const id2 = sm.createSession("sidebar", webview);
    const id3 = sm.createSession("sidebar", webview);

    expect(sm.getSession(id1)!.number).toBe(1);
    expect(sm.getSession(id2)!.number).toBe(2);
    expect(sm.getSession(id3)!.number).toBe(3);

    sm.dispose();
  });

  it("fills gaps after deletion", async () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("sidebar", webview);
    const id2 = sm.createSession("sidebar", webview);
    const id3 = sm.createSession("sidebar", webview);

    // Destroy session 2
    sm.destroySession(id2);

    // Wait for operation queue to process
    await vi.advanceTimersByTimeAsync(100);

    // Create a new session — should get number 2 (gap-filling)
    const id4 = sm.createSession("sidebar", webview);

    expect(sm.getSession(id1)!.number).toBe(1);
    expect(sm.getSession(id3)!.number).toBe(3);
    expect(sm.getSession(id4)!.number).toBe(2);
    expect(sm.getSession(id4)!.name).toBe("Terminal 2");

    sm.dispose();
  });

  it("numbers always start from 1", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview);

    expect(sm.getSession(id)!.number).toBe(1);

    sm.dispose();
  });
});

// ─── Scrollback Cache ───────────────────────────────────────────────

describe("SessionManager: scrollback cache", () => {
  it("appends data to scrollback cache via onData", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview);
    const ptyMock = mockPtySessions.find((p) => p.id === id);

    // Simulate PTY output
    ptyMock!.onData?.("hello ");
    ptyMock!.onData?.("world");

    const session = sm.getSession(id);
    expect(session!.scrollbackCache).toEqual(["hello ", "world"]);
    expect(session!.scrollbackSize).toBe(11);

    sm.dispose();
  });

  it("evicts old data when exceeding max size", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview);
    const ptyMock = mockPtySessions.find((p) => p.id === id);

    // Fill cache to near max (512KB = 524,288 bytes)
    const chunk520k = "x".repeat(520_000);
    ptyMock!.onData?.(chunk520k);

    const session = sm.getSession(id);
    expect(session!.scrollbackSize).toBe(520_000);

    // Add 10KB more — total 530KB > 524,288 → should evict the 520KB chunk
    const chunk10k = "y".repeat(10_000);
    ptyMock!.onData?.(chunk10k);

    // After eviction, only the 10KB chunk should remain
    expect(session!.scrollbackSize).toBe(10_000);
    expect(session!.scrollbackCache).toEqual([chunk10k]);

    sm.dispose();
  });
});

// ─── Destroy Operations ─────────────────────────────────────────────

describe("SessionManager: destroySession", () => {
  it("removes session from all maps", async () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview);
    expect(sm.getSession(id)).toBeDefined();

    sm.destroySession(id);
    await vi.advanceTimersByTimeAsync(100);

    expect(sm.getSession(id)).toBeUndefined();
    expect(sm.getTabsForView("sidebar")).toEqual([]);

    sm.dispose();
  });

  it("is a no-op for non-existent sessions", async () => {
    const sm = new SessionManager();

    sm.destroySession("nonexistent");
    await vi.advanceTimersByTimeAsync(100);

    // Should not throw
    sm.dispose();
  });

  it("kills the PTY process", async () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview);
    const ptyMock = mockPtySessions.find((p) => p.id === id);

    sm.destroySession(id);
    await vi.advanceTimersByTimeAsync(100);

    expect(ptyMock!.kill).toHaveBeenCalled();

    sm.dispose();
  });
});

describe("SessionManager: destroyAllForView", () => {
  it("destroys all sessions for a view", async () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("sidebar", webview);
    const id2 = sm.createSession("sidebar", webview);

    sm.destroyAllForView("sidebar");
    await vi.advanceTimersByTimeAsync(100);

    expect(sm.getSession(id1)).toBeUndefined();
    expect(sm.getSession(id2)).toBeUndefined();
    expect(sm.getTabsForView("sidebar")).toEqual([]);

    sm.dispose();
  });

  it("is a no-op for unknown viewId", async () => {
    const sm = new SessionManager();

    sm.destroyAllForView("nonexistent");
    await vi.advanceTimersByTimeAsync(100);

    // Should not throw
    sm.dispose();
  });
});

// ─── Operation Queue Serialization ──────────────────────────────────

describe("SessionManager: operation queue", () => {
  it("serializes rapid destroy calls", async () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("sidebar", webview);
    const id2 = sm.createSession("sidebar", webview);

    // Rapid destroy calls
    sm.destroySession(id1);
    sm.destroySession(id2);

    await vi.advanceTimersByTimeAsync(200);

    expect(sm.getSession(id1)).toBeUndefined();
    expect(sm.getSession(id2)).toBeUndefined();

    sm.dispose();
  });

  it("continues processing after an error in a destroy operation", async () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("sidebar", webview);
    const id2 = sm.createSession("sidebar", webview);

    // Make the first PTY kill throw
    const ptyMock1 = mockPtySessions.find((p) => p.id === id1);
    ptyMock1!.kill.mockImplementation(() => {
      throw new Error("Kill failed");
    });

    sm.destroySession(id1);
    sm.destroySession(id2);

    await vi.advanceTimersByTimeAsync(200);

    // Second session should still be destroyed despite first error
    expect(sm.getSession(id2)).toBeUndefined();

    sm.dispose();
  });
});

// ─── Kill Tracking ──────────────────────────────────────────────────

describe("SessionManager: kill tracking", () => {
  it("intentional kill prevents double cleanup via onExit", async () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview);
    const ptyMock = mockPtySessions.find((p) => p.id === id);

    // Start destroy
    sm.destroySession(id);

    // Simulate onExit firing during destroy (before queue completes)
    // The onExit handler should check terminalBeingKilled and skip cleanup
    ptyMock!.onExit?.(0);

    await vi.advanceTimersByTimeAsync(100);

    // Session should be cleaned up exactly once
    expect(sm.getSession(id)).toBeUndefined();

    sm.dispose();
  });

  it("unexpected PTY crash triggers cleanup and sends exit message", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview);
    const ptyMock = mockPtySessions.find((p) => p.id === id);

    // Simulate unexpected crash (not via destroySession)
    ptyMock!.onExit?.(1);

    // Session should be cleaned up
    expect(sm.getSession(id)).toBeUndefined();

    // Exit message should be sent to webview
    expect(webview.messages).toContainEqual(
      expect.objectContaining({
        type: "exit",
        tabId: id,
        code: 1,
      }),
    );

    sm.dispose();
  });
});

// ─── Dispose ────────────────────────────────────────────────────────

describe("SessionManager: dispose", () => {
  it("kills all PTY processes and clears all maps", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("sidebar", webview);
    const id2 = sm.createSession("panel", webview);

    sm.dispose();

    expect(sm.getSession(id1)).toBeUndefined();
    expect(sm.getSession(id2)).toBeUndefined();
    expect(sm.getTabsForView("sidebar")).toEqual([]);
    expect(sm.getTabsForView("panel")).toEqual([]);
  });

  it("is idempotent (second dispose is no-op)", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    sm.createSession("sidebar", webview);

    sm.dispose();
    expect(() => sm.dispose()).not.toThrow();
  });

  it("kills PTY processes for all sessions", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    sm.createSession("sidebar", webview);
    sm.createSession("panel", webview);

    sm.dispose();

    for (const ptyMock of mockPtySessions) {
      expect(ptyMock.kill).toHaveBeenCalled();
    }
  });
});

// ─── handleAck ──────────────────────────────────────────────────────

describe("SessionManager: handleAck", () => {
  it("forwards ack to the session's output buffer", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview);
    const session = sm.getSession(id);

    sm.handleAck(id, 5000);

    expect(session!.outputBuffer.handleAck).toHaveBeenCalledWith(5000);

    sm.dispose();
  });

  it("silently ignores unknown session IDs", () => {
    const sm = new SessionManager();

    expect(() => sm.handleAck("nonexistent", 5000)).not.toThrow();

    sm.dispose();
  });
});

// ─── updateWebviewForView ───────────────────────────────────────────

describe("SessionManager: updateWebviewForView", () => {
  it("updates webview reference for all sessions in a view", () => {
    const sm = new SessionManager();
    const webview1 = createMockWebview();
    const webview2 = createMockWebview();

    const id1 = sm.createSession("sidebar", webview1);
    const id2 = sm.createSession("sidebar", webview1);

    sm.updateWebviewForView("sidebar", webview2);

    const session1 = sm.getSession(id1);
    const session2 = sm.getSession(id2);
    expect(session1!.webview).toBe(webview2);
    expect(session2!.webview).toBe(webview2);

    // OutputBuffer.updateWebview should have been called
    expect(session1!.outputBuffer.updateWebview).toHaveBeenCalledWith(webview2);
    expect(session2!.outputBuffer.updateWebview).toHaveBeenCalledWith(webview2);

    sm.dispose();
  });

  it("silently ignores unknown viewId", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    expect(() => sm.updateWebviewForView("nonexistent", webview)).not.toThrow();

    sm.dispose();
  });
});

// ─── getScrollbackData ──────────────────────────────────────────────

describe("SessionManager: getScrollbackData", () => {
  it("returns joined scrollback cache for existing session", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id = sm.createSession("sidebar", webview);
    const ptyMock = mockPtySessions.find((p) => p.id === id);

    // Simulate PTY output
    ptyMock!.onData?.("hello");
    ptyMock!.onData?.(" world");

    expect(sm.getScrollbackData(id)).toBe("hello world");

    sm.dispose();
  });

  it("returns empty string for non-existent session", () => {
    const sm = new SessionManager();

    expect(sm.getScrollbackData("nonexistent")).toBe("");

    sm.dispose();
  });
});

// ─── pauseOutputForView / resumeOutputForView ───────────────────────

describe("SessionManager: pauseOutputForView / resumeOutputForView", () => {
  it("pauses output for all sessions in a view", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("sidebar", webview);
    const id2 = sm.createSession("sidebar", webview);

    sm.pauseOutputForView("sidebar");

    const session1 = sm.getSession(id1);
    const session2 = sm.getSession(id2);
    expect(session1!.outputBuffer.pauseOutput).toHaveBeenCalled();
    expect(session2!.outputBuffer.pauseOutput).toHaveBeenCalled();

    sm.dispose();
  });

  it("resumes output for all sessions in a view", () => {
    const sm = new SessionManager();
    const webview = createMockWebview();

    const id1 = sm.createSession("sidebar", webview);
    const id2 = sm.createSession("sidebar", webview);

    sm.resumeOutputForView("sidebar");

    const session1 = sm.getSession(id1);
    const session2 = sm.getSession(id2);
    expect(session1!.outputBuffer.resumeOutput).toHaveBeenCalled();
    expect(session2!.outputBuffer.resumeOutput).toHaveBeenCalled();

    sm.dispose();
  });

  it("silently ignores unknown viewId for pause", () => {
    const sm = new SessionManager();

    expect(() => sm.pauseOutputForView("nonexistent")).not.toThrow();

    sm.dispose();
  });

  it("silently ignores unknown viewId for resume", () => {
    const sm = new SessionManager();

    expect(() => sm.resumeOutputForView("nonexistent")).not.toThrow();

    sm.dispose();
  });
});
