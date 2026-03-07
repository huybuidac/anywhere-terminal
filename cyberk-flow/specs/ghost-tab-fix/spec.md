# ghost-tab-fix Specification

## Purpose
TBD
## Requirements

### Requirement: Split-Pane-Session-Filtering

`SessionManager.getTabsForView()` SHALL exclude sessions where `isSplitPane === true` from the returned tab list. Only root tab sessions SHALL appear in the tab bar.

`SessionManager.createSession()` SHALL accept an optional `isSplitPane` boolean parameter (default `false`). When `true`, the session is marked as a split pane and excluded from `getTabsForView()`.

#### Scenario: Split pane sessions not in tab list

- Given a view with 1 root tab and 2 split pane sessions
- When `getTabsForView()` is called
- Then only the root tab session is returned (length = 1)

#### Scenario: createSession with isSplitPane flag

- Given a view with an existing active root tab
- When `createSession(viewId, webview, { isSplitPane: true })` is called
- Then the new session has `isSplitPane = true`
- And the new session has `isActive = false` (split panes are not tabs)
- And the existing root tab remains `isActive = true` (split pane creation SHALL NOT deactivate other sessions)
- And `getTabsForView()` still returns only the original root tab

