// src/webview/SplitModel.test.ts — Unit tests for SplitModel tree operations
//
// Tests cover: createLeaf, createBranch, findLeaf, getAllSessionIds,
// replaceNode, and JSON serialization round-trip.

import { describe, expect, it } from "vitest";
import {
  type BranchNode,
  createBranch,
  createLeaf,
  findLeaf,
  getAllSessionIds,
  type LeafNode,
  replaceNode,
  type SplitNode,
  updateBranchRatio,
} from "./SplitModel";

// ─── createLeaf ─────────────────────────────────────────────────────

describe("createLeaf", () => {
  it("creates a leaf node with the given sessionId", () => {
    const leaf = createLeaf("abc");
    expect(leaf).toEqual({ type: "leaf", sessionId: "abc" });
  });

  it("has type discriminant 'leaf'", () => {
    const leaf = createLeaf("xyz");
    expect(leaf.type).toBe("leaf");
  });
});

// ─── createBranch ───────────────────────────────────────────────────

describe("createBranch", () => {
  it("creates a branch with default ratio 0.5", () => {
    const branch = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    expect(branch.type).toBe("branch");
    expect(branch.direction).toBe("vertical");
    expect(branch.ratio).toBe(0.5);
    expect(branch.children).toHaveLength(2);
    expect(branch.children[0]).toEqual({ type: "leaf", sessionId: "a" });
    expect(branch.children[1]).toEqual({ type: "leaf", sessionId: "b" });
  });

  it("creates a branch with custom ratio", () => {
    const branch = createBranch("horizontal", createLeaf("a"), createLeaf("b"), 0.7);
    expect(branch.ratio).toBe(0.7);
    expect(branch.direction).toBe("horizontal");
  });
});

// ─── findLeaf ───────────────────────────────────────────────────────

describe("findLeaf", () => {
  it("finds a leaf at the root", () => {
    const root = createLeaf("abc");
    const found = findLeaf(root, "abc");
    expect(found).toEqual({ type: "leaf", sessionId: "abc" });
  });

  it("finds a leaf nested in a branch", () => {
    const root = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    const found = findLeaf(root, "b");
    expect(found).toEqual({ type: "leaf", sessionId: "b" });
  });

  it("finds a leaf deeply nested", () => {
    const root = createBranch(
      "vertical",
      createLeaf("a"),
      createBranch("horizontal", createLeaf("b"), createLeaf("c")),
    );
    const found = findLeaf(root, "c");
    expect(found).toEqual({ type: "leaf", sessionId: "c" });
  });

  it("returns undefined when sessionId is not found", () => {
    const root = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    const found = findLeaf(root, "nonexistent");
    expect(found).toBeUndefined();
  });
});

// ─── getAllSessionIds ────────────────────────────────────────────────

describe("getAllSessionIds", () => {
  it("returns single sessionId for a leaf", () => {
    const root = createLeaf("abc");
    expect(getAllSessionIds(root)).toEqual(["abc"]);
  });

  it("returns all sessionIds from a flat branch", () => {
    const root = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    expect(getAllSessionIds(root)).toEqual(["a", "b"]);
  });

  it("returns all sessionIds from a nested tree", () => {
    const root = createBranch(
      "vertical",
      createLeaf("a"),
      createBranch("horizontal", createLeaf("b"), createLeaf("c")),
    );
    expect(getAllSessionIds(root)).toEqual(["a", "b", "c"]);
  });
});

// ─── replaceNode ────────────────────────────────────────────────────

describe("replaceNode", () => {
  it("replaces a root leaf node", () => {
    const root = createLeaf("a");
    const replacement = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    const result = replaceNode(root, "a", replacement);
    expect(result).toEqual(replacement);
  });

  it("replaces a nested leaf node", () => {
    const root = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    const replacement = createBranch("horizontal", createLeaf("b"), createLeaf("c"));
    const result = replaceNode(root, "b", replacement);

    expect(result.type).toBe("branch");
    const branch = result as BranchNode;
    expect(branch.children[0]).toEqual({ type: "leaf", sessionId: "a" });
    expect(branch.children[1]).toEqual(replacement);
  });

  it("returns the original tree unchanged when targetSessionId is not found", () => {
    const root = createBranch("vertical", createLeaf("a"), createLeaf("b"));
    const replacement = createLeaf("z");
    const result = replaceNode(root, "nonexistent", replacement);
    expect(result).toBe(root); // Same reference — unchanged
  });
});

// ─── JSON Serialization Round-Trip ──────────────────────────────────

describe("JSON serialization round-trip", () => {
  it("round-trips a leaf node", () => {
    const original = createLeaf("abc");
    const serialized = JSON.stringify(original);
    const deserialized = JSON.parse(serialized) as LeafNode;
    expect(deserialized).toEqual(original);
  });

  it("round-trips a branch with nested children", () => {
    const original = createBranch(
      "vertical",
      createLeaf("a"),
      createBranch("horizontal", createLeaf("b"), createLeaf("c"), 0.3),
      0.6,
    );
    const serialized = JSON.stringify(original);
    const deserialized = JSON.parse(serialized) as SplitNode;
    expect(deserialized).toEqual(original);
  });
});

// ─── updateBranchRatio ──────────────────────────────────────────────

describe("updateBranchRatio", () => {
  it("updates ratio of the root branch (index 0)", () => {
    const root = createBranch("vertical", createLeaf("a"), createLeaf("b"), 0.5);
    const result = updateBranchRatio(root, 0, 0.7) as BranchNode;
    expect(result.ratio).toBe(0.7);
    expect(result.children[0]).toEqual({ type: "leaf", sessionId: "a" });
    expect(result.children[1]).toEqual({ type: "leaf", sessionId: "b" });
  });

  it("updates ratio of a nested branch (index 1)", () => {
    const root = createBranch(
      "vertical",
      createLeaf("a"),
      createBranch("horizontal", createLeaf("b"), createLeaf("c"), 0.5),
      0.5,
    );
    const result = updateBranchRatio(root, 1, 0.3) as BranchNode;
    // Root ratio unchanged
    expect(result.ratio).toBe(0.5);
    // Nested branch ratio updated
    const nested = result.children[1] as BranchNode;
    expect(nested.ratio).toBe(0.3);
  });

  it("returns original tree for a leaf node", () => {
    const root = createLeaf("a");
    const result = updateBranchRatio(root, 0, 0.7);
    expect(result).toBe(root);
  });
});
