## ADDED Requirements

### Requirement: Ready Handshake Wiring

When the TerminalViewProvider receives a `ready` message, it SHALL:
1. Load node-pty via `PtyManager.loadNodePty()`
2. Detect shell via `PtyManager.detectShell()`
3. Build environment via `PtyManager.buildEnvironment()`
4. Resolve working directory via `PtyManager.resolveWorkingDirectory()`
5. Create a `PtySession` and call `spawn()`
6. Create an `OutputBuffer` connected to the PTY and webview
7. Wire `PtySession.onData` to `OutputBuffer.append()`
8. Wire `PtySession.onExit` to flush OutputBuffer then send `{ type: 'exit', tabId, code }`
9. Send `{ type: 'init', tabs: [{ id, name: 'Terminal 1', isActive: true }], config }` to the webview

The provider MUST NOT send any messages to the webview before receiving `ready`.

#### Scenario: Successful ready handshake
- **Given** the webview sends `{ type: 'ready' }`
- **When** the handler processes it
- **Then** a PTY is spawned, an OutputBuffer is created, and an `init` message is sent with one tab

#### Scenario: PTY spawn failure on ready
- **Given** the shell path is invalid
- **When** ready handler attempts to spawn
- **Then** an `error` message is sent to the webview with severity 'error' and the error details

### Requirement: Input Forwarding

When the TerminalViewProvider receives an `input` message with `{ tabId, data }`, it SHALL forward `data` to the PTY process via `PtySession.write(data)`.

#### Scenario: Keystroke forwarded to PTY
- **Given** a PTY session exists for tabId 'abc'
- **When** `{ type: 'input', tabId: 'abc', data: 'ls\r' }` is received
- **Then** `ptySession.write('ls\r')` is called

### Requirement: Resize Forwarding

When the TerminalViewProvider receives a `resize` message with `{ tabId, cols, rows }`, it SHALL resize the PTY via `PtySession.resize(cols, rows)`.

#### Scenario: Resize forwarded to PTY
- **Given** a PTY session exists
- **When** `{ type: 'resize', tabId: 'abc', cols: 120, rows: 40 }` is received
- **Then** `ptySession.resize(120, 40)` is called

### Requirement: Ack Forwarding

When the TerminalViewProvider receives an `ack` message with `{ charCount }`, it SHALL forward to `OutputBuffer.handleAck(charCount)`.

#### Scenario: Ack forwarded to OutputBuffer
- **Given** an OutputBuffer exists
- **When** `{ type: 'ack', charCount: 5000 }` is received
- **Then** `outputBuffer.handleAck(5000)` is called

### Requirement: PTY Exit Handling

When the PTY process exits, the TerminalViewProvider SHALL:
1. Flush remaining output from the OutputBuffer
2. Send `{ type: 'exit', tabId, code }` to the webview
3. Dispose the OutputBuffer

#### Scenario: Clean exit
- **Given** the shell process exits with code 0
- **When** PtySession.onExit fires
- **Then** remaining output is flushed, then `{ type: 'exit', tabId, code: 0 }` is sent

### Requirement: View Dispose Cleanup

When the webview view is disposed, the TerminalViewProvider SHALL:
1. Kill the PTY session via `PtySession.kill()`
2. Dispose the OutputBuffer
3. Clear the view reference

#### Scenario: Sidebar closed
- **Given** a terminal session is running
- **When** the webview view is disposed
- **Then** PtySession.kill() and OutputBuffer.dispose() are called

### Requirement: Defensive Message Handling

The TerminalViewProvider MUST silently ignore `input`, `resize`, and `ack` messages if no PTY session exists (i.e., before `ready` is processed or after the session has exited and been cleaned up). On PTY spawn failure during `ready`, the provider MUST send an `error` message and clean up any partial state (no leaked timers or sessions).

The `init` message SHALL include a `TerminalConfig` with default values: `{ fontSize: 14, cursorBlink: true, scrollback: 10000 }`. Reading from `vscode.workspace.getConfiguration()` is deferred to Phase 3 (task 3.2).

#### Scenario: Input before ready is ignored
- **Given** no PTY session exists yet
- **When** `{ type: 'input', tabId: 'abc', data: 'x' }` is received
- **Then** the message is silently ignored (no error thrown)

#### Scenario: Spawn failure sends error and cleans up
- **Given** PtyManager.loadNodePty() throws PtyLoadError
- **When** ready handler catches the error
- **Then** `{ type: 'error', message: '...', severity: 'error' }` is sent and no partial PtySession/OutputBuffer state remains

### Requirement: PtySession Flow Control Exposure

PtySession SHALL expose `pause()` and `resume()` methods that delegate to the underlying `Pty.pause()` and `Pty.resume()`. These are no-op if the process is not alive. This allows OutputBuffer to control PTY backpressure without accessing the raw Pty object.

#### Scenario: Pause delegates to Pty
- **Given** a PtySession with an alive process
- **When** `ptySession.pause()` is called
- **Then** the underlying `pty.pause()` is called
