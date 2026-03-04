# Input Handler Tests — Delta Spec

## ADDED Requirements

### Requirement: Input Handler Unit Tests

The input handler logic SHALL have unit tests covering all key event handler branches. Tests MUST use Vitest with mocked xterm.js Terminal and navigator.clipboard APIs. Test file SHALL be located at `src/webview/InputHandler.test.ts`.

Tests MUST cover:
- Cmd+C with selection → clipboard write + clearSelection + return false
- Cmd+C without selection → return true (SIGINT passthrough)
- Cmd+V with clipboard available → terminal.paste() called + return false
- Cmd+V with clipboard unavailable → no throw, log warning, return false
- Cmd+K → terminal.clear() + postMessage clear + return false
- Cmd+A → terminal.selectAll() + return false
- Non-modifier keys → return true (passthrough)
- keyup events → return true (ignored)
- IME composition active → return true for all events
- Paste error handling → try/catch logs warning, does not throw

#### Scenario: All key handler branches tested
- **Given** unit test file with mocked Terminal and clipboard APIs
- **When** tests are run via `pnpm run test:unit`
- **Then** all branches of `attachInputHandler` key event logic are exercised with correct assertions

#### Scenario: handlePaste edge cases tested
- **Given** mocked clipboard that returns empty string, throws error, or returns multi-line text
- **When** handlePaste is called
- **Then** empty clipboard does nothing, errors are caught and logged, multi-line text passes through to terminal.paste()
