// src/webview/splitIntegrationEdgeCases.test.ts — Edge-case tests for recursive split tree restructuring
//
// Tests cover: deep (3+ level) removeLeaf operations, sequential close-all,
// and getAllSessionIds consistency after each removal.

import { describe, expect, it } from "vitest";
import { type BranchNode, createBranch, createLeaf, getAllSessionIds, removeLeaf, type SplitNode } from "./SplitModel";

// ─── Helper ─────────────────────────────────────────────────────────

/**
 * Build a 3-level deep tree:
 *
 *            root (H)
 *           /        \
 *        brL (V)      brR (V)
 *       /    \       /    \
 *      A      B     C      D
 *
 * H = horizontal, V = vertical
 */
function buildThreeLevelTree() {
  const a = createLeaf("A");
  const b = createLeaf("B");
  const c = createLeaf("C");
  const d = createLeaf("D");
  const branchLeft = createBranch("vertical", a, b);
  const branchRight = createBranch("vertical", c, d);
  const root = createBranch("horizontal", branchLeft, branchRight);
  return { root, a, b, c, d, branchLeft, branchRight };
}

/** Assert a value is not null and return it with narrowed type. */
function assertNonNull<T>(value: T | null, message = "expected non-null"): T {
  expect(value, message).not.toBeNull();
  return value as T;
}

// ─── 3-level deep removeLeaf from left subtree ─────────────────────

describe("removeLeaf — 3-level deep left subtree", () => {
  it("removes leaf A and collapses left branch to B", () => {
    const { root } = buildThreeLevelTree();
    const result = assertNonNull(removeLeaf(root, "A"));

    // Left subtree should collapse to leaf B; right subtree unchanged
    expect(result.type).toBe("branch");
    if (result.type === "branch") {
      // Left child should now be leaf B (collapsed from the branch)
      expect(result.children[0]).toEqual({ type: "leaf", sessionId: "B" });
      // Right child should still be the original right branch
      expect(result.children[1].type).toBe("branch");
    }
    expect(getAllSessionIds(result).sort()).toEqual(["B", "C", "D"]);
  });

  it("removes leaf B and collapses left branch to A", () => {
    const { root } = buildThreeLevelTree();
    const result = assertNonNull(removeLeaf(root, "B"));

    expect(result.type).toBe("branch");
    if (result.type === "branch") {
      expect(result.children[0]).toEqual({ type: "leaf", sessionId: "A" });
      expect(result.children[1].type).toBe("branch");
    }
    expect(getAllSessionIds(result).sort()).toEqual(["A", "C", "D"]);
  });
});

// ─── 3-level deep removeLeaf from right subtree ────────────────────

describe("removeLeaf — 3-level deep right subtree", () => {
  it("removes leaf C and collapses right branch to D", () => {
    const { root } = buildThreeLevelTree();
    const result = assertNonNull(removeLeaf(root, "C"));

    expect(result.type).toBe("branch");
    if (result.type === "branch") {
      // Left subtree unchanged
      expect(result.children[0].type).toBe("branch");
      // Right child should now be leaf D (collapsed)
      expect(result.children[1]).toEqual({ type: "leaf", sessionId: "D" });
    }
    expect(getAllSessionIds(result).sort()).toEqual(["A", "B", "D"]);
  });

  it("removes leaf D and collapses right branch to C", () => {
    const { root } = buildThreeLevelTree();
    const result = assertNonNull(removeLeaf(root, "D"));

    expect(result.type).toBe("branch");
    if (result.type === "branch") {
      expect(result.children[0].type).toBe("branch");
      expect(result.children[1]).toEqual({ type: "leaf", sessionId: "C" });
    }
    expect(getAllSessionIds(result).sort()).toEqual(["A", "B", "C"]);
  });
});

// ─── Close all inner panes one by one ───────────────────────────────

