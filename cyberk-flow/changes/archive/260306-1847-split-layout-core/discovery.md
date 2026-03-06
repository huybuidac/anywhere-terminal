# Discovery: split-layout-core

## Workstreams

| # | Workstream | Used? | Justification |
|---|---|---|---|
| 1 | Memory Recall | ✅ | Checked for prior split-view decisions — found it was explicitly out-of-scope for MVP, now being added |
| 2 | Architecture Snapshot | ✅ | Mapped `src/webview/main.ts`, `src/types/messages.ts`, `src/webview/TabBarUtils.ts` |
| 3 | Internal Patterns | ✅ | Analyzed existing `TerminalInstance`, `createTerminal()`, resize handling, tab switching |
| 4 | External Research | ✅ | Studied VS Code's `GridView`/`SplitView`/`BranchNode` patterns from indexed vscode project |
| 5 | Documentation | ✅ | Read `docs/design/resize-handling.md` for existing resize pipeline |
| 6 | Constraint Check | ✅ | Verified no new npm dependencies needed — pure DOM/CSS implementation |

## Key Findings

### Architecture Snapshot
- **Current model**: Flat tab model — each tab has one `TerminalInstance` with one xterm.js `Terminal`, one `FitAddon`, one container div
- **Tab switching**: CSS `display: none/block` toggle on container divs inside `#terminal-container`
- **Resize**: Single `ResizeObserver` on `#terminal-container`, debounced 100ms, fits only the active tab's terminal
- **State**: `terminals: Map<string, TerminalInstance>`, `activeTabId: string | null`
- **No component framework**: Pure vanilla TS + DOM manipulation

### VS Code GridView/SplitView Patterns
- VS Code uses a sophisticated `BranchNode` class (~500 lines) with `SplitView` for each branch, supporting n-ary children, edge snapping, linked sashes, visibility management
- `ISerializedBranchNode`: `{ type: 'branch', data: ISerializedNode[], size: number, visible?: boolean }`
- `ISerializedGridView`: `{ root: ISerializedNode, orientation, width, height }`
- **Key insight**: VS Code's approach is far more complex than needed. We need a simplified binary split tree since each split produces exactly 2 children.

### Existing Resize Pipeline
- `ResizeObserver` → debounced `fitAddon.fit()` → `terminal.onResize` → `postMessage({ type: 'resize', tabId, cols, rows })`
- With split views, EACH leaf terminal needs its own `ResizeObserver` or we need to propagate resize from the container down through the tree
- The existing 100ms debounce strategy remains valid for split pane resize handles

## Gap Analysis

| Have | Need |
|---|---|
| Flat `Map<string, TerminalInstance>` | Tree-based layout model per tab |
| Single terminal per tab | Multiple terminals per tab via split tree |
| One `ResizeObserver` on `#terminal-container` | Resize propagation through split tree + per-leaf fitting |
| CSS `display: none/block` for tab switching | Recursive tree rendering for split layout |
| No resize handles | Drag-to-resize handles between split panes |
| No split state persistence | Serialize/deserialize split tree to webview state |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Tree model | Binary split tree (BranchNode/LeafNode discriminated union) | Simpler than VS Code's n-ary approach; each split always produces 2 children |
| Layout engine | CSS flexbox with ratio-based sizing | Matches existing codebase style; `flex-grow` with ratio gives proportional sizing |
| Resize handles | Pointer events (mousedown/mousemove/mouseup) on divider elements | Standard DOM drag pattern; no library needed |
| State persistence | Serialize tree to JSON, store via `vscode.setState()` | Already using `vscode.getState()/setState()` pattern |
| Resize propagation | Each leaf has its own `FitAddon`; call `fit()` on affected leaves after resize | Existing pattern — each `TerminalInstance` already has a `fitAddon` |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| Performance with many splits | LOW | Binary tree limits depth; minimum pane size (80px) limits max splits |
| Resize handle UX on small panes | LOW | Enforce minimum pane size constraint |
| State persistence complexity | LOW | Simple JSON serialization of tree structure |
| Integration with existing tab model | MEDIUM | Each tab gets a `SplitNode` root; leaf nodes reference `TerminalInstance` by sessionId |

## Open Questions

None — all questions resolved during discovery. The approach is well-defined by VS Code patterns and the existing codebase architecture.
