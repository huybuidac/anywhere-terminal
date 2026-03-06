# Proposal: split-layout-core

## Why

The terminal extension currently uses a flat tab model where each tab contains exactly one terminal. Users need the ability to split a tab into multiple terminal panes (horizontal/vertical) for side-by-side workflows — a core feature of modern terminal applications. This change implements the foundational data model, recursive UI rendering, and drag-to-resize handles for split views within tabs.

## Appetite

**M ≤3d** — Three focused tasks (data model, container UI, resize handles) with clear boundaries and no external dependencies.

## Scope Boundaries

### In Scope
- Binary split tree data model (`SplitNode = LeafNode | BranchNode`)
- `SplitContainer` component that recursively renders the split tree
- Resize handles (dividers) between split panes with drag-to-resize
- Minimum pane size constraint (80px)
- CSS flexbox layout for horizontal/vertical splits
- Per-leaf `FitAddon` fitting after resize
- State serialization/deserialization for persistence

### Out of Scope
- Split/unsplit commands and keybindings (separate change)
- Drag-and-drop to rearrange panes
- Tab-to-split and split-to-tab conversion UI
- Focus management and keyboard navigation between panes
- IPC message changes (extension host side)
- Context menu for split actions

## Capabilities

1. **Split Layout Data Model** — Tree-based layout model with `LeafNode` (terminal) and `BranchNode` (direction + ratio + children)
2. **Split Container UI** — Recursive rendering of split tree into nested flexbox containers with xterm.js terminals at leaves
3. **Resize Handles** — Drag-to-resize dividers between split panes with minimum size constraints and cursor feedback

## Impact

- **Users**: Foundation for split terminal panes (no user-visible change yet — needs split commands to trigger splits)
- **Developers**: New modules in `src/webview/` for split layout; existing `main.ts` will integrate with split container
- **Systems**: No extension host changes; all changes are webview-side

## Risk Rating

**MEDIUM** — Cross-cutting change touching data model, UI rendering, and resize handling. Integration with existing terminal instance management requires careful coordination. However, all changes are webview-side with no IPC or extension host impact.

## UI Impact & E2E

**User-visible UI behavior affected?** YES — This change affects UI behavior (split pane rendering, resize handles).
**E2E required?** NOT REQUIRED — The split layout is foundational infrastructure with no user-triggerable split action yet. Unit tests cover the data model and resize logic. E2E will be added when split commands are implemented.
