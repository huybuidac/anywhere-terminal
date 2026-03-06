# split-commands Specification

## Purpose
TBD
## Requirements

### Requirement: Split Horizontal Command

The extension SHALL register a command `anywhereTerminal.splitHorizontal` that splits the active terminal pane horizontally (top/bottom). The command MUST:

- Be declared in `package.json` under `contributes.commands`
- Send a `splitPane` message to the focused view's webview with `direction: 'horizontal'`
- Be a no-op if no view is visible or no active pane exists
- Be available in the view title menu with a split-horizontal icon

#### Scenario: Split horizontal command sends message to webview
- **Given** the sidebar view is visible with an active terminal pane
- **When** the user executes `anywhereTerminal.splitHorizontal`
- **Then** a `{ type: 'splitPane', direction: 'horizontal' }` message is posted to the sidebar webview

#### Scenario: Split horizontal is no-op without visible view
- **Given** no terminal view is visible
- **When** the user executes `anywhereTerminal.splitHorizontal`
- **Then** nothing happens (no error thrown)

### Requirement: Split Vertical Command

The extension SHALL register a command `anywhereTerminal.splitVertical` that splits the active terminal pane vertically (left/right). The command MUST:

- Be declared in `package.json` under `contributes.commands`
- Send a `splitPane` message to the focused view's webview with `direction: 'vertical'`
- Be a no-op if no view is visible or no active pane exists

#### Scenario: Split vertical command sends message to webview
- **Given** the panel view is visible and focused with an active terminal pane
- **When** the user executes `anywhereTerminal.splitVertical`
- **Then** a `{ type: 'splitPane', direction: 'vertical' }` message is posted to the panel webview

### Requirement: Close Split Pane Command

The extension SHALL register a command `anywhereTerminal.closeSplitPane` that closes the active pane within a split layout. The command MUST:

- Be declared in `package.json` under `contributes.commands`
- Send a `closeSplitPane` message to the focused view's webview
- If the tab has only one pane (no splits), behave identically to closing the tab
- Be a no-op if no view is visible

#### Scenario: Close pane in split layout
- **Given** a tab with two split panes, pane "b" is active
- **When** the user executes `anywhereTerminal.closeSplitPane`
- **Then** a `{ type: 'closeSplitPane' }` message is posted to the webview

### Requirement: Split Keyboard Shortcuts

The extension SHALL register keyboard shortcuts for split actions:

- `Cmd+\` (Mac) / `Ctrl+\` (Windows/Linux) → `anywhereTerminal.splitVertical`
- `Cmd+Shift+\` (Mac) / `Ctrl+Shift+\` (Windows/Linux) → `anywhereTerminal.splitHorizontal`

Shortcuts MUST be scoped with a `when` clause to only activate when an anywhere-terminal view is focused.

#### Scenario: Keyboard shortcut triggers split
- **Given** the sidebar terminal view is focused on macOS
- **When** the user presses Cmd+\
- **Then** the `anywhereTerminal.splitVertical` command is executed

### Requirement: Split Commands in Package Manifest

The `package.json` MUST declare the split commands and keybindings:

- Commands: `anywhereTerminal.splitHorizontal`, `anywhereTerminal.splitVertical`, `anywhereTerminal.closeSplitPane`
- Keybindings with appropriate `when` clauses
- Menu entries in `view/title` for split buttons with codicon icons (`split-horizontal`, `split-vertical`)

#### Scenario: Package manifest includes split commands
- **Given** the extension's package.json
- **When** inspected
- **Then** it contains command declarations for splitHorizontal, splitVertical, and closeSplitPane with titles prefixed "AnyWhere Terminal:"

