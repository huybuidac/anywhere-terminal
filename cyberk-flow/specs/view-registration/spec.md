# view-registration Specification

## Purpose
TBD
## Requirements

### Requirement: Activity Bar View Container

`package.json` SHALL declare a view container in `contributes.viewsContainers.activitybar` with:
- `id`: `"anywhereTerminal"`
- `title`: `"AnyWhere Terminal"`
- `icon`: `"$(terminal)"` (VS Code product icon reference)

#### Scenario: Activity bar shows AnyWhere Terminal icon

Given VS Code loads the extension
Then an icon labeled "AnyWhere Terminal" appears in the Activity Bar

### Requirement: Sidebar Webview View

`package.json` SHALL declare a view in `contributes.views.anywhereTerminal` with:
- `id`: `"anywhereTerminal.sidebar"`
- `name`: `"Terminal"`
- `type`: `"webview"`

#### Scenario: Sidebar view is registered as webview type

Given `package.json` is inspected
Then `views.anywhereTerminal` contains an entry with `id: "anywhereTerminal.sidebar"` and `type: "webview"`

### Requirement: Activation Event

`package.json` SHALL declare `onView:anywhereTerminal.sidebar` in the `activationEvents` array. This ensures the extension activates when the user first opens the sidebar view.

The existing `anywhere-terminal.helloWorld` command and its registration SHALL be removed.

#### Scenario: Extension activates on sidebar view open

Given `package.json` is inspected
Then `activationEvents` contains `"onView:anywhereTerminal.sidebar"`
And no `helloWorld` command exists in `contributes.commands`

### Requirement: Minimal Provider Stub

`src/extension.ts` SHALL register a minimal `WebviewViewProvider` for `anywhereTerminal.sidebar` during `activate()`. The provider MUST:
- Set `enableScripts: true` and `localResourceRoots` to the `media/` directory
- Set `retainContextWhenHidden: true` at registration
- Render a placeholder HTML page (e.g., "Terminal loading...") so the view does not error

This stub will be replaced by the full `TerminalViewProvider` in task 1.3.

#### Scenario: Sidebar view renders without errors

Given the extension is activated via the sidebar view
Then the webview displays placeholder content without console errors

### Requirement: Extension Main Entry

`package.json` `"main"` field SHALL point to `"./dist/extension.js"` (already correct). The build output path in esbuild MUST match this.

#### Scenario: Main entry matches build output

Given `package.json` `main` is `"./dist/extension.js"`
And esbuild extension config `outfile` is `"./dist/extension.js"`
Then the paths are consistent

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

