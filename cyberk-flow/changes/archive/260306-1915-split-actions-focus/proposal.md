# Proposal: split-actions-focus

## Why

The split-layout-core change implemented the data model and rendering infrastructure for split terminal panes, but deliberately deferred user-facing actions and focus management. Users currently have no way to trigger splits, close individual panes, or navigate between panes. This change adds the commands, buttons, keyboard shortcuts, and focus tracking needed to make split terminals usable.

## Appetite

**M <=3d** — ~5h estimated (3h split actions + 2h focus management)

## Scope Boundaries

### In Scope
- 3 VS Code commands: splitHorizontal, splitVertical, closeSplitPane
- IPC messages for split/unsplit between extension host and webview
- `removeLeaf` operation in SplitModel for unsplit
- Split action buttons in tab bar area
- Keyboard shortcuts for split actions (Cmd+\ / Cmd+Shift+\)
- Pane-level focus tracking (`activePaneId`)
- Visual active pane indicator (border highlight)
- Click-to-focus on panes
- Active pane receives keyboard input
- Tab bar reflects active pane's session

### Out of Scope
- Drag-and-drop to rearrange panes
- Tab-to-split and split-to-tab conversion
- Keyboard navigation between panes (Cmd+Alt+Arrow)
- Context menu entries for split actions (deferred — buttons + shortcuts sufficient for MVP)
- Maximum split depth limit

## Capabilities

1. **Split Commands** — Register 3 VS Code commands that trigger split/unsplit via IPC
2. **Split IPC Messages** — New message types for bidirectional split communication
3. **SplitModel removeLeaf** — Tree operation to remove a leaf and collapse its parent branch
4. **Split UI Controls** — Buttons in tab bar toolbar area for split actions
5. **Focus Management** — Track, display, and switch active pane within a split tab

## Impact

- **Users**: Can split terminals horizontally/vertically, close individual panes, and navigate between panes by clicking
- **Developers**: New IPC message types and SplitModel operations available for future features

## Risk Rating

**LOW** — All patterns exist in codebase (command registration, IPC messages, DOM manipulation). No new dependencies. No architectural changes.

## UI Impact & E2E

**YES** — New buttons, visual indicators, and keyboard interactions. However:
- E2E = **NOT REQUIRED** — This is a webview-based extension where E2E testing requires VS Code test infrastructure that is complex to set up for webview interactions. Unit tests for SplitModel operations and integration tests for message handling provide sufficient coverage. The project's test infrastructure uses Vitest for unit tests only.
