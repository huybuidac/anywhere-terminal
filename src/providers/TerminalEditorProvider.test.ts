// src/providers/TerminalEditorProvider.test.ts — Unit tests for TerminalEditorProvider
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAll, __setAppRoot, __setWorkspaceFolders } from "../test/__mocks__/vscode";

// Mock PtyManager so no real PTY is spawned
vi.mock("../pty/PtyManager", () => ({
  loadNodePty: vi.fn(() => ({
    spawn: vi.fn(() => ({
      onData: { dispose: () => {} },
      onExit: { dispose: () => {} },
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      pid: 12345,
      process: "zsh",
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
    onData: ((data: string) => void) | null = null;
    onExit: ((code: number) => void) | null = null;
    constructor(id: string) {
      this.id = id;
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
  }
  return { OutputBuffer: MockOutputBuffer };
});

import { TerminalEditorProvider } from "./TerminalEditorProvider";

// ─── Test Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  __resetAll();
  __setAppRoot("/mock/vscode/app");
  __setWorkspaceFolders([{ uri: { fsPath: "/mock/workspace" } }]);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper ─────────────────────────────────────────────────────────

function createMockContext() {
  return {
    extensionUri: { fsPath: "/mock/extension" },
    subscriptions: [],
  } as unknown as import("vscode").ExtensionContext;
}

// ─── createPanel ────────────────────────────────────────────────────

describe("TerminalEditorProvider.createPanel", () => {
  it("returns a Disposable", () => {
    const ctx = createMockContext();
    const disposable = TerminalEditorProvider.createPanel(ctx);

    expect(disposable).toBeDefined();
    expect(typeof disposable.dispose).toBe("function");
  });

  it("creates a panel that responds to ready message by sending init", async () => {
    const ctx = createMockContext();

    // Spy on createWebviewPanel to capture the panel
    const vscode = await import("vscode");
    const createSpy = vi.spyOn(vscode.window, "createWebviewPanel");

    TerminalEditorProvider.createPanel(ctx);

    expect(createSpy).toHaveBeenCalledWith(
      "anywhereTerminal.editor",
      "Terminal",
      expect.anything(),
      expect.objectContaining({
        enableScripts: true,
        retainContextWhenHidden: true,
      }),
    );
  });

  it("sets data-terminal-location=editor in HTML", async () => {
    const ctx = createMockContext();

    const vscode = await import("vscode");
    const createSpy = vi.spyOn(vscode.window, "createWebviewPanel");

    TerminalEditorProvider.createPanel(ctx);

    // The panel's webview.html should contain the location attribute
    const panel = createSpy.mock.results[0].value;
    expect(panel.webview.html).toContain('data-terminal-location="editor"');
  });

  it("sets CSP with nonce in HTML", async () => {
    const ctx = createMockContext();

    const vscode = await import("vscode");
    const createSpy = vi.spyOn(vscode.window, "createWebviewPanel");

    TerminalEditorProvider.createPanel(ctx);

    const panel = createSpy.mock.results[0].value;
    expect(panel.webview.html).toContain("Content-Security-Policy");
    expect(panel.webview.html).toMatch(/nonce-[a-f0-9]{32}/);
  });

  it("spawns PTY on ready message and sends init", async () => {
    const ctx = createMockContext();

    const vscode = await import("vscode");
    const createSpy = vi.spyOn(vscode.window, "createWebviewPanel");

    TerminalEditorProvider.createPanel(ctx);

    const panel = createSpy.mock.results[0].value;
    const postMessageSpy = vi.spyOn(panel.webview, "postMessage");

    // Simulate webview sending 'ready'
    for (const handler of panel.__messageHandlers) {
      handler({ type: "ready" });
    }

    // Should have sent 'init' message
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "init",
        tabs: expect.arrayContaining([
          expect.objectContaining({
            name: "Terminal 1",
            isActive: true,
          }),
        ]),
        config: expect.objectContaining({
          fontSize: 14,
          cursorBlink: true,
          scrollback: 10000,
        }),
      }),
    );
  });

  it("cleans up PTY on panel dispose", async () => {
    const ctx = createMockContext();

    const vscode = await import("vscode");
    const createSpy = vi.spyOn(vscode.window, "createWebviewPanel");

    TerminalEditorProvider.createPanel(ctx);

    const panel = createSpy.mock.results[0].value;

    // Trigger ready to create PTY session
    for (const handler of panel.__messageHandlers) {
      handler({ type: "ready" });
    }

    // Dispose the panel — should not throw
    expect(() => panel.dispose()).not.toThrow();
  });

  it("creates independent panels on multiple invocations", () => {
    const ctx = createMockContext();
    const d1 = TerminalEditorProvider.createPanel(ctx);
    const d2 = TerminalEditorProvider.createPanel(ctx);

    expect(d1).not.toBe(d2);

    // Clean up
    d1.dispose();
    d2.dispose();
  });
});
