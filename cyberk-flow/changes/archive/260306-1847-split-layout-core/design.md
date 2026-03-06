# Design: split-layout-core

## Architecture Decisions

### 1. Binary Split Tree as Discriminated Union

The split layout uses a TypeScript discriminated union (`type: 'leaf' | 'branch'`) rather than a class hierarchy. This enables:
- Simple JSON serialization (no class instances)
- Pattern matching via `switch(node.type)`
- Immutable tree operations (return new tree on mutation)

### 2. Integration with Existing Tab Model

```mermaid
graph TD
    subgraph "Current Model"
        TAB["Tab (activeTabId)"] --> TI["TerminalInstance"]
        TI --> XT["xterm.js Terminal"]
    end

    subgraph "New Model"
        TAB2["Tab (activeTabId)"] --> ROOT["SplitNode (root)"]
        ROOT -->|"leaf"| LEAF1["LeafNode → sessionId → TerminalInstance"]
        ROOT -->|"branch"| BR["BranchNode"]
        BR --> LEAF2["LeafNode → sessionId → TerminalInstance"]
        BR --> LEAF3["LeafNode → sessionId → TerminalInstance"]
    end
```

- The existing `terminals: Map<string, TerminalInstance>` remains the source of truth for terminal instances
- A new `tabLayouts: Map<string, SplitNode>` maps each tab to its layout tree root
- `LeafNode.sessionId` references into the `terminals` map
- Single-terminal tabs have a simple `LeafNode` root (backward compatible)

### 3. Rendering Strategy

```mermaid
graph TD
    RENDER["renderSplitTree(node, parent)"] --> CHECK{node.type?}
    CHECK -->|leaf| LEAF["Create div.split-leaf<br/>Set data-session-id<br/>Call onLeafMounted callback"]
    CHECK -->|branch| BRANCH["Create div.split-branch<br/>Set flex-direction"]
    BRANCH --> CHILD1["renderSplitTree(children[0], branch)"]
    BRANCH --> HANDLE["Create div.split-handle<br/>Attach drag listeners"]
    BRANCH --> CHILD2["renderSplitTree(children[1], branch)"]
```

The renderer is a pure function that takes a `SplitNode` and a parent element, recursively building the DOM. Terminal attachment happens via the `onLeafMounted` callback — the caller (main.ts) moves the terminal's container div into the leaf element.

### 4. Resize Handle Drag Flow

```mermaid
sequenceDiagram
    participant User
    participant Handle as div.split-handle
    participant Branch as div.split-branch
    participant Leaf1 as Terminal A
    participant Leaf2 as Terminal B

    User->>Handle: pointerdown
    Handle->>Handle: setPointerCapture
    Handle->>Handle: Set body cursor

    loop pointermove
        User->>Handle: pointermove(clientX/Y)
        Handle->>Branch: Calculate new ratio
        Handle->>Branch: Clamp ratio (min 80px)
        Branch->>Leaf1: Update flex style
        Branch->>Leaf2: Update flex style
    end

    User->>Handle: pointerup
    Handle->>Handle: releasePointerCapture
    Handle->>Handle: Reset body cursor
    Handle->>Leaf1: fitAddon.fit()
    Handle->>Leaf2: fitAddon.fit()
```

### 5. File Structure

```
src/webview/
├── SplitModel.ts          # SplitNode types + tree utility functions
├── SplitContainer.ts      # renderSplitTree + DOM rendering
├── SplitResizeHandle.ts   # Drag-to-resize logic
├── SplitModel.test.ts     # Unit tests for tree operations
├── SplitContainer.test.ts # Unit tests for rendering
├── SplitResizeHandle.test.ts # Unit tests for resize logic
└── main.ts                # Integration point (modified)
```

## Risk Map

| Component | Risk | Mitigation |
|---|---|---|
| SplitModel (data model) | LOW | Pure functions, easy to test |
| SplitContainer (rendering) | MEDIUM | Recursive DOM manipulation; test with JSDOM |
| SplitResizeHandle (drag) | MEDIUM | Pointer events + ratio math; test calculation logic separately |
| main.ts integration | MEDIUM | Careful integration — add `tabLayouts` map alongside existing `terminals` map |

**Overall change risk: MEDIUM** — No HIGH risk items, no spikes needed.
