# split-layout-data-model Specification

## Purpose
TBD
## Requirements

### Requirement: SplitNode Discriminated Union

The webview SHALL define a tree-based layout model as a discriminated union type:

```typescript
type SplitDirection = 'horizontal' | 'vertical';

interface LeafNode {
  type: 'leaf';
  sessionId: string;
}

interface BranchNode {
  type: 'branch';
  direction: SplitDirection;
  children: [SplitNode, SplitNode];
  ratio: number; // 0.0–1.0, proportion of first child
}

type SplitNode = LeafNode | BranchNode;
```

- `LeafNode` MUST contain a `sessionId` referencing a terminal session
- `BranchNode` MUST contain exactly 2 children (binary tree), a `direction`, and a `ratio` (0.0–1.0)
- `ratio` SHALL represent the proportion of available space allocated to the first child (e.g., 0.5 = equal split)

#### Scenario: Single terminal tab has leaf node
- **Given** a tab with one terminal session "abc"
- **When** the layout tree is queried
- **Then** the root is `{ type: 'leaf', sessionId: 'abc' }`

#### Scenario: Horizontal split produces branch node
- **Given** a tab with session "abc" is split horizontally, creating session "def"
- **When** the layout tree is queried
- **Then** the root is `{ type: 'branch', direction: 'horizontal', children: [{ type: 'leaf', sessionId: 'abc' }, { type: 'leaf', sessionId: 'def' }], ratio: 0.5 }`

### Requirement: Layout Tree State Storage

The layout tree MUST be stored per tab and persisted via `vscode.setState()`/`vscode.getState()`. The serialized state SHALL include:

- A map of tab IDs to their root `SplitNode`
- The serialization format MUST be plain JSON (no class instances)

#### Scenario: Layout tree round-trips through state
- **Given** a tab "tab1" with a branch node containing two leaf children
- **When** the state is serialized via `vscode.setState()` and restored via `vscode.getState()`
- **Then** the deserialized tree is structurally identical to the original

### Requirement: Layout Tree Utility Functions

The module SHALL export utility functions for tree operations:

- `createLeaf(sessionId: string): LeafNode` — create a leaf node
- `createBranch(direction: SplitDirection, first: SplitNode, second: SplitNode, ratio?: number): BranchNode` — create a branch (default ratio 0.5)
- `findLeaf(root: SplitNode, sessionId: string): LeafNode | undefined` — find a leaf by sessionId
- `getAllSessionIds(root: SplitNode): string[]` — collect all sessionIds from leaves
- `replaceNode(root: SplitNode, targetSessionId: string, replacement: SplitNode): SplitNode` — replace a leaf with a new subtree (used for splitting)

#### Scenario: getAllSessionIds collects all leaves
- **Given** a tree with branch → [leaf("a"), branch → [leaf("b"), leaf("c")]]
- **When** `getAllSessionIds(root)` is called
- **Then** the result is `['a', 'b', 'c']`

#### Scenario: replaceNode splits a leaf into a branch
- **Given** a root leaf node with sessionId "a"
- **When** `replaceNode(root, 'a', createBranch('vertical', createLeaf('a'), createLeaf('b')))` is called
- **Then** the result is a branch node with direction 'vertical' and children [leaf("a"), leaf("b")]

