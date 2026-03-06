# Spec: Tab Keyboard Shortcuts

> Delta spec for `add-multi-tab-ui` change

## ADDED Requirements

### Requirement: Tab-Cycling-Shortcuts

The webview SHALL support Ctrl+Tab to cycle forward through tabs and Ctrl+Shift+Tab to cycle backward. The keyboard handler SHALL be registered as a document-level `keydown` listener. The handler SHALL call `e.preventDefault()` to prevent browser default behavior.

#### Scenario: Ctrl+Tab cycles forward

- Given tabs [Terminal 1, Terminal 2, Terminal 3] exist with Terminal 1 active
- When the user presses Ctrl+Tab
- Then `switchTab` is called with Terminal 2's ID
- And the tab bar re-renders with Terminal 2 active

#### Scenario: Ctrl+Tab wraps around

- Given tabs [Terminal 1, Terminal 2, Terminal 3] exist with Terminal 3 active
- When the user presses Ctrl+Tab
- Then `switchTab` is called with Terminal 1's ID (wraps to first)

#### Scenario: Ctrl+Shift+Tab cycles backward

- Given tabs [Terminal 1, Terminal 2, Terminal 3] exist with Terminal 2 active
- When the user presses Ctrl+Shift+Tab
- Then `switchTab` is called with Terminal 1's ID

#### Scenario: Ctrl+Shift+Tab wraps backward

- Given tabs [Terminal 1, Terminal 2, Terminal 3] exist with Terminal 1 active
- When the user presses Ctrl+Shift+Tab
- Then `switchTab` is called with Terminal 3's ID (wraps to last)

#### Scenario: Single tab — shortcut is no-op

- Given only one tab exists
- When the user presses Ctrl+Tab
- Then no tab switch occurs (already on the only tab)
