# error-display Specification

## Purpose
TBD
## Requirements

### Requirement: Webview Error Banner

The webview SHALL display error messages received via the `error` message type as a visible banner element in the terminal container, instead of only logging to console.

#### Scenario: Error message displayed

- Given the webview receives `{ type: "error", message: "Failed to start shell", severity: "error" }`
- When the message is handled
- Then a banner element SHALL appear in the webview with the error text
- And the banner SHALL be styled with red background for "error" severity
- And the banner SHALL include a dismiss button

#### Scenario: Warning message displayed

- Given the webview receives an error message with severity "warn"
- When the message is handled
- Then the banner SHALL be styled with yellow/amber background

#### Scenario: Banner auto-dismisses for info severity

- Given the webview receives an error message with severity "info"
- When the message is handled
- Then the banner SHALL auto-dismiss after 5 seconds
- And the user MAY dismiss it manually before the timeout

