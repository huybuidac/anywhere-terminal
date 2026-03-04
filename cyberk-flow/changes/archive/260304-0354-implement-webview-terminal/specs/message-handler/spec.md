# Spec: message-handler

**Parent change**: implement-webview-terminal
**Design ref**: docs/design/message-protocol.md

## ADDED Requirements

### Requirement: Extension-to-WebView Message Router

The webview SHALL listen for messages via `window.addEventListener('message', ...)` and route them by `type` field. It MUST handle:
- `init` — create terminal instances from `tabs` array, apply `config`
- `output` — write data to the matching terminal: `terminals.get(tabId).terminal.write(data, callback)`
- `exit` — display `[Process exited with code N]` in the terminal, mark as read-only
- `tabCreated` — create a new terminal instance and switch to it
- `tabRemoved` — dispose and remove the terminal instance
- `restore` — write cached scrollback data to the terminal
- `configUpdate` — apply changed config to all terminals (fontSize, cursorBlink, scrollback)
- `viewShow` — trigger deferred resize for the active terminal
- `error` — log error to console (MVP; UI display deferred)

Unknown message types MUST be silently ignored.

#### Scenario: Output message writes to correct terminal
- **Given** terminals map has entries for tabs 'abc' and 'xyz'
- **When** message `{ type: 'output', tabId: 'abc', data: 'hello' }` is received
- **Then** `terminals.get('abc').terminal.write('hello', callback)` is called and 'xyz' terminal is unaffected

#### Scenario: Config update applies to all terminals
- **Given** two terminal instances exist
- **When** `{ type: 'configUpdate', config: { fontSize: 16 } }` is received
- **Then** both terminals have `terminal.options.fontSize` set to 16, and `fitAddon.fit()` is called on each

### Requirement: WebView-to-Extension Message Sending

The webview SHALL send messages to the extension using `vscode.postMessage()`. Messages MUST include the correct `type` and payload fields as defined in `src/types/messages.ts`.

#### Scenario: Input forwarding
- **Given** a terminal's `onData` event fires with data 'ls\r'
- **When** the handler processes the event
- **Then** `vscode.postMessage({ type: 'input', tabId, data: 'ls\r' })` is called
