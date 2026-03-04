# input-handler Specification

## Purpose
TBD
## Requirements

### Requirement: Custom Key Event Handler

Each terminal instance SHALL have `attachCustomKeyEventHandler` registered. The handler MUST:
- Only process `keydown` events (return `true` for all others)
- Skip shortcut checking during IME composition (`isComposing = true`)
- Check for the platform modifier (Cmd on macOS via `event.metaKey`)
- When modifier is pressed, handle these keys:
  - **C**: If `terminal.hasSelection()`, copy selection to clipboard via `navigator.clipboard.writeText()`, clear selection, return `false`. Otherwise return `true` (xterm sends `\x03` SIGINT)
  - **V**: Read clipboard, normalize line endings (`\r?\n` → `\r`), handle bracketed paste mode, call `terminal.paste()`, return `false`
  - **K**: Call `terminal.clear()`, return `false`
  - **A**: Call `terminal.selectAll()`, return `false`
  - **All others**: return `true` (pass to xterm.js / VS Code)

#### Scenario: Cmd+C with selection copies text
- **Given** terminal has text "hello" selected
- **When** user presses Cmd+C
- **Then** "hello" is written to clipboard, selection is cleared, event is consumed (return false)

#### Scenario: Cmd+C without selection sends SIGINT
- **Given** terminal has no selection
- **When** user presses Cmd+C
- **Then** handler returns `true`, xterm sends `\x03` to the shell

#### Scenario: Cmd+V pastes with bracketed paste mode
- **Given** clipboard contains "echo hello\necho world" and `terminal.modes.bracketedPasteMode` is true
- **When** user presses Cmd+V
- **Then** text is wrapped with `\x1b[200~...\x1b[201~`, line endings normalized to `\r`, and pasted via `terminal.paste()`

### Requirement: IME Composition Tracking

The webview SHALL track IME composition state via `compositionstart` and `compositionend` events on `document`. During composition, the custom key event handler MUST return `true` for all events without shortcut checking.

#### Scenario: CJK input not interrupted
- **Given** IME composition is active (user typing pinyin)
- **When** any key event fires
- **Then** the handler returns `true` immediately without checking for Cmd shortcuts

