# spawn-error-handling Specification

## Purpose
TBD
## Requirements

### Requirement: Graceful PTY Spawn Failure

When `SessionManager.createSession()` throws during tab creation or split session creation, the `TerminalViewProvider` SHALL catch the error and send an `ErrorMessage` to the webview with a user-friendly description.

#### Scenario: createTab fails due to spawn error

- Given the user clicks "+" to create a new tab
- When `createSession()` throws a `SpawnError` or `ShellNotFoundError`
- Then the provider SHALL send `{ type: "error", message: "<description>", severity: "error" }` to the webview
- And the provider SHALL NOT crash or leave the view in a broken state

#### Scenario: Split session creation fails

- Given the user requests a split pane
- When `createSession()` throws during split session creation
- Then the provider SHALL send an error message to the webview
- And existing terminals SHALL remain unaffected

### Requirement: node-pty Load Failure Display

When `PtyLoadError` is thrown during extension activation, the extension SHALL show a VS Code error notification with version requirements. Subsequent `createSession()` calls SHALL fail gracefully, catching the `PtyLoadError` and sending an `ErrorMessage` to the webview.

#### Scenario: node-pty not found on activation

- Given VS Code version does not bundle node-pty
- When the extension activates and `loadNodePty()` throws `PtyLoadError`
- Then `vscode.window.showErrorMessage()` SHALL be called with message containing "VS Code >= 1.109.0"
- And the extension SHALL continue to activate (not crash)

#### Scenario: createSession after PtyLoadError

- Given node-pty failed to load during activation
- When a user creates a new tab (triggering `createSession()`)
- Then `createSession()` SHALL throw `PtyLoadError`
- And the provider SHALL catch it and send `{ type: "error", severity: "error" }` to the webview

