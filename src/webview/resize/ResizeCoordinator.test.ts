// @vitest-environment jsdom
// src/webview/resize/ResizeCoordinator.test.ts — Unit tests for ResizeCoordinator

import type { Terminal } from "@xterm/xterm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBranch, createLeaf } from "../SplitModel";
import { createMockTerminal } from "../test-utils/mockTerminal";
import { ResizeCoordinator } from "./ResizeCoordinator";

// ─── Mocks ──────────────────────────────────────────────────────────

/** Captured ResizeObserver callback for manual invocation. */
let resizeObserverCallback: ResizeObserverCallback;

/** Mock ResizeObserver class. */
class MockResizeObserver {
  disconnect = vi.fn();
  unobserve = vi.fn();
  observe = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── Helpers ────────────────────────────────────────────────────────

function createMockState(activeTabId: string | null = "tab-1") {
  const term = createMockTerminal();
  const terminals = new Map<string, { terminal: Terminal; container: HTMLDivElement }>();
  if (activeTabId) {
    terminals.set(activeTabId, {
      terminal: term as unknown as Terminal,
      container: document.createElement("div"),
    });
  }
  const tabLayouts = new Map<string, ReturnType<typeof createLeaf>>();
  return { activeTabId, terminals, tabLayouts };
}

function triggerResize(width: number, height: number): void {
  resizeObserverCallback([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver);
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("ResizeCoordinator", () => {
  it("debounces fit calls — multiple calls within 100ms result in one fit", () => {
    const fitTerminal = vi.fn();
    const state = createMockState("tab-1");
    const coordinator = new ResizeCoordinator(fitTerminal, () => state, vi.fn());

    coordinator.debouncedFit();
    coordinator.debouncedFit();
    coordinator.debouncedFit();

    // Before debounce fires
    expect(fitTerminal).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    // rAF runs synchronously (stubbed), fitAllTerminals runs
    expect(fitTerminal).toHaveBeenCalledTimes(1);
  });

  it("debouncedFitAllLeaves fits all leaves in a tab layout", () => {
    const fitTerminal = vi.fn();
    const term1 = createMockTerminal();
    const term2 = createMockTerminal();
    const terminals = new Map<string, { terminal: Terminal; container: HTMLDivElement }>();
    terminals.set("s1", { terminal: term1 as unknown as Terminal, container: document.createElement("div") });
    terminals.set("s2", { terminal: term2 as unknown as Terminal, container: document.createElement("div") });

    const layout = createBranch("vertical", createLeaf("s1"), createLeaf("s2"));
    const tabLayouts = new Map();
    tabLayouts.set("tab-1", layout);

    const state = { activeTabId: "tab-1", terminals, tabLayouts };
    const coordinator = new ResizeCoordinator(fitTerminal, () => state, vi.fn());

    coordinator.debouncedFitAllLeaves("tab-1");
    vi.advanceTimersByTime(100);

    expect(fitTerminal).toHaveBeenCalledTimes(2);
  });

  it("sets pendingResize when container dimensions are zero", () => {
    const fitTerminal = vi.fn();
    const state = createMockState("tab-1");
    const coordinator = new ResizeCoordinator(fitTerminal, () => state, vi.fn());

    const container = document.createElement("div");
    coordinator.setup(container);

    // Trigger with zero dimensions (collapsed container)
    triggerResize(0, 0);

    vi.advanceTimersByTime(200);
    // fitTerminal should NOT have been called — resize was deferred
    expect(fitTerminal).not.toHaveBeenCalled();
  });

  it("flushes pending resize on onViewShow", () => {
    const fitTerminal = vi.fn();
    const state = createMockState("tab-1");
    const coordinator = new ResizeCoordinator(fitTerminal, () => state, vi.fn());

    const container = document.createElement("div");
    coordinator.setup(container);

    // Trigger collapsed state
    triggerResize(0, 0);
    expect(fitTerminal).not.toHaveBeenCalled();

    // View becomes visible
    coordinator.onViewShow();

    expect(fitTerminal).toHaveBeenCalledTimes(1);
  });

  it("onViewShow does nothing when no pending resize", () => {
    const fitTerminal = vi.fn();
    const state = createMockState("tab-1");
    const coordinator = new ResizeCoordinator(fitTerminal, () => state, vi.fn());

    coordinator.onViewShow();
    expect(fitTerminal).not.toHaveBeenCalled();
  });

  it("infers location from aspect ratio via setup ResizeObserver", () => {
    const fitTerminal = vi.fn();
    const state = createMockState("tab-1");
    const onLocationChange = vi.fn();
    const coordinator = new ResizeCoordinator(fitTerminal, () => state, onLocationChange);

    const container = document.createElement("div");
    coordinator.setup(container);

    // Wide container (width > height * 1.2) => panel
    triggerResize(500, 200);
    expect(onLocationChange).toHaveBeenCalledWith("panel");

    // Tall container (width <= height * 1.2) => sidebar
    triggerResize(200, 500);
    expect(onLocationChange).toHaveBeenCalledWith("sidebar");
  });

  it("dispose disconnects observer and clears timers", () => {
    const fitTerminal = vi.fn();
    const state = createMockState("tab-1");
    const coordinator = new ResizeCoordinator(fitTerminal, () => state, vi.fn());

    const container = document.createElement("div");
    coordinator.setup(container);

    coordinator.debouncedFit();
    coordinator.dispose();

    // Advancing timer after dispose should not trigger fit
    vi.advanceTimersByTime(200);
    expect(fitTerminal).not.toHaveBeenCalled();
  });
});
