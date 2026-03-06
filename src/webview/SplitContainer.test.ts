// src/webview/SplitContainer.test.ts — Unit tests for SplitContainer rendering
//
// Tests cover: single leaf rendering, branch with two leaves, nested branches,
// correct flex-direction, flex ratios, handle attributes, and onLeafMounted callback.

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RenderCallbacks } from "./SplitContainer";
import { renderSplitTree } from "./SplitContainer";
import { createBranch, createLeaf } from "./SplitModel";

// ─── Setup / Teardown ───────────────────────────────────────────────

let parent: HTMLDivElement;

beforeEach(() => {
  parent = document.createElement("div");
  document.body.appendChild(parent);
});

afterEach(() => {
  document.body.innerHTML = "";
});

/** Create a no-op callbacks object with spies. */
function createMockCallbacks(): RenderCallbacks {
  return {
    onLeafMounted: vi.fn(),
  };
}

// ─── Single Leaf Rendering ──────────────────────────────────────────

describe("single leaf rendering", () => {
  it("creates a div.split-leaf with data-session-id", () => {
    const callbacks = createMockCallbacks();
    renderSplitTree(createLeaf("abc"), parent, callbacks);

    const leaf = parent.querySelector(".split-leaf") as HTMLDivElement;
    expect(leaf).not.toBeNull();
    expect(leaf.dataset.sessionId).toBe("abc");
  });

  it("calls onLeafMounted with correct sessionId and container", () => {
    const callbacks = createMockCallbacks();
    renderSplitTree(createLeaf("abc"), parent, callbacks);

    expect(callbacks.onLeafMounted).toHaveBeenCalledTimes(1);
    const [sessionId, container] = (callbacks.onLeafMounted as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sessionId).toBe("abc");
    expect(container).toBeInstanceOf(HTMLDivElement);
    expect(container.className).toBe("split-leaf");
  });

  it("sets overflow hidden and position relative on leaf", () => {
    const callbacks = createMockCallbacks();
    renderSplitTree(createLeaf("abc"), parent, callbacks);

    const leaf = parent.querySelector(".split-leaf") as HTMLDivElement;
    expect(leaf.style.overflow).toBe("hidden");
    expect(leaf.style.position).toBe("relative");
  });
});

// ─── Branch with Two Leaves ─────────────────────────────────────────

