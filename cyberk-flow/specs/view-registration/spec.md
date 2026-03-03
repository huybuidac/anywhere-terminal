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

