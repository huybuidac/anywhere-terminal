# secondary-sidebar Specification

## Purpose

Enable users to place the terminal view in the VS Code Secondary Sidebar via a dedicated command and documented instructions.

## ADDED Requirements

### Requirement: Move to Secondary Command

`package.json` SHALL declare the command `anywhereTerminal.moveToSecondary` with title `"AnyWhere Terminal: Move to Secondary Sidebar"`.

`extension.ts` SHALL register a handler that:
1. Focuses the sidebar terminal view via `vscode.commands.executeCommand('anywhereTerminal.sidebar.focus')`
2. Executes `vscode.commands.executeCommand('workbench.action.moveView')` to open VS Code's "Move View" dialog

The command disposable MUST be pushed to `context.subscriptions`.

#### Scenario: Move to secondary sidebar

- **Given**: The sidebar terminal view is registered
- **When**: User executes `anywhereTerminal.moveToSecondary`
- **Then**: The sidebar view is focused
- **And**: VS Code's "Move View" dialog opens, allowing the user to select "Secondary Sidebar"

#### Scenario: Command works when sidebar is not visible

- **Given**: The sidebar terminal view exists but is collapsed
- **When**: User executes `anywhereTerminal.moveToSecondary`
- **Then**: The sidebar view is first focused (which expands it)
- **And**: The "Move View" dialog opens

### Requirement: Move Command Activation Event

`package.json` SHALL include `onCommand:anywhereTerminal.moveToSecondary` in the `activationEvents` array.

#### Scenario: Extension activates on moveToSecondary command

- **Given**: The extension is not yet activated
- **When**: User executes `anywhereTerminal.moveToSecondary`
- **Then**: The extension activates and the command handler runs
