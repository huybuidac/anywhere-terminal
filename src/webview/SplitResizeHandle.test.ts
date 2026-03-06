// src/webview/SplitResizeHandle.test.ts — Unit tests for resize handle logic
//
// Tests cover: ratio calculation, minimum size clamping, cursor styles,
// pointerup/pointercancel cleanup, and callback invocation.

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResizeCallbacks } from "./SplitResizeHandle";
import { attachResizeHandle } from "./SplitResizeHandle";

// ─── Helpers ────────────────────────────────────────────────────────

/** Create a mock branch element with two children and a handle. */
function createBranchDOM(direction: "horizontal" | "vertical"): {
  branchEl: HTMLDivElement;
  handleEl: HTMLDivElement;
  firstChild: HTMLDivElement;
  secondChild: HTMLDivElement;
} {
  const branchEl = document.createElement("div");
  branchEl.className = "split-branch";
  branchEl.style.display = "flex";
  branchEl.style.flexDirection = direction === "horizontal" ? "column" : "row";

  const firstChild = document.createElement("div");
  firstChild.className = "split-leaf";
  firstChild.style.flex = "0.5";
  branchEl.appendChild(firstChild);

  const handleEl = document.createElement("div");
  handleEl.className = "split-handle";
  handleEl.style.flex = "0 0 4px";
  branchEl.appendChild(handleEl);

  const secondChild = document.createElement("div");
  secondChild.className = "split-leaf";
  secondChild.style.flex = "0.5";
  branchEl.appendChild(secondChild);

  document.body.appendChild(branchEl);
  return { branchEl, handleEl, firstChild, secondChild };
}

/** Create mock callbacks. */
function createMockCallbacks(): ResizeCallbacks {
  return {
    onRatioChange: vi.fn(),
    onResizeComplete: vi.fn(),
  };
}

/**
 * Mock getBoundingClientRect on an element.
 * JSDOM doesn't compute layout, so we need to mock this.
 */
function mockBoundingRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
    ...rect,
  });
}

/** Create a PointerEvent with the given properties. JSDOM supports PointerEvent. */
function createPointerEvent(
  type: string,
  props: Partial<PointerEventInit & { clientX: number; clientY: number }> = {},
): PointerEvent {
  return new PointerEvent(type, {
    pointerId: 1,
    bubbles: true,
    cancelable: true,
    ...props,
  });
}

// ─── Setup / Teardown ───────────────────────────────────────────────

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.style.cursor = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document.body.style.cursor = "";
});

// ─── Ratio Calculation ──────────────────────────────────────────────

describe("ratio calculation", () => {
  it("calculates ratio for vertical drag (clientX-based)", () => {
    const { branchEl, handleEl, firstChild, secondChild } = createBranchDOM("vertical");
    const callbacks = createMockCallbacks();

    // Mock branch to be 400px wide starting at x=0
    mockBoundingRect(branchEl, { left: 0, top: 0, width: 400, height: 200 });

    // Mock setPointerCapture/releasePointerCapture (JSDOM doesn't implement)
    handleEl.setPointerCapture = vi.fn();
    handleEl.releasePointerCapture = vi.fn();

    attachResizeHandle(handleEl, branchEl, "vertical", callbacks);

    // Start drag
    handleEl.dispatchEvent(createPointerEvent("pointerdown", { clientX: 200, clientY: 100 }));

    // Move to x=240 → ratio = 240/400 = 0.6
    handleEl.dispatchEvent(createPointerEvent("pointermove", { clientX: 240, clientY: 100 }));

    expect(Number.parseFloat(firstChild.style.flex)).toBeCloseTo(0.6);
    expect(Number.parseFloat(secondChild.style.flex)).toBeCloseTo(0.4);

    // End drag
    handleEl.dispatchEvent(createPointerEvent("pointerup", { clientX: 240, clientY: 100 }));

    expect(callbacks.onRatioChange).toHaveBeenCalledWith(expect.closeTo(0.6));
  });

  it("calculates ratio for horizontal drag (clientY-based)", () => {
    const { branchEl, handleEl, firstChild, secondChild } = createBranchDOM("horizontal");
    const callbacks = createMockCallbacks();

    // Mock branch to be 400px tall starting at y=0 (large enough to avoid clamping)
    mockBoundingRect(branchEl, { left: 0, top: 0, width: 400, height: 400 });

    handleEl.setPointerCapture = vi.fn();
    handleEl.releasePointerCapture = vi.fn();

    attachResizeHandle(handleEl, branchEl, "horizontal", callbacks);

    // Start drag
    handleEl.dispatchEvent(createPointerEvent("pointerdown", { clientX: 200, clientY: 200 }));

    // Move to y=280 → ratio = 280/400 = 0.7
    handleEl.dispatchEvent(createPointerEvent("pointermove", { clientX: 200, clientY: 280 }));

    expect(Number.parseFloat(firstChild.style.flex)).toBeCloseTo(0.7);
    expect(Number.parseFloat(secondChild.style.flex)).toBeCloseTo(0.3);

    // End drag
    handleEl.dispatchEvent(createPointerEvent("pointerup", { clientX: 200, clientY: 280 }));

    expect(callbacks.onRatioChange).toHaveBeenCalledWith(expect.closeTo(0.7));
  });
});

