# commands-registration Specification

## Purpose

Register all terminal commands in package.json and extension.ts, and add view toolbar menu buttons for common operations.

## ADDED Requirements

### Requirement: Command Declarations

`package.json` SHALL declare the following commands under `contributes.commands`:

- `anywhereTerminal.newTerminal` with title `"AnyWhere Terminal: New Terminal"`
- `anywhereTerminal.killTerminal` with title `"AnyWhere Terminal: Kill Terminal"`
- `anywhereTerminal.clearTerminal` with title `"AnyWhere Terminal: Clear Terminal"`
- `anywhereTerminal.focusSidebar` with title `"AnyWhere Terminal: Focus Sidebar"`
- `anywhereTerminal.focusPanel` with title `"AnyWhere Terminal: Focus Panel"`

The existing `anywhereTerminal.newTerminalInEditor` command declaration SHALL be preserved.

#### Scenario: All commands appear in Command Palette

- **Given**: The extension is installed and active
- **When**: User opens Command Palette and types "AnyWhere Terminal"
- **Then**: All 6 commands appear: New Terminal, New Terminal in Editor, Kill Terminal, Clear Terminal, Focus Sidebar, Focus Panel

### Requirement: Command Handler Registration

`extension.ts` SHALL register command handlers for all new commands during `activate()`:

- `anywhereTerminal.newTerminal`: Determine the currently focused view (sidebar or panel) and send a `createTab` message to its webview. If no view is focused, default to sidebar.
- `anywhereTerminal.killTerminal`: Determine the currently focused view, get its active session, and call `sessionManager.destroySession(activeSessionId)`. Send `tabRemoved` to the webview.
- `anywhereTerminal.clearTerminal`: Determine the currently focused view, get its active session, and call `sessionManager.clearScrollback(activeSessionId)`. Send a `clear` message to the webview to reset xterm.
- `anywhereTerminal.focusSidebar`: Execute `vscode.commands.executeCommand('anywhereTerminal.sidebar.focus')` to focus the sidebar view.
- `anywhereTerminal.focusPanel`: Execute `vscode.commands.executeCommand('anywhereTerminal.panel.focus')` to focus the panel view.

All command disposables MUST be pushed to `context.subscriptions`.

#### Scenario: newTerminal creates tab in focused view

- **Given**: The sidebar view is focused with one terminal
- **When**: User executes `anywhereTerminal.newTerminal`
- **Then**: A new terminal session is created in the sidebar view
- **And**: The webview receives a `tabCreated` message

#### Scenario: killTerminal destroys active session

- **Given**: The sidebar view is focused with terminal "Terminal 1" active
- **When**: User executes `anywhereTerminal.killTerminal`
- **Then**: The active session is destroyed via `sessionManager.destroySession()`
- **And**: The webview receives a `tabRemoved` message

#### Scenario: clearTerminal clears active terminal

- **Given**: The sidebar view is focused with terminal "Terminal 1" active
- **When**: User executes `anywhereTerminal.clearTerminal`
- **Then**: `sessionManager.clearScrollback()` is called for the active session

#### Scenario: focusSidebar focuses sidebar view

- **Given**: The sidebar view exists but is not focused
- **When**: User executes `anywhereTerminal.focusSidebar`
- **Then**: The sidebar view receives focus via `anywhereTerminal.sidebar.focus`

#### Scenario: focusPanel focuses panel view

- **Given**: The panel view exists but is not focused
- **When**: User executes `anywhereTerminal.focusPanel`
- **Then**: The panel view receives focus via `anywhereTerminal.panel.focus`

### Requirement: View Toolbar Menu Buttons

`package.json` SHALL declare `contributes.menus` entries for `view/title` context:

- New terminal button: command `anywhereTerminal.newTerminal`, group `navigation`, icon `$(plus)`, when clause `view == anywhereTerminal.sidebar || view == anywhereTerminal.panel`
- Kill terminal button: command `anywhereTerminal.killTerminal`, group `navigation`, icon `$(trash)`, when clause `view == anywhereTerminal.sidebar || view == anywhereTerminal.panel`

#### Scenario: Toolbar shows + and trash icons

- **Given**: The sidebar view is visible
- **Then**: The view title bar shows a "+" icon (new terminal) and a trash icon (kill terminal)
- **And**: Clicking "+" creates a new terminal tab
- **And**: Clicking trash kills the active terminal

### Requirement: Command Activation Events

`package.json` SHALL include activation events for commands that may be invoked before the extension is active:

- `onCommand:anywhereTerminal.newTerminal`
- `onCommand:anywhereTerminal.focusSidebar`
- `onCommand:anywhereTerminal.focusPanel`

The `killTerminal` and `clearTerminal` commands do NOT need activation events because they only make sense when a terminal view is already open (which activates the extension via `onView`).

#### Scenario: Extension activates on newTerminal command

- **Given**: The extension is not yet activated
- **When**: User executes `anywhereTerminal.newTerminal` from Command Palette
- **Then**: The extension activates and the command handler runs

### Requirement: Provider Public Access for Commands

`TerminalViewProvider` SHALL expose a public method to access the current webview for command handlers:

- `getActiveSessionId(): string | undefined` — returns the active session ID for this view, or undefined if no sessions exist
- The existing `view` getter SHALL remain public for webview access

`extension.ts` SHALL store references to the sidebar and panel providers so command handlers can access them.

#### Scenario: Command handler accesses provider

- **Given**: The sidebar provider has an active session "s1"
- **When**: A command handler calls `sidebarProvider.getActiveSessionId()`
- **Then**: It returns "s1"

#### Scenario: No active session returns undefined

- **Given**: The sidebar provider has no sessions (view not yet opened)
- **When**: A command handler calls `sidebarProvider.getActiveSessionId()`
- **Then**: It returns `undefined`
