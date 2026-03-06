// src/webview/SplitModel.ts — Split Layout Data Model
//
// Tree-based layout model using a discriminated union (LeafNode | BranchNode).
// Pure functions for immutable tree operations — no class instances, JSON-serializable.
//
// See: specs/split-layout-data-model/spec.md

// ─── Types ──────────────────────────────────────────────────────────

/** Direction of a split: 'horizontal' stacks top/bottom, 'vertical' stacks left/right. */
export type SplitDirection = "horizontal" | "vertical";

/** A leaf node representing a single terminal pane. */
export interface LeafNode {
  type: "leaf";
  sessionId: string;
}

/** A branch node representing a split with two children. */
export interface BranchNode {
  type: "branch";
  direction: SplitDirection;
  children: [SplitNode, SplitNode];
  /** Proportion of available space allocated to the first child (0.0–1.0). */
  ratio: number;
}

/** A node in the split layout tree — either a leaf (terminal) or a branch (split). */
export type SplitNode = LeafNode | BranchNode;

// ─── Factory Functions ──────────────────────────────────────────────

/** Create a leaf node for a terminal session. */
export function createLeaf(sessionId: string): LeafNode {
  return { type: "leaf", sessionId };
}

/** Create a branch node splitting two children. Default ratio is 0.5 (equal split). */
export function createBranch(direction: SplitDirection, first: SplitNode, second: SplitNode, ratio = 0.5): BranchNode {
  return { type: "branch", direction, children: [first, second], ratio };
}

// ─── Tree Query Functions ───────────────────────────────────────────

/** Find a leaf node by sessionId. Returns undefined if not found. */
export function findLeaf(root: SplitNode, sessionId: string): LeafNode | undefined {
  if (root.type === "leaf") {
    return root.sessionId === sessionId ? root : undefined;
  }
  return findLeaf(root.children[0], sessionId) ?? findLeaf(root.children[1], sessionId);
}

/** Collect all sessionIds from leaf nodes in the tree. */
export function getAllSessionIds(root: SplitNode): string[] {
  if (root.type === "leaf") {
    return [root.sessionId];
  }
  return [...getAllSessionIds(root.children[0]), ...getAllSessionIds(root.children[1])];
}

// ─── Tree Mutation Functions ────────────────────────────────────────

/**
 * Replace a leaf node (identified by targetSessionId) with a new subtree.
 * Returns a new tree (immutable). If targetSessionId is not found, returns the original tree unchanged.
 */
export function replaceNode(root: SplitNode, targetSessionId: string, replacement: SplitNode): SplitNode {
  if (root.type === "leaf") {
    return root.sessionId === targetSessionId ? replacement : root;
  }

  const newFirst = replaceNode(root.children[0], targetSessionId, replacement);
  const newSecond = replaceNode(root.children[1], targetSessionId, replacement);

  // If neither child changed, return the original tree unchanged
  if (newFirst === root.children[0] && newSecond === root.children[1]) {
    return root;
  }

  return { ...root, children: [newFirst, newSecond] };
}

/**
 * Update the ratio of a specific branch node in the tree (identified by depth-first index).
 * Returns a new tree (immutable). Branch index is 0-based, counting branches in depth-first order.
 */
export function updateBranchRatio(root: SplitNode, branchIndex: number, newRatio: number): SplitNode {
  let currentIndex = 0;

  function walk(node: SplitNode): SplitNode {
    if (node.type === "leaf") {
      return node;
    }

    if (currentIndex === branchIndex) {
      currentIndex++;
      const newFirst = walk(node.children[0]);
      const newSecond = walk(node.children[1]);
      return { ...node, ratio: newRatio, children: [newFirst, newSecond] };
    }

    currentIndex++;
    const newFirst = walk(node.children[0]);
    const newSecond = walk(node.children[1]);

    if (newFirst === node.children[0] && newSecond === node.children[1]) {
      return node;
    }
    return { ...node, children: [newFirst, newSecond] };
  }

  return walk(root);
}