// ─── Minimum Size Clamping ──────────────────────────────────────────

describe("minimum size clamping", () => {
  it("clamps ratio for first child (ratio >= 80/containerSize)", () => {
    const { branchEl, handleEl, firstChild } = createBranchDOM("vertical");
    const callbacks = createMockCallbacks();

    // Container is 400px wide → min ratio = 80/400 = 0.2
    mockBoundingRect(branchEl, { left: 0, top: 0, width: 400, height: 200 });

    handleEl.setPointerCapture = vi.fn();
    handleEl.releasePointerCapture = vi.fn();

    attachResizeHandle(handleEl, branchEl, "vertical", callbacks);

    // Start drag
    handleEl.dispatchEvent(createPointerEvent("pointerdown", { clientX: 200, clientY: 100 }));

    // Try to move to x=60 → ratio would be 60/400 = 0.15, but clamped to 0.2
    handleEl.dispatchEvent(createPointerEvent("pointermove", { clientX: 60, clientY: 100 }));

    expect(Number.parseFloat(firstChild.style.flex)).toBeCloseTo(0.2);

    // End drag
    handleEl.dispatchEvent(createPointerEvent("pointerup", { clientX: 60, clientY: 100 }));
  });

  it("clamps ratio for second child (ratio <= (containerSize-80)/containerSize)", () => {
    const { branchEl, handleEl, firstChild } = createBranchDOM("horizontal");
    const callbacks = createMockCallbacks();

    // Container is 200px tall → max ratio = (200-80)/200 = 0.6
    mockBoundingRect(branchEl, { left: 0, top: 0, width: 400, height: 200 });

    handleEl.setPointerCapture = vi.fn();
    handleEl.releasePointerCapture = vi.fn();

    attachResizeHandle(handleEl, branchEl, "horizontal", callbacks);

    // Start drag
    handleEl.dispatchEvent(createPointerEvent("pointerdown", { clientX: 200, clientY: 100 }));

    // Try to move to y=160 → ratio would be 160/200 = 0.8, but clamped to 0.6
    handleEl.dispatchEvent(createPointerEvent("pointermove", { clientX: 200, clientY: 160 }));

    expect(Number.parseFloat(firstChild.style.flex)).toBeCloseTo(0.6);

    // End drag
    handleEl.dispatchEvent(createPointerEvent("pointerup", { clientX: 200, clientY: 160 }));
  });
});

// ─── Cursor Styles ──────────────────────────────────────────────────

