# view-registration Delta Spec — add-panel-terminal-view

## ADDED Requirements

### Requirement: Panel View Container

`package.json` SHALL declare a view container in `contributes.viewsContainers.panel` with:
- `id`: `"anywhereTerminalPanel"`
- `title`: `"AnyWhere Terminal"`
- `icon`: `"media/icon.svg"`

#### Scenario: Panel view container is declared

Given `package.json` is inspected
Then `contributes.viewsContainers.panel` contains an entry with `id: "anywhereTerminalPanel"`, `title: "AnyWhere Terminal"`, and `icon: "media/icon.svg"`

### Requirement: Panel Webview View

`package.json` SHALL declare a view in `contributes.views.anywhereTerminalPanel` with:
- `id`: `"anywhereTerminal.panel"`
- `name`: `"AnyWhere Terminal"`
- `type`: `"webview"`

#### Scenario: Panel view is registered as webview type

Given `package.json` is inspected
Then `views.anywhereTerminalPanel` contains an entry with `id: "anywhereTerminal.panel"`, `name: "AnyWhere Terminal"`, and `type: "webview"`

### Requirement: Panel Activation Event

`package.json` SHALL include `"onView:anywhereTerminal.panel"` in the `activationEvents` array, in addition to the existing sidebar activation event.

#### Scenario: Extension activates on panel view open

Given `package.json` is inspected
Then `activationEvents` contains both `"onView:anywhereTerminal.sidebar"` and `"onView:anywhereTerminal.panel"`

### Requirement: Panel Provider Registration

`src/extension.ts` SHALL register a `TerminalViewProvider` instance for the panel view during `activate()`. The registration MUST:
- Instantiate `TerminalViewProvider` with `location: "panel"`
- Register via `vscode.window.registerWebviewViewProvider` with `TerminalViewProvider.panelViewType`
- Set `retainContextWhenHidden: true` in webview options
- Push the disposable to `context.subscriptions`

#### Scenario: Panel provider is registered with correct options

Given the extension activates
Then a `TerminalViewProvider` is registered for `"anywhereTerminal.panel"` with `retainContextWhenHidden: true`
And the panel instance uses `location: "panel"`

#### Scenario: Panel view gets its own PTY session

Given the panel view is opened
When the webview sends a `ready` message
Then a new PTY session is spawned independently of any sidebar session

## MODIFIED Requirements

_(none)_

## REMOVED Requirements

_(none)_

## RENAMED Requirements

_(none)_
