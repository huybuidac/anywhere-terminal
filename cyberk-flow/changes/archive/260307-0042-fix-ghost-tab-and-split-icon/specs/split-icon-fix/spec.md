# Spec: split-icon-fix

## MODIFIED Requirements

### Requirement: Split Action Button Icon Mapping

> Original: `anywhereTerminal.splitHorizontal` uses `$(split-horizontal)` and `anywhereTerminal.splitVertical` uses `$(split-vertical)` in package.json

The `anywhereTerminal.splitVertical` command (splits left/right) SHALL use the `$(split-horizontal)` codicon (panes arranged horizontally, side by side). The `anywhereTerminal.splitHorizontal` command (splits top/bottom) SHALL use the `$(split-vertical)` codicon (panes arranged vertically, stacked).

This follows VS Code's codicon convention where the name describes the **pane arrangement**, not the split-line direction.

#### Scenario: Icon matches visual result

- `anywhereTerminal.splitVertical` → `$(split-horizontal)` (side-by-side icon)
- `anywhereTerminal.splitHorizontal` → `$(split-vertical)` (stacked icon)
