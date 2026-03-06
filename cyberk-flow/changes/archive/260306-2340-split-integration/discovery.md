# Discovery: split-integration

## Workstreams

| # | Workstream | Used? | Justification |
|---|---|---|---|
| 1 | Memory Recall | Skip | No prior decisions relevant beyond archived changes |
| 2 | Architecture Snapshot | Yes | Read all key files to understand current state |
| 3 | Internal Patterns | Skip | Patterns clear from architecture snapshot |
| 4 | External Research | Skip | No external libraries involved |
| 5 | Documentation | Skip | No new APIs |
| 6 | Constraint Check | Skip | No new dependencies |

## Key Findings

### Already Implemented (from split-layout-core + split-actions-focus)
1. **Resize messages already per-pane**: `terminal.onResize` fires with the terminal's own `id` as `tabId` (main.ts:674). Each pane resizes independently.
2. **Input routing already per-pane**: `attachInputHandler` wires `terminal.onData` with the specific `tabId` (main.ts:494). Input goes to the focused pane's session.
3. **Output routing already works**: `OutputMessage.tabId` routes to `terminals.get(msg.tabId)` (main.ts:962-971).
4. **Split message types exist**: `SplitPaneMessage`, `SplitPaneCreatedMessage`, `CloseSplitPaneMessage`, `RequestSplitSessionMessage`, `RequestCloseSplitPaneMessage` all defined in messages.ts.
5. **Close pane with tree restructuring**: `closeSplitPane` handler removes leaf, promotes sibling via `removeLeaf()` (main.ts:1068-1131).
6. **Layout persistence**: `persistLayoutState()` / `restoreLayoutState()` save/restore split trees and active pane IDs via `vscode.setState()` (main.ts:122-169).
7. **Overall view resize propagation**: `debouncedFit()` fits all leaves in active tab's split tree (main.ts:518-542). `ResizeObserver` triggers this on container resize.
8. **View show deferred resize**: `onViewShow()` handles deferred resize for split trees (main.ts:576-600).

### Gaps (What Needs Implementation)
1. **Last pane close handling**: When the last pane in a tab is closed (single leaf), `closeSplitPane` sends `closeTab`. But when the last TAB is closed, `removeTerminal` sets `activeTabId = null` — no auto-creation of a new default terminal. Need to handle gracefully.
2. **Recursive split verification**: The tree model supports recursive splitting (replaceNode is recursive), but the integration path needs testing — split a pane, then split one of the resulting panes again, then close inner panes.
3. **Exit handling for split panes**: When a PTY process exits in a split pane, the `exit` message handler marks `instance.exited = true` but doesn't restructure the tree. The exited pane stays visible with "[Process exited]" text. This is acceptable behavior (matches VS Code's terminal behavior).

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Last pane close behavior | Close tab, request new tab if last tab | Matches VS Code behavior — closing last terminal creates a new one |
| Exited pane in split | Keep visible with exit message | Matches VS Code terminal behavior; user can manually close |
| Recursive split depth | No artificial limit | Tree model handles arbitrary depth; UI will naturally constrain via MIN_PANE_SIZE |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| Recursive split edge cases | LOW | Tree model is well-tested; add unit tests for deep nesting |
| Last pane close race condition | LOW | Use existing operation queue serialization |
| Layout persistence data size | LOW | Tree is small JSON; vscode.setState handles it |

## Open Questions
None — all questions resolved during discovery.
