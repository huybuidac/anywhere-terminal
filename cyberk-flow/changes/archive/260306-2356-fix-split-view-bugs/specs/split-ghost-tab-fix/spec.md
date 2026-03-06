# Spec: split-ghost-tab-fix

> Parent spec: `cyberk-flow/specs/split-ipc-messages/spec.md`

## ADDED Requirements

### Requirement: Split Pane Close IPC Behavior

The extension host SHALL handle `requestCloseSplitPane` messages by destroying the PTY session via `SessionManager.destroySession()`. It MUST NOT send a `tabRemoved` message back to the webview for split pane sessions, because the webview manages pane removal internally via its split layout tree.

#### Scenario: Split pane close does not generate tabRemoved

- Given a split layout with 2 panes in a single tab
- When the webview sends `requestCloseSplitPane` with a split pane session ID
- Then the extension host SHALL call `destroySession()` for that session
- And the extension host SHALL NOT send a `tabRemoved` message for that session ID
