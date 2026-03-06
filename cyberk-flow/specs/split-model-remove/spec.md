# split-model-remove Specification

## Purpose
TBD
## Requirements

### Requirement: Layout Tree Remove Function

The module SHALL export an additional utility function for removing a leaf from the tree:

- `removeLeaf(root: SplitNode, targetSessionId: string): SplitNode | null` — remove a leaf node and collapse its parent branch

The function MUST:
- If the root is a leaf matching `targetSessionId`, return `null` (tree is empty)
- If a leaf matching `targetSessionId` is found as a child of a branch, replace the branch with the sibling node (collapse)
- If `targetSessionId` is not found, return the original tree unchanged
- Be immutable — return a new tree without modifying the original

#### Scenario: Remove leaf from two-pane split returns sibling
- **Given** a branch with children [leaf("a"), leaf("b")]
- **When** `removeLeaf(root, 'b')` is called
- **Then** the result is `{ type: 'leaf', sessionId: 'a' }`

#### Scenario: Remove leaf from nested split collapses parent
- **Given** a tree: branch → [leaf("a"), branch → [leaf("b"), leaf("c")]]
- **When** `removeLeaf(root, 'b')` is called
- **Then** the result is: branch → [leaf("a"), leaf("c")]

#### Scenario: Remove only leaf returns null
- **Given** a root leaf node with sessionId "a"
- **When** `removeLeaf(root, 'a')` is called
- **Then** the result is `null`

#### Scenario: Remove non-existent leaf returns original tree
- **Given** a branch with children [leaf("a"), leaf("b")]
- **When** `removeLeaf(root, 'z')` is called
- **Then** the result is the original tree (reference equality)

