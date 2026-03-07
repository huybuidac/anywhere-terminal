// src/webview/SplitContainer.ts — Split Container Recursive Renderer
//
// Renders a SplitNode tree into nested DOM elements using CSS flexbox.
// Terminal attachment happens via the onLeafMounted callback.
//
// See: specs/split-container-ui/spec.md, design.md#Rendering-Strategy

import type { SplitNode } from "./SplitModel";

// ─── Types ──────────────────────────────────────────────────────────

/** Callbacks invoked during tree rendering. */
export interface RenderCallbacks {
  /** Called when a leaf container is created, so the caller can attach a terminal. */
  onLeafMounted: (sessionId: string, container: HTMLDivElement) => void;
}

/** Internal state for tracking pre-order branch index during rendering. */
interface RenderState {
  branchIndex: number;
}

// ─── Renderer ───────────────────────────────────────────────────────

/**
 * Recursively render a SplitNode tree into DOM elements appended to `parent`.
 *
 * Returns the root element created for this node so callers can set flex on it.
 *
 * - LeafNode → div.split-leaf with data-session-id
 * - BranchNode → div.split-branch with flex-direction, containing:
 *   [child1, div.split-handle, child2]
 *
 * Each handle gets a `data-branch-index` attribute matching the pre-order index
 * used by `updateBranchRatio()` in SplitModel, ensuring correct model-DOM mapping.
 */
export function renderSplitTree(
  node: SplitNode,
  parent: HTMLElement,
  callbacks: RenderCallbacks,
  state?: RenderState,
): HTMLDivElement {
  const renderState = state ?? { branchIndex: 0 };

  if (node.type === "leaf") {
    const leafEl = document.createElement("div");
    leafEl.className = "split-leaf";
    leafEl.dataset.sessionId = node.sessionId;
    // VS Code native context menu support — set context keys for webview/context menus
    leafEl.dataset.vscodeContext = JSON.stringify({
      webviewSection: "splitPane",
      paneSessionId: node.sessionId,
    });
    leafEl.style.overflow = "hidden";
    leafEl.style.position = "relative";
    parent.appendChild(leafEl);
    callbacks.onLeafMounted(node.sessionId, leafEl);
    return leafEl;
  }

  // BranchNode
  const branchEl = document.createElement("div");
  branchEl.className = "split-branch";
  // horizontal → children stacked top-to-bottom → flex-direction: column
  // vertical → children side-by-side → flex-direction: row
  branchEl.style.display = "flex";
  branchEl.style.flexDirection = node.direction === "horizontal" ? "column" : "row";
  branchEl.style.width = "100%";
  branchEl.style.height = "100%";
  branchEl.style.overflow = "hidden";
  parent.appendChild(branchEl);

  // Assign pre-order branch index BEFORE recursing into children
  const currentBranchIndex = renderState.branchIndex;
  renderState.branchIndex++;

  // First child
  const firstChild = renderSplitTree(node.children[0], branchEl, callbacks, renderState);
  firstChild.style.flex = String(node.ratio);

  // Resize handle — stamped with pre-order branch index for model-DOM mapping
  const handleEl = document.createElement("div");
  handleEl.className = "split-handle";
  handleEl.dataset.direction = node.direction;
  handleEl.dataset.branchIndex = String(currentBranchIndex);
  handleEl.style.flex = "0 0 4px";
  handleEl.style.cursor = node.direction === "vertical" ? "col-resize" : "row-resize";
  branchEl.appendChild(handleEl);

  // Second child
  const secondChild = renderSplitTree(node.children[1], branchEl, callbacks, renderState);
  secondChild.style.flex = String(1 - node.ratio);

  return branchEl;
}
