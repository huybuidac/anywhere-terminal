# escape-key-handling Specification

## ADDED Requirements

### Requirement: Escape Key Handler Extension

The custom key event handler in `input-handler` SHALL additionally handle the **Escape** key (without any modifier). When Escape is pressed:
- If `terminal.hasSelection()` returns `true`, the handler MUST call `terminal.clearSelection()` and return `false` (consume the event)
- If `terminal.hasSelection()` returns `false`, the handler MUST return `true` (pass Escape through to xterm.js / shell)

The Escape check MUST occur **before** the modifier check, since Escape operates without modifiers.

#### Scenario: Escape clears selection when text is selected

- **Given** terminal has text selected (`hasSelection()` returns `true`)
- **When** user presses Escape (no modifier keys)
- **Then** `clearSelection()` is called and the event is consumed (return `false`)

#### Scenario: Escape passes through when no selection

- **Given** terminal has no selection (`hasSelection()` returns `false`)
- **When** user presses Escape
- **Then** handler returns `true` (Escape reaches the shell, e.g., to cancel a command)

#### Scenario: Escape during IME composition is ignored

- **Given** IME composition is active
- **When** user presses Escape
- **Then** handler returns `true` without checking selection (IME guard takes priority)
