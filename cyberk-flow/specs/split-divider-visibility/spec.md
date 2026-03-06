# split-divider-visibility Specification

## Purpose
TBD
## Requirements

### Requirement: Split Handle Visual Separator

A resize handle element SHALL be rendered between the two children of a branch node with a visible 1px separator line at rest. The separator MUST use the VS Code theme color `--vscode-panel-border` (with a fallback). On hover, the handle SHALL expand to show the full 4px sash indicator using `--vscode-sash-hoverBorder`.

#### Scenario: Divider visible at rest

- Given a split layout with 2 panes
- When the split tree is rendered
- Then the `.split-handle` element SHALL have a visible background color using `--vscode-panel-border`
- And the handle SHALL NOT have `opacity: 0` at rest

#### Scenario: Divider hover feedback

- Given a visible split handle
- When the user hovers over the handle
- Then the handle background SHALL change to `--vscode-sash-hoverBorder` to indicate it is draggable

