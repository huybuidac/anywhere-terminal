# Clipboard Robustness — Delta Spec

> Modifies: `cyberk-flow/specs/input-handler/spec.md`

## MODIFIED Requirements

### Requirement: Custom Key Event Handler

> Original: Each terminal instance SHALL have `attachCustomKeyEventHandler` registered. The handler MUST:
> - **V**: Read clipboard, normalize line endings, handle bracketed paste mode, call `terminal.paste()`, return `false`
> - **K**: Call `terminal.clear()`, return `false`
> - **C**: If `terminal.hasSelection()`, copy selection to clipboard via `navigator.clipboard.writeText()`, clear selection, return `false`. Otherwise return `true`

Each terminal instance SHALL have `attachCustomKeyEventHandler` registered. The handler MUST:
- Only process `keydown` events (return `true` for all others)
- Skip shortcut checking during IME composition (`isComposing = true`)
- Check for the platform modifier (Cmd on macOS via `event.metaKey`)
- When modifier is pressed, handle these keys:
  - **C**: If `terminal.hasSelection()` AND `terminal.getSelection()` is non-empty, copy selection to clipboard via `navigator.clipboard.writeText()`, clear selection, return `false`. If `hasSelection()` is false or selection is empty, return `true` (xterm sends `\x03` SIGINT)
  - **V**: Check `navigator.clipboard?.readText` availability. If unavailable, log warning and return `false`. Otherwise read clipboard and call `terminal.paste(text)` (xterm.js handles bracketed paste mode and line ending normalization natively), return `false`
  - **K**: Call `terminal.clear()`, send `{ type: 'clear', tabId: activeTabId }` message to extension host, return `false`
  - **A**: Call `terminal.selectAll()`, return `false`
  - **All others**: return `true` (pass to xterm.js / VS Code)

#### Scenario: Cmd+C with non-empty selection copies text
- **Given** terminal has text "hello" selected and `getSelection()` returns "hello"
- **When** user presses Cmd+C
- **Then** "hello" is written to clipboard, selection is cleared, event is consumed (return false)

#### Scenario: Cmd+C with empty selection sends SIGINT
- **Given** terminal has no selection (`hasSelection()` returns false)
- **When** user presses Cmd+C
- **Then** handler returns `true`, xterm sends `\x03` to the shell

#### Scenario: Cmd+V checks clipboard availability before reading
- **Given** `navigator.clipboard?.readText` is undefined (clipboard API unavailable)
- **When** user presses Cmd+V
- **Then** handler logs a warning, does not throw, returns `false`

#### Scenario: Cmd+V with empty clipboard does nothing
- **Given** clipboard is empty (readText returns "")
- **When** user presses Cmd+V
- **Then** `terminal.paste()` is NOT called, handler returns `false`

#### Scenario: Cmd+V pastes using terminal.paste()
- **Given** clipboard contains "echo hello\necho world"
- **When** user presses Cmd+V
- **Then** text is pasted via `terminal.paste()` which handles bracketed paste mode and line ending normalization natively

#### Scenario: Cmd+C with hasSelection true but getSelection empty
- **Given** `terminal.hasSelection()` returns true but `terminal.getSelection()` returns ""
- **When** user presses Cmd+C
- **Then** handler returns `true` (lets xterm send SIGINT), does NOT write to clipboard, does NOT call clearSelection

#### Scenario: Cmd+K clears terminal and notifies extension
- **Given** terminal is active with tabId "tab-1"
- **When** user presses Cmd+K
- **Then** `terminal.clear()` is called AND `{ type: 'clear', tabId: 'tab-1' }` is sent to extension host
