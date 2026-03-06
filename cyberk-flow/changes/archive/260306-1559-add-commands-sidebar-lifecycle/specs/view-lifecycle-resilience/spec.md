# view-lifecycle-resilience Specification

## Purpose

Ensure PTY processes survive webview disposal, implement scrollback cache replay on webview re-creation, and handle visibility changes for output flushing.

## ADDED Requirements

### Requirement: Scrollback Cache Replay on Webview Re-creation

When `TerminalViewProvider.resolveWebviewView()` is called and sessions already exist for the view's `viewId` in SessionManager, the provider SHALL detect this as a re-creation scenario. On receiving the `ready` message from the re-created webview:

1. The provider MUST NOT create a new session — it SHALL reuse existing sessions
2. The provider SHALL update the webview reference for all existing sessions via `sessionManager.updateWebviewForView(viewId, webview)`
3. The provider SHALL send an `init` message with the existing tabs from `sessionManager.getTabsForView(viewId)`
4. For each session in the view, the provider SHALL send a `restore` message: `{ type: 'restore', tabId: session.id, data: session.scrollbackCache.join('') }`
5. After all restore messages are sent, the provider SHALL resume output flushing for the view

#### Scenario: Webview re-created after disposal restores sessions

- **Given**: A sidebar view has sessions "s1" and "s2" with scrollback data
- **And**: The webview is disposed by VS Code (retainContextWhenHidden fails)
- **When**: The user re-opens the sidebar and `resolveWebviewView()` is called again
- **And**: The webview sends `ready`
- **Then**: No new sessions are created
- **And**: The webview receives `init` with tabs [{id: "s1", ...}, {id: "s2", ...}]
- **And**: The webview receives `restore` messages for both "s1" and "s2" with cached data

#### Scenario: First-time view creation creates new session

- **Given**: No sessions exist for the sidebar viewId
- **When**: `resolveWebviewView()` is called and webview sends `ready`
- **Then**: A new session is created via `sessionManager.createSession()`
- **And**: The webview receives `init` with the new session

### Requirement: SessionManager Webview Reference Update

`SessionManager` SHALL expose a public method `updateWebviewForView(viewId: string, webview: MessageSender): void` that updates the webview reference for all sessions belonging to the given view. This MUST also update each session's `OutputBuffer` webview reference.

#### Scenario: Webview reference updated for all sessions

- **Given**: View "sidebar" has sessions "s1" and "s2" with old webview reference
- **When**: `updateWebviewForView("sidebar", newWebview)` is called
- **Then**: Both sessions' webview references are updated to `newWebview`
- **And**: Both sessions' OutputBuffer instances use the new webview for postMessage

### Requirement: Scrollback Cache Access

`SessionManager` SHALL expose a public method `getScrollbackData(sessionId: string): string` that returns the joined scrollback cache for a session. If the session does not exist, it SHALL return an empty string.

#### Scenario: Get scrollback data for existing session

- **Given**: Session "s1" has scrollback cache ["hello", " world"]
- **When**: `getScrollbackData("s1")` is called
- **Then**: It returns "hello world"

### Requirement: View Visibility Output Pause

When `TerminalViewProvider` detects a visibility change to hidden (via `onDidChangeVisibility` with `visible: false`), it SHALL call `sessionManager.pauseOutputForView(viewId)`. When visibility changes to visible, it SHALL call `sessionManager.resumeOutputForView(viewId)`.

`SessionManager` SHALL implement:
- `pauseOutputForView(viewId: string)`: Pause the OutputBuffer flush timer for all sessions in the view. PTY data continues to accumulate in the scrollback cache but is not flushed to the webview.
- `resumeOutputForView(viewId: string)`: Resume the OutputBuffer flush timer for all sessions in the view. Any buffered data is flushed immediately.

#### Scenario: Output paused when view hidden

- **Given**: The sidebar view is visible with active terminal output
- **When**: The user collapses the sidebar (visibility changes to false)
- **Then**: `pauseOutputForView` is called
- **And**: OutputBuffer stops flushing to the webview
- **And**: PTY data continues to accumulate in scrollback cache

#### Scenario: Output resumed when view shown

- **Given**: The sidebar view was hidden with buffered output
- **When**: The user expands the sidebar (visibility changes to true)
- **Then**: `resumeOutputForView` is called
- **And**: Any buffered data is flushed immediately to the webview

### Requirement: PTY Anchored to Extension Host

PTY processes SHALL be anchored to the Extension Host lifecycle, NOT the WebView lifecycle. This is already the case by design (PTY is managed by SessionManager in the Extension Host), but the following invariants MUST be maintained:

- WebView disposal (`onDidDispose`) SHALL NOT kill PTY sessions unless the view is being permanently closed (not just hidden/re-created)
- The `onDidDispose` handler SHALL only call `destroyAllForView()` when the extension is deactivating or the view is explicitly closed by the user
- For re-creation scenarios (webview disposed but view still registered), sessions MUST survive

#### Scenario: PTY survives webview disposal

- **Given**: A sidebar view has session "s1" with a running PTY
- **And**: The webview is disposed by VS Code
- **When**: The webview is re-created
- **Then**: Session "s1" still exists in SessionManager with its PTY running
- **And**: The scrollback cache contains all output since the original creation

#### Scenario: PTY killed on permanent view close

- **Given**: A sidebar view has session "s1"
- **When**: The extension is deactivated (SessionManager.dispose() called)
- **Then**: Session "s1" is destroyed and its PTY is killed

### Requirement: OutputBuffer Pause and Resume

`OutputBuffer` SHALL expose `pause()` and `resume()` methods:

- `pause()`: Stop the flush timer. Data appended via `append()` is still buffered but not flushed to the webview. Flow control (PTY pause/resume) continues to operate independently.
- `resume()`: Restart the flush timer. If there is buffered data, flush immediately.

#### Scenario: Paused buffer accumulates data

- **Given**: An OutputBuffer is paused
- **When**: PTY produces output via `append(data)`
- **Then**: Data is buffered internally
- **And**: No `postMessage` is sent to the webview

#### Scenario: Resume flushes accumulated data

- **Given**: An OutputBuffer is paused with 10KB of buffered data
- **When**: `resume()` is called
- **Then**: The buffered data is flushed immediately via `postMessage`
- **And**: The flush timer is restarted for future data