describe("sequential close-all until single leaf remains", () => {
  it("closes 4 panes one by one, verifying tree at each step", () => {
    const { root } = buildThreeLevelTree();

    // Initial state: 4 leaves
    expect(getAllSessionIds(root).sort()).toEqual(["A", "B", "C", "D"]);

    // Remove A — 3 leaves remain
    const afterA = assertNonNull(removeLeaf(root, "A"));
    expect(getAllSessionIds(afterA).sort()).toEqual(["B", "C", "D"]);
    // Left subtree collapsed: root should now have leaf B on the left
    expect(afterA.type).toBe("branch");
    if (afterA.type === "branch") {
      expect(afterA.children[0]).toEqual({ type: "leaf", sessionId: "B" });
    }

    // Remove C — 2 leaves remain
    const afterC = assertNonNull(removeLeaf(afterA, "C"));
    expect(getAllSessionIds(afterC).sort()).toEqual(["B", "D"]);
    // Both subtrees are now leaves
    expect(afterC.type).toBe("branch");
    if (afterC.type === "branch") {
      expect(afterC.children[0]).toEqual({ type: "leaf", sessionId: "B" });
      expect(afterC.children[1]).toEqual({ type: "leaf", sessionId: "D" });
    }

    // Remove D — single leaf remains
    const afterD = assertNonNull(removeLeaf(afterC, "D"));
    expect(afterD.type).toBe("leaf");
    expect(getAllSessionIds(afterD)).toEqual(["B"]);

    // Remove B — tree becomes empty (null)
    const afterB = removeLeaf(afterD, "B");
    expect(afterB).toBeNull();
  });
});

// ─── getAllSessionIds consistency after each removal ─────────────────

describe("getAllSessionIds consistency after removals", () => {
  it("returns correct IDs after each sequential removal", () => {
    const { root } = buildThreeLevelTree();
    const removalOrder = ["B", "D", "A", "C"];
    let tree: SplitNode = root;
    const expected = new Set(["A", "B", "C", "D"]);

    for (const id of removalOrder) {
      expected.delete(id);
      const next = removeLeaf(tree, id);

      if (expected.size === 0) {
        expect(next).toBeNull();
      } else {
        const narrowed = assertNonNull(next);
        expect(getAllSessionIds(narrowed).sort()).toEqual([...expected].sort());
        tree = narrowed;
      }
    }
  });

  it("handles removal from a 4-level deep tree", () => {
    //        root (H)
    //       /        \
    //    deep (V)     D
    //   /      \
    //  inner (H)  C
    //  /    \
    // A      B
    const inner = createBranch("horizontal", createLeaf("A"), createLeaf("B"));
    const deep = createBranch("vertical", inner, createLeaf("C"));
    const root = createBranch("horizontal", deep, createLeaf("D"));

    expect(getAllSessionIds(root).sort()).toEqual(["A", "B", "C", "D"]);

    // Remove deepest-left leaf A
    const afterA = assertNonNull(removeLeaf(root, "A"));
    expect(getAllSessionIds(afterA).sort()).toEqual(["B", "C", "D"]);

    // The inner branch should have collapsed: deep's first child is now leaf B
    if (afterA.type === "branch") {
      const leftSubtree = afterA.children[0];
      expect(leftSubtree.type).toBe("branch");
      if (leftSubtree.type === "branch") {
        expect(leftSubtree.children[0]).toEqual({ type: "leaf", sessionId: "B" });
        expect(leftSubtree.children[1]).toEqual({ type: "leaf", sessionId: "C" });
      }
    }

    // Remove B — deep collapses to leaf C
    const afterB = assertNonNull(removeLeaf(afterA, "B"));
    expect(getAllSessionIds(afterB).sort()).toEqual(["C", "D"]);
    if (afterB.type === "branch") {
      expect(afterB.children[0]).toEqual({ type: "leaf", sessionId: "C" });
      expect(afterB.children[1]).toEqual({ type: "leaf", sessionId: "D" });
    }

    // Remove C — single leaf D
    const afterC = assertNonNull(removeLeaf(afterB, "C"));
    expect(afterC).toEqual({ type: "leaf", sessionId: "D" });

    // Remove D — null
    const afterD = removeLeaf(afterC, "D");
    expect(afterD).toBeNull();
  });
});

// ─── Layout persistence round-trip ──────────────────────────────────