describe("branch with two leaves", () => {
  it("creates a div.split-branch with handle and two children", () => {
    const callbacks = createMockCallbacks();
    const tree = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    renderSplitTree(tree, parent, callbacks);

    const branch = parent.querySelector(".split-branch") as HTMLDivElement;
    expect(branch).not.toBeNull();
    // Branch should have 3 children: leaf, handle, leaf
    expect(branch.children).toHaveLength(3);
    expect(branch.children[0].className).toBe("split-leaf");
    expect(branch.children[1].className).toBe("split-handle");
    expect(branch.children[2].className).toBe("split-leaf");
  });

  it("calls onLeafMounted for both leaves", () => {
    const callbacks = createMockCallbacks();
    const tree = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    renderSplitTree(tree, parent, callbacks);

    expect(callbacks.onLeafMounted).toHaveBeenCalledTimes(2);
    const calls = (callbacks.onLeafMounted as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe("a");
    expect(calls[1][0]).toBe("b");
  });
});

// ─── Flex Direction ─────────────────────────────────────────────────

describe("flex-direction", () => {
  it("uses flex-direction: row for vertical split (side-by-side)", () => {
    const callbacks = createMockCallbacks();
    const tree = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    renderSplitTree(tree, parent, callbacks);

    const branch = parent.querySelector(".split-branch") as HTMLDivElement;
    expect(branch.style.flexDirection).toBe("row");
  });

  it("uses flex-direction: column for horizontal split (top-to-bottom)", () => {
    const callbacks = createMockCallbacks();
    const tree = createBranch("horizontal", createLeaf("a"), createLeaf("b"));
    renderSplitTree(tree, parent, callbacks);

    const branch = parent.querySelector(".split-branch") as HTMLDivElement;
    expect(branch.style.flexDirection).toBe("column");
  });
});

// ─── Flex Ratios ────────────────────────────────────────────────────

describe("flex ratios", () => {
  it("applies correct flex ratios to children (0.5 default)", () => {
    const callbacks = createMockCallbacks();
    const tree = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    renderSplitTree(tree, parent, callbacks);

    const branch = parent.querySelector(".split-branch") as HTMLDivElement;
    const firstChild = branch.children[0] as HTMLElement;
    const secondChild = branch.children[2] as HTMLElement;
    // JSDOM normalizes flex shorthand: "0.5" → "0.5 1 0%"
    expect(Number.parseFloat(firstChild.style.flex)).toBeCloseTo(0.5);
    expect(Number.parseFloat(secondChild.style.flex)).toBeCloseTo(0.5);
  });

  it("applies correct flex ratios to children (0.6 / 0.4)", () => {
    const callbacks = createMockCallbacks();
    const tree = createBranch("vertical", createLeaf("a"), createLeaf("b"), 0.6);
    renderSplitTree(tree, parent, callbacks);

    const branch = parent.querySelector(".split-branch") as HTMLDivElement;
    const firstChild = branch.children[0] as HTMLElement;
    const secondChild = branch.children[2] as HTMLElement;
    expect(Number.parseFloat(firstChild.style.flex)).toBeCloseTo(0.6);
    expect(Number.parseFloat(secondChild.style.flex)).toBeCloseTo(0.4);
  });
});

// ─── Handle Attributes ──────────────────────────────────────────────

describe("handle attributes", () => {
  it("has data-direction attribute matching branch direction", () => {
    const callbacks = createMockCallbacks();
    const tree = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    renderSplitTree(tree, parent, callbacks);

    const handle = parent.querySelector(".split-handle") as HTMLDivElement;
    expect(handle.dataset.direction).toBe("vertical");
  });

  it("has flex: 0 0 4px", () => {
    const callbacks = createMockCallbacks();
    const tree = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    renderSplitTree(tree, parent, callbacks);

    const handle = parent.querySelector(".split-handle") as HTMLDivElement;
    expect(handle.style.flex).toBe("0 0 4px");
  });

  it("has col-resize cursor for vertical split", () => {
    const callbacks = createMockCallbacks();
    const tree = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    renderSplitTree(tree, parent, callbacks);

    const handle = parent.querySelector(".split-handle") as HTMLDivElement;
    expect(handle.style.cursor).toBe("col-resize");
  });

  it("has row-resize cursor for horizontal split", () => {
    const callbacks = createMockCallbacks();
    const tree = createBranch("horizontal", createLeaf("a"), createLeaf("b"));
    renderSplitTree(tree, parent, callbacks);

    const handle = parent.querySelector(".split-handle") as HTMLDivElement;
    expect(handle.style.cursor).toBe("row-resize");
  });
});

// ─── Nested Branches (3-deep) ───────────────────────────────────────

describe("nested branches", () => {
  it("renders a 3-deep tree correctly", () => {
    const callbacks = createMockCallbacks();
    const tree = createBranch(
      "vertical",
      createLeaf("a"),
      createBranch("horizontal", createLeaf("b"), createLeaf("c")),
    );
    renderSplitTree(tree, parent, callbacks);

    // Top-level branch
    const outerBranch = parent.querySelector(".split-branch") as HTMLDivElement;
    expect(outerBranch).not.toBeNull();
    expect(outerBranch.children).toHaveLength(3);

    // First child is a leaf
    expect(outerBranch.children[0].className).toBe("split-leaf");
    expect((outerBranch.children[0] as HTMLElement).dataset.sessionId).toBe("a");

    // Handle
    expect(outerBranch.children[1].className).toBe("split-handle");

    // Second child is a nested branch
    const innerBranch = outerBranch.children[2] as HTMLDivElement;
    expect(innerBranch.className).toBe("split-branch");
    expect(innerBranch.style.flexDirection).toBe("column"); // horizontal → column
    expect(innerBranch.children).toHaveLength(3);
    expect((innerBranch.children[0] as HTMLElement).dataset.sessionId).toBe("b");
    expect(innerBranch.children[1].className).toBe("split-handle");
    expect((innerBranch.children[2] as HTMLElement).dataset.sessionId).toBe("c");
  });

  it("calls onLeafMounted for all 3 leaves", () => {
    const callbacks = createMockCallbacks();
    const tree = createBranch(
      "vertical",
      createLeaf("a"),
      createBranch("horizontal", createLeaf("b"), createLeaf("c")),
    );
    renderSplitTree(tree, parent, callbacks);

    expect(callbacks.onLeafMounted).toHaveBeenCalledTimes(3);
    const sessionIds = (callbacks.onLeafMounted as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(sessionIds).toEqual(["a", "b", "c"]);
  });
});

// ─── Branch Index (data-branch-index) ───────────────────────────────

describe("branch index attributes", () => {
  it("assigns pre-order branch index to handles (right-nested)", () => {
    const callbacks = createMockCallbacks();
    // root(branch0) → [leaf(a), branch1 → [leaf(b), leaf(c)]]
    const tree = createBranch(
      "vertical",
      createLeaf("a"),
      createBranch("horizontal", createLeaf("b"), createLeaf("c")),
    );
    renderSplitTree(tree, parent, callbacks);

    const handles = Array.from(parent.querySelectorAll(".split-handle")) as HTMLDivElement[];
    expect(handles).toHaveLength(2);
    // Pre-order: root branch = 0, nested branch = 1
    // DOM order: root handle first (leaf a, then handle), nested handle second
    expect(handles[0].dataset.branchIndex).toBe("0");
    expect(handles[1].dataset.branchIndex).toBe("1");
  });

  it("assigns pre-order branch index to handles (left-nested)", () => {
    const callbacks = createMockCallbacks();
    // root(branch0) → [branch1 → [leaf(a), leaf(b)], leaf(c)]
    const tree = createBranch(
      "vertical",
      createBranch("horizontal", createLeaf("a"), createLeaf("b")),
      createLeaf("c"),
    );
    renderSplitTree(tree, parent, callbacks);

    const handles = Array.from(parent.querySelectorAll(".split-handle")) as HTMLDivElement[];
    expect(handles).toHaveLength(2);
    // Pre-order: root=0, left-nested=1
    // DOM order: inner handle (left subtree) appears first, outer handle second
    const innerHandle = handles[0]; // First in DOM (inside left branch)
    const outerHandle = handles[1]; // Second in DOM (root branch)
    expect(innerHandle.dataset.branchIndex).toBe("1");
    expect(outerHandle.dataset.branchIndex).toBe("0");
  });
});
