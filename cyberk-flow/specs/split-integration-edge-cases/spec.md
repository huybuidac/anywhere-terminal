# split-integration-edge-cases Specification

## Purpose

Specifies edge case handling for split terminal integration: last-pane close behavior, recursive split correctness, view resize propagation, and layout persistence.

## Requirements

### Requirement: Last Pane Close Creates New Default Terminal

When the user closes the last pane in the last tab, the webview SHALL request creation of a new default terminal rather than leaving the view empty. Specifically:

- When `closeSplitPane` is handled and the layout is a single leaf, the handler MUST send a `closeTab` message
- When `removeTerminal` is called and no remaining tabs exist, the webview MUST send a `createTab` message to the extension host to create a new default terminal
- The new terminal MUST become the active tab

#### Scenario: Closing last pane in last tab creates new terminal
- **Given** a single tab with a single pane (no splits, no other tabs)
- **When** the user triggers `closeSplitPane`
- **Then** the webview sends `closeTab` for the current tab, and upon receiving `tabRemoved` with no remaining tabs, sends `createTab` to create a new default terminal

#### Scenario: Closing last pane in split with other tabs switches to sibling tab
- **Given** two tabs, the active tab has a single pane
- **When** the user triggers `closeSplitPane` on the active tab
- **Then** the tab is closed and the remaining tab becomes active (no new terminal created)

### Requirement: Recursive Split Tree Restructuring

The split tree MUST correctly handle recursive splitting and closing of inner panes. When a pane is closed in a deeply nested tree:

- The `removeLeaf` function SHALL collapse the parent branch, promoting the sibling to the parent's position
- After restructuring, all remaining panes MUST be correctly rendered and functional
- The active pane MUST be set to the first leaf in the remaining tree if the closed pane was active

#### Scenario: Close inner pane in triple split
- **Given** a tab with layout: branch(vertical, [leaf("a"), branch(horizontal, [leaf("b"), leaf("c")])])
- **When** pane "b" is closed
- **Then** the layout becomes branch(vertical, [leaf("a"), leaf("c")]) and pane "c" or "a" becomes active

#### Scenario: Close pane in deeply nested split
- **Given** a tab with 4 panes created by recursive splitting: a → split → b, then b → split → c, then c → split → d
- **When** pane "c" is closed
- **Then** the tree restructures correctly, panes "a", "b", "d" remain functional, and the active pane updates

### Requirement: View Resize Propagates to All Split Panes

When the overall view container resizes (e.g., sidebar width change, window resize), ALL terminal panes in the active tab's split tree SHALL be re-fitted. The `debouncedFit` function MUST:

- Iterate all session IDs from `getAllSessionIds(layout)` for the active tab
- Call `fitAddon.fit()` on each terminal instance
- Send per-pane resize messages to the extension host (triggered by xterm's `onResize` event)

#### Scenario: Sidebar resize fits all split panes
- **Given** a tab with 3 split panes
- **When** the user resizes the sidebar
- **Then** all 3 panes are re-fitted and each sends its own resize message to the extension host

### Requirement: Split Layout Persists Across Hide/Show

The split layout tree and active pane IDs MUST persist across webview hide/show cycles via `vscode.setState()` / `vscode.getState()`. On view show:

- The `onViewShow` handler SHALL re-fit all panes in the active tab's split tree
- The layout tree structure MUST be preserved (branch directions, ratios, session IDs)
- The active pane ID MUST be restored

#### Scenario: Split layout survives hide/show
- **Given** a tab with a vertical split (panes "a" and "b", ratio 0.6, pane "b" active)
- **When** the webview is hidden and then shown again
- **Then** the layout is restored with the same structure, ratio, and active pane