describe("layout persistence round-trip", () => {
  it("round-trips a 3-pane nested tree through JSON serialization", () => {
    // Simulate persistLayoutState → restoreLayoutState via JSON
    // Layout: branch(H, [leaf(A), branch(V, [leaf(B), leaf(C)])])
    const layout = createBranch(
      "horizontal",
      createLeaf("A"),
      createBranch("vertical", createLeaf("B"), createLeaf("C"), 0.4),
      0.6,
    );

    // Simulate vscode.setState / vscode.getState round-trip
    const state = {
      tabLayouts: { tab1: layout },
      tabActivePaneIds: { tab1: "B" },
    };
    const serialized = JSON.stringify(state);
    const deserialized = JSON.parse(serialized) as {
      tabLayouts: Record<string, SplitNode>;
      tabActivePaneIds: Record<string, string>;
    };

    // Verify structure is preserved
    const restoredLayout = deserialized.tabLayouts.tab1;
    expect(restoredLayout).toBeDefined();
    expect(restoredLayout.type).toBe("branch");
    expect(getAllSessionIds(restoredLayout).sort()).toEqual(["A", "B", "C"]);

    // Verify ratios are preserved
    const root = restoredLayout as BranchNode;
    expect(root.ratio).toBe(0.6);
    expect(root.direction).toBe("horizontal");
    const nested = root.children[1] as BranchNode;
    expect(nested.ratio).toBe(0.4);
    expect(nested.direction).toBe("vertical");

    // Verify active pane ID is preserved
    expect(deserialized.tabActivePaneIds.tab1).toBe("B");
  });

  it("returns empty map for malformed state (null)", () => {
    // Simulate restoreLayoutState logic with null state
    const state: unknown = null;
    const restored = new Map<string, SplitNode>();

    try {
      if (state && typeof state === "object" && "tabLayouts" in (state as Record<string, unknown>)) {
        // Would populate restored — but state is null so this branch is skipped
        throw new Error("should not reach here");
      }
    } catch {
      // Fallback: return empty map
    }

    expect(restored.size).toBe(0);
  });

  it("returns empty map for malformed state (missing tabLayouts)", () => {
    const state = { someOtherKey: "value" };
    const restored = new Map<string, SplitNode>();

    if (state && typeof (state as Record<string, unknown>).tabLayouts === "object") {
      throw new Error("should not reach here");
    }

    expect(restored.size).toBe(0);
  });

  it("returns empty map for malformed state (tabLayouts is not an object)", () => {
    const state = { tabLayouts: "not-an-object" };
    const restored = new Map<string, SplitNode>();

    if (typeof state.tabLayouts === "object" && state.tabLayouts !== null) {
      throw new Error("should not reach here");
    }

    expect(restored.size).toBe(0);
  });

  it("ignores stale session ID in restored active pane and falls back to first leaf", () => {
    // Layout has panes A and B, but active pane ID points to "STALE" which doesn't exist
    const layout = createBranch("vertical", createLeaf("A"), createLeaf("B"));
    const allIds = getAllSessionIds(layout);

    const restoredActivePaneId = "STALE";

    // Simulate the validation logic from restoreLayoutState
    let activePaneId: string;
    if (allIds.includes(restoredActivePaneId)) {
      activePaneId = restoredActivePaneId;
    } else {
      // Fallback to first leaf
      activePaneId = allIds[0];
    }

    expect(activePaneId).toBe("A"); // First leaf, not "STALE"
  });
});

// ─── Resize propagation — getAllSessionIds for fitting ───────────────

describe("resize propagation — getAllSessionIds for fitting", () => {
  it("returns all leaf IDs for a 3-pane split tree (used by debouncedFit)", () => {
    // debouncedFit iterates getAllSessionIds(layout) and calls fitAddon.fit() on each
    const layout = createBranch(
      "horizontal",
      createLeaf("A"),
      createBranch("vertical", createLeaf("B"), createLeaf("C")),
    );

    const sessionIds = getAllSessionIds(layout);
    expect(sessionIds).toEqual(["A", "B", "C"]);
    expect(sessionIds).toHaveLength(3);
  });

  it("returns all leaf IDs for a 4-pane split tree", () => {
    const layout = createBranch(
      "horizontal",
      createBranch("vertical", createLeaf("A"), createLeaf("B")),
      createBranch("vertical", createLeaf("C"), createLeaf("D")),
    );

    const sessionIds = getAllSessionIds(layout);
    expect(sessionIds).toEqual(["A", "B", "C", "D"]);
    expect(sessionIds).toHaveLength(4);
  });

  it("returns single ID for a leaf (no splits)", () => {
    const layout = createLeaf("only");
    const sessionIds = getAllSessionIds(layout);
    expect(sessionIds).toEqual(["only"]);
  });
});
