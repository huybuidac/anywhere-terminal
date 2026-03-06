# editor-session-manager Specification

## Purpose
TBD
## Requirements

### Requirement: Editor Terminal SessionManager Integration

`TerminalEditorProvider` SHALL accept a `SessionManager` instance and delegate all session operations to it. The `createPanel` static method MUST:
- Accept `SessionManager` as a parameter
- Generate a unique `viewId` using `editor-${crypto.randomUUID()}`
- Use the shared `getTerminalHtml()` utility for HTML generation
- On `ready` message: call `sessionManager.createSession(viewId, webview)` and send `init`
- On `input`, `resize`, `ack` messages: delegate to SessionManager
- On `createTab`, `switchTab`, `closeTab`, `clear` messages: delegate to SessionManager
- On `panel.onDidDispose()`: call `sessionManager.destroyAllForView(viewId)`

#### Scenario: Editor terminal creates session via SessionManager

- **Given**: User executes `anywhereTerminal.newTerminalInEditor`
- **When**: The editor webview sends `{ type: 'ready' }`
- **Then**: The provider calls `sessionManager.createSession(viewId, webview)` with a unique editor viewId
- **And**: Sends `init` message with the session tab info

#### Scenario: Editor panel close destroys all sessions for that view

- **Given**: An editor terminal has sessions managed by SessionManager
- **When**: User closes the editor tab
- **Then**: `sessionManager.destroyAllForView(viewId)` is called
- **And**: All PTY processes for that editor panel are killed

### Requirement: Extension Activation Wiring

`extension.ts` SHALL be updated to:
1. Create a single `SessionManager` instance (singleton)
2. Pass the SessionManager to both `TerminalViewProvider` instances (sidebar, panel)
3. Pass the SessionManager to `TerminalEditorProvider.createPanel()`
4. Register the SessionManager in `context.subscriptions` for automatic disposal

#### Scenario: Extension activation creates shared SessionManager

- **Given**: The extension activates
- **When**: `activate(context)` runs
- **Then**: A single SessionManager is created
- **And**: Both sidebar and panel providers receive the same SessionManager instance
- **And**: The editor terminal command handler passes SessionManager to createPanel
- **And**: SessionManager is registered for disposal on deactivation

