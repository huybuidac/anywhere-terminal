# Spec: Tab Bar Component

> Delta spec for `add-multi-tab-ui` change

## ADDED Requirements

### Requirement: Tab-Bar-Rendering

The webview SHALL render a tab bar inside the `#tab-bar` element that displays all terminal tabs for the current view. Each tab element SHALL display the terminal name (e.g., "Terminal 1") and a close button ("×"). The tab bar SHALL include a "+" button as the last element to create new tabs.

The `renderTabBar()` function SHALL be called after every tab mutation: `handleInit`, `tabCreated` (after `createTerminal` + `switchTab`), `tabRemoved` (after `removeTerminal`), and `switchTab`.

#### Scenario: Initial render with single tab

- Given the webview receives an `init` message with one tab `[{ id: "abc", name: "Terminal 1", isActive: true }]`
- When `handleInit` completes and calls `renderTabBar()`
- Then the `#tab-bar` element contains one tab element with text "Terminal 1" marked active, and a "+" button
- And the tab bar is hidden (single tab — no need to show bar)

#### Scenario: Tab bar visibility with multiple tabs

- Given two or more terminal instances exist in the `terminals` map
- When `renderTabBar()` is called
- Then the `#tab-bar` element is visible (`display: flex`)
- And each tab has the terminal name and a close "×" button
- And exactly one tab has the active CSS class

#### Scenario: Tab bar hidden with single tab

- Given exactly one terminal instance exists in the `terminals` map
- When `renderTabBar()` is called
- Then the `#tab-bar` element is hidden (`display: none`)

### Requirement: Tab-Bar-Styling

The tab bar SHALL use VS Code CSS variables for all colors to ensure theme consistency. The tab bar SHALL have a horizontal layout with tabs arranged left-to-right. The active tab SHALL be visually distinguished from inactive tabs.

#### Scenario: Theme-consistent styling

- Given the webview is rendered in a VS Code dark theme
- When the tab bar renders
- Then tab background colors use `--vscode-tab-inactiveBackground` for inactive tabs and `--vscode-tab-activeBackground` for active tabs
- And tab text colors use `--vscode-tab-inactiveForeground` and `--vscode-tab-activeForeground`
- And the tab bar background uses `--vscode-editorGroupHeader-tabsBackground`

#### Scenario: Tab bar height

- Given the tab bar is visible
- Then the tab bar height SHALL be approximately 28-35px (compact, not stealing excessive terminal space)
- And the tab bar SHALL have `flex-shrink: 0` to prevent compression

### Requirement: Tab-Click-Handlers

The webview SHALL wire click handlers on tab elements to switch tabs, on close buttons to close tabs, and on the "+" button to create new tabs.

#### Scenario: Click tab to switch

- Given tabs "Terminal 1" (active) and "Terminal 2" (inactive) exist
- When the user clicks the "Terminal 2" tab element
- Then `switchTab("terminal-2-id")` is called
- And the tab bar re-renders with "Terminal 2" marked active

#### Scenario: Click close button

- Given tabs "Terminal 1" and "Terminal 2" exist
- When the user clicks the "×" button on "Terminal 1"
- Then `vscode.postMessage({ type: 'closeTab', tabId: 'terminal-1-id' })` is sent
- And the click event does NOT propagate to the tab element (no accidental switch)

#### Scenario: Click add button

- Given the tab bar is rendered
- When the user clicks the "+" button
- Then `vscode.postMessage({ type: 'createTab' })` is sent

#### Scenario: Close button on last remaining tab

- Given only one tab exists
- When the tab bar is hidden (single tab)
- Then there is no close button visible to click (tab bar is hidden)

### Requirement: Tab-Bar-Update-Integration

The webview message handler SHALL call `renderTabBar()` at the correct points to keep the tab bar synchronized with terminal state.

#### Scenario: Tab bar updates on tabCreated

- Given one tab exists and tab bar is hidden
- When a `tabCreated` message is received and processed
- Then `renderTabBar()` is called after `createTerminal()` and `switchTab()`
- And the tab bar becomes visible (now 2 tabs)

#### Scenario: Tab bar updates on tabRemoved

- Given three tabs exist
- When a `tabRemoved` message is received and processed
- Then `renderTabBar()` is called after `removeTerminal()`
- And the removed tab is no longer in the tab bar
