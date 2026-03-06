# provider-integration Specification

## Purpose

Define how TerminalViewProvider is refactored to delegate session management to SessionManager.

## ADDED Requirements

### Requirement: TerminalViewProvider SessionManager Integration

`TerminalViewProvider` SHALL accept a `SessionManager` instance in its constructor and delegate all session operations to it. The provider MUST:
- Remove direct `PtySession`, `OutputBuffer`, and `PtyManager` usage
- On `ready` message: call `sessionManager.createSession(viewId, webview)` and send `init` with tabs from `sessionManager.getTabsForView(viewId)`
- On `input` message: call `sessionManager.writeToSession(tabId, data)`
- On `resize` message: call `sessionManager.resizeSession(tabId, cols, rows)`
- On `ack` message: forward to the session's output buffer via SessionManager
- On `createTab` message: call `sessionManager.createSession(viewId, webview)`, send `tabCreated` to webview
- On `switchTab` message: call `sessionManager.switchActiveSession(viewId, tabId)`
- On `closeTab` message: call `sessionManager.destroySession(tabId)`, send `tabRemoved` to webview
- On `clear` message: call `sessionManager.clearScrollback(tabId)`
- On view dispose: call `sessionManager.destroyAllForView(viewId)`

#### Scenario: Ready message creates session via SessionManager

- **Given**: TerminalViewProvider is initialized with a SessionManager
- **When**: The webview sends `{ type: 'ready' }`
- **Then**: The provider calls `sessionManager.createSession(viewId, webview)`
- **And**: Sends `init` message with tabs from `sessionManager.getTabsForView(viewId)`

#### Scenario: CreateTab message creates new session

- **Given**: A sidebar view has one active session
- **When**: The webview sends `{ type: 'createTab' }`
- **Then**: The provider calls `sessionManager.createSession(viewId, webview)`
- **And**: Sends `tabCreated` message with the new session's ID and name

#### Scenario: CloseTab message destroys session

- **Given**: A sidebar view has sessions "s1" and "s2"
- **When**: The webview sends `{ type: 'closeTab', tabId: 's1' }`
- **Then**: The provider calls `sessionManager.destroySession('s1')`
- **And**: Sends `tabRemoved` message with tabId 's1'

### Requirement: Shared HTML Generation

The HTML generation logic (`getHtmlForWebview`) SHALL be extracted to a shared utility function `getTerminalHtml(webview, extensionUri, location)` that both `TerminalViewProvider` and `TerminalEditorProvider` use. This eliminates code duplication.

#### Scenario: Both providers generate identical HTML structure

- **Given**: A sidebar provider and an editor provider
- **When**: Both generate HTML for their webviews
- **Then**: The HTML structure is identical except for `data-terminal-location` attribute
- **And**: CSP, nonce, script/style URIs follow the same pattern
