# editor-terminal-provider Specification

## Purpose
TBD
## Requirements

### Requirement: Editor Panel Creation

`TerminalEditorProvider` SHALL create a `WebviewPanel` in the editor area using `vscode.window.createWebviewPanel()`. The panel MUST be configured with:

- `viewType`: `"anywhereTerminal.editor"`
- `title`: `"Terminal"` (displayed in editor tab)
- `showOptions`: `vscode.ViewColumn.Active` (opens in active editor column)
- `options.enableScripts`: `true`
- `options.retainContextWhenHidden`: `true`
- `options.localResourceRoots`: restricted to extension's `media/` directory

The panel SHALL generate HTML content with:
- CSP with nonce-based script security (same policy as `TerminalViewProvider`)
- `data-terminal-location="editor"` attribute on `<body>`
- Same DOM structure: `#tab-bar` + `#terminal-container`

#### Scenario: User opens editor terminal via command

- **Given**: The extension is active
- **When**: User executes `anywhereTerminal.newTerminalInEditor` command
- **Then**: A new WebviewPanel opens in the active editor column with title "Terminal"
- **And**: The webview loads xterm.js and sends `ready` message
- **And**: A PTY session is spawned and `init` message is sent to webview
- **And**: The shell prompt appears in the terminal

#### Scenario: Multiple editor terminals

- **Given**: An editor terminal is already open
- **When**: User executes `anywhereTerminal.newTerminalInEditor` again
- **Then**: A second independent WebviewPanel opens with its own PTY session
- **And**: Both terminals operate independently

### Requirement: Editor Panel Message Handling

`TerminalEditorProvider` SHALL handle the same message protocol as `TerminalViewProvider`. Specifically, it MUST:

- Handle `ready` message: spawn PTY, create OutputBuffer, send `init` message
- Handle `input` message: forward data to PTY session (with tabId validation)
- Handle `resize` message: resize PTY (with dimension validation)
- Handle `ack` message: forward to OutputBuffer flow control
- Handle PTY `onData`: buffer output and flush to webview
- Handle PTY `onExit`: dispose buffer, send `exit` message to webview

#### Scenario: Keystroke round-trip in editor terminal

- **Given**: An editor terminal is open with active PTY
- **When**: User types a character
- **Then**: Input is forwarded to PTY via `input` message
- **And**: PTY output is buffered and flushed to webview via `output` message

### Requirement: Editor Panel Lifecycle

`TerminalEditorProvider` SHALL manage panel lifecycle:

- On `panel.onDidDispose()`: kill PTY session, dispose OutputBuffer, clean up all references
- Each panel instance SHALL generate a unique `viewId` using `editor-${crypto.randomUUID()}`
- The provider MUST use `safePostMessage()` pattern to handle disposed panel gracefully

#### Scenario: User closes editor terminal tab

- **Given**: An editor terminal is open with running shell
- **When**: User closes the editor tab (click X or Cmd+W)
- **Then**: `panel.onDidDispose()` fires
- **And**: PTY process is killed
- **And**: OutputBuffer is disposed
- **And**: No resource leaks (listeners, timers)

#### Scenario: PTY process exits in editor terminal

- **Given**: An editor terminal is open
- **When**: The shell process exits (user types `exit` or process crashes)
- **Then**: Remaining output buffer is flushed
- **And**: `exit` message is sent to webview with exit code
- **And**: Terminal shows `[Process exited with code N]`

#### Scenario: Extension deactivation with open editor terminals

- **Given**: One or more editor terminals are open with running PTYs
- **When**: The extension deactivates (VS Code closing or extension disabled)
- **Then**: All PTY processes associated with editor panels SHALL be killed
- **And**: No orphaned PTY processes remain

