# split-ui-controls Specification

## Purpose
TBD
## Requirements

### Requirement: Split Action Buttons in View Title

The extension SHALL add split action buttons to the view title toolbar for sidebar and panel views. The buttons MUST:

- Include a "Split Vertical" button with the `$(split-horizontal)` codicon icon
- Include a "Split Horizontal" button with the `$(split-vertical)` codicon icon (note: VS Code codicon naming is inverted — `split-horizontal` icon shows a vertical divider)
- Be declared in `package.json` under `contributes.menus.view/title`
- Have a `when` clause scoped to `view == anywhereTerminal.sidebar || view == anywhereTerminal.panel`
- Be placed in the `navigation` group for toolbar visibility

#### Scenario: Split buttons appear in sidebar toolbar
- **Given** the sidebar terminal view is visible
- **When** the user looks at the view title bar
- **Then** split-vertical and split-horizontal buttons are visible in the toolbar

### Requirement: Split Buttons Trigger Commands

Each split button MUST trigger its corresponding command when clicked:

- Split Vertical button → `anywhereTerminal.splitVertical`
- Split Horizontal button → `anywhereTerminal.splitHorizontal`

#### Scenario: Clicking split vertical button triggers command
- **Given** the sidebar terminal view is visible
- **When** the user clicks the split-vertical button in the toolbar
- **Then** the `anywhereTerminal.splitVertical` command is executed