describe("cursor styles", () => {
  it("applies col-resize cursor to body during vertical drag", () => {
    const { branchEl, handleEl } = createBranchDOM("vertical");
    const callbacks = createMockCallbacks();

    mockBoundingRect(branchEl, { left: 0, top: 0, width: 400, height: 200 });
    handleEl.setPointerCapture = vi.fn();
    handleEl.releasePointerCapture = vi.fn();

    attachResizeHandle(handleEl, branchEl, "vertical", callbacks);

    // Start drag
    handleEl.dispatchEvent(createPointerEvent("pointerdown", { clientX: 200, clientY: 100 }));

    expect(document.body.style.cursor).toBe("col-resize");
  });

  it("applies row-resize cursor to body during horizontal drag", () => {
    const { branchEl, handleEl } = createBranchDOM("horizontal");
    const callbacks = createMockCallbacks();

    mockBoundingRect(branchEl, { left: 0, top: 0, width: 400, height: 200 });
    handleEl.setPointerCapture = vi.fn();
    handleEl.releasePointerCapture = vi.fn();

    attachResizeHandle(handleEl, branchEl, "horizontal", callbacks);

    // Start drag
    handleEl.dispatchEvent(createPointerEvent("pointerdown", { clientX: 200, clientY: 100 }));

    expect(document.body.style.cursor).toBe("row-resize");
  });

  it("resets cursor on pointerup", () => {
    const { branchEl, handleEl } = createBranchDOM("vertical");
    const callbacks = createMockCallbacks();

    mockBoundingRect(branchEl, { left: 0, top: 0, width: 400, height: 200 });
    handleEl.setPointerCapture = vi.fn();
    handleEl.releasePointerCapture = vi.fn();

    attachResizeHandle(handleEl, branchEl, "vertical", callbacks);

    // Start drag
    handleEl.dispatchEvent(createPointerEvent("pointerdown", { clientX: 200, clientY: 100 }));
    expect(document.body.style.cursor).toBe("col-resize");

    // End drag
    handleEl.dispatchEvent(createPointerEvent("pointerup", { clientX: 200, clientY: 100 }));
    expect(document.body.style.cursor).toBe("");
  });

  it("resets cursor on pointercancel", () => {
    const { branchEl, handleEl } = createBranchDOM("vertical");
    const callbacks = createMockCallbacks();

    mockBoundingRect(branchEl, { left: 0, top: 0, width: 400, height: 200 });
    handleEl.setPointerCapture = vi.fn();
    handleEl.releasePointerCapture = vi.fn();

    attachResizeHandle(handleEl, branchEl, "vertical", callbacks);

    // Start drag
    handleEl.dispatchEvent(createPointerEvent("pointerdown", { clientX: 200, clientY: 100 }));
    expect(document.body.style.cursor).toBe("col-resize");

    // Cancel drag
    handleEl.dispatchEvent(createPointerEvent("pointercancel", { clientX: 200, clientY: 100 }));
    expect(document.body.style.cursor).toBe("");
  });
});

// ─── Callbacks ──────────────────────────────────────────────────────

describe("callbacks", () => {
  it("invokes onRatioChange with correct ratio after drag ends", () => {
    const { branchEl, handleEl } = createBranchDOM("vertical");
    const callbacks = createMockCallbacks();

    mockBoundingRect(branchEl, { left: 0, top: 0, width: 400, height: 200 });
    handleEl.setPointerCapture = vi.fn();
    handleEl.releasePointerCapture = vi.fn();

    attachResizeHandle(handleEl, branchEl, "vertical", callbacks);

    // Start drag
    handleEl.dispatchEvent(createPointerEvent("pointerdown", { clientX: 200, clientY: 100 }));

    // Move to x=280 → ratio = 280/400 = 0.7
    handleEl.dispatchEvent(createPointerEvent("pointermove", { clientX: 280, clientY: 100 }));

    // End drag
    handleEl.dispatchEvent(createPointerEvent("pointerup", { clientX: 280, clientY: 100 }));

    expect(callbacks.onRatioChange).toHaveBeenCalledTimes(1);
    expect(callbacks.onRatioChange).toHaveBeenCalledWith(expect.closeTo(0.7));
  });

  it("invokes onResizeComplete after drag ends", () => {
    const { branchEl, handleEl } = createBranchDOM("vertical");
    const callbacks = createMockCallbacks();

    mockBoundingRect(branchEl, { left: 0, top: 0, width: 400, height: 200 });
    handleEl.setPointerCapture = vi.fn();
    handleEl.releasePointerCapture = vi.fn();

    attachResizeHandle(handleEl, branchEl, "vertical", callbacks);

    // Start drag
    handleEl.dispatchEvent(createPointerEvent("pointerdown", { clientX: 200, clientY: 100 }));

    // End drag
    handleEl.dispatchEvent(createPointerEvent("pointerup", { clientX: 200, clientY: 100 }));

    expect(callbacks.onResizeComplete).toHaveBeenCalledTimes(1);
  });
});
