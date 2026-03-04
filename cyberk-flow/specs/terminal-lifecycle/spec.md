# terminal-lifecycle Specification

## Purpose
TBD
## Requirements

### Requirement: Terminal Tab Switching

When the webview creates or switches to a terminal tab, it MUST:
- Hide the current active terminal's container (`display: 'none'`)
- Show the target terminal's container (`display: 'block'`)
- Call `fitAddon.fit()` via `requestAnimationFrame` on the shown terminal
- Focus the shown terminal
- Update `activeTabId` state

#### Scenario: Switch from Terminal 1 to Terminal 2
- **Given** Terminal 1 is active and Terminal 2 exists but is hidden
- **When** a `tabCreated` or `switchTab` triggers switching to Terminal 2
- **Then** Terminal 1's container is hidden, Terminal 2's container is shown, fitted, and focused

### Requirement: Terminal Disposal

When a terminal is removed (via `tabRemoved` message), the webview MUST:
- Call `terminal.dispose()` (which also disposes loaded addons)
- Remove the container element from the DOM
- Delete the entry from the terminals map
- If the removed terminal was active, switch to the last remaining terminal
- If no terminals remain, set `activeTabId` to null

#### Scenario: Close active terminal switches to remaining
- **Given** two terminals exist: 'abc' (active) and 'xyz'
- **When** `tabRemoved` for 'abc' is received
- **Then** 'abc' is disposed, 'xyz' becomes active and focused

### Requirement: Exit Message Display

When the webview receives an `exit` message, it SHALL write a styled exit message to the terminal:
`\r\n\x1b[90m[Process exited with code N]\x1b[0m\r\n`
The terminal remains visible for scrollback inspection but SHOULD NOT forward further input.

#### Scenario: Process exit display
- **Given** terminal 'abc' is running
- **When** `{ type: 'exit', tabId: 'abc', code: 0 }` is received
- **Then** the terminal displays `[Process exited with code 0]` in gray text

