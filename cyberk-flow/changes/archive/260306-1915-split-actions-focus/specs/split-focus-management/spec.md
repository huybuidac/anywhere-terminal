# split-focus-management Specification

## ADDED Requirements

### Requirement: Active Pane Tracking

The webview SHALL track which pane is currently active (focused) via an `activePaneId` state variable. The active pane MUST:

- Default to the tab's primary session ID when a tab has no splits
- Update when the user clicks on a pane
- Update when a new pane is created via split (new pane becomes active)
- Update when the active pane is closed (sibling pane becomes active)
- Be persisted as part of the webview state (alongside `tabLayouts`)

#### Scenario: Single pane tab has activePaneId equal to tab session
- **Given** a tab "tab1" with a single leaf pane (no splits)
- **When** the tab is active
- **Then** `activePaneId` equals the tab's session ID

#### Scenario: New split pane becomes active
- **Given** a tab with pane "a" active
- **When** the user splits pane "a" vertically, creating pane "b"
- **Then** `activePaneId` updates to "b" (new pane gets focus)

#### Scenario: Closing active pane focuses sibling
- **Given** a tab with split panes "a" and "b", pane "b" is active
- **When** pane "b" is closed
- **Then** `activePaneId` updates to "a" (sibling gets focus)

### Requirement: Click-to-Focus Pane

The webview SHALL focus a pane when the user clicks on it. The click handler MUST:

- Be attached to each `.split-leaf` container element
- Call `terminal.focus()` on the clicked pane's terminal
- Update `activePaneId` to the clicked pane's session ID
- Update the visual active pane indicator

#### Scenario: Clicking an inactive pane focuses it
- **Given** a split tab with panes "a" (active) and "b" (inactive)
- **When** the user clicks on pane "b"
- **Then** pane "b" becomes active, its terminal receives focus, and the visual indicator moves to pane "b"

### Requirement: Active Pane Visual Indicator

The webview SHALL display a visual indicator on the active pane. The indicator MUST:

- Apply a CSS class `active-pane` to the active `.split-leaf` element
- Use a 1px border with `var(--vscode-focusBorder, #007acc)` color
- Only be visible when the tab has 2+ panes (no indicator for single-pane tabs)
- Be removed from the previously active pane when focus changes

#### Scenario: Active pane has border highlight
- **Given** a split tab with panes "a" and "b", pane "a" is active
- **When** the split layout is rendered
- **Then** pane "a"'s `.split-leaf` element has the `active-pane` class and a visible focus border

#### Scenario: Single pane has no indicator
- **Given** a tab with only one pane (no splits)
- **When** the layout is rendered
- **Then** no `.active-pane` class is applied (no visual clutter for single pane)

### Requirement: Active Pane Receives Keyboard Input

The active pane's terminal MUST receive keyboard input. When focus changes:

- `terminal.focus()` SHALL be called on the newly active pane's terminal
- The previously active pane's terminal loses focus naturally (browser focus model)

#### Scenario: Keyboard input goes to active pane
- **Given** a split tab with panes "a" and "b", pane "b" is active
- **When** the user types "hello"
- **Then** the input is sent to pane "b"'s terminal session

### Requirement: Tab Bar Reflects Active Pane

When a tab has split panes, the tab bar MUST reflect the active pane's session. The tab bar SHALL:

- Show the active pane's session name in the tab label when the tab has splits
- Update the displayed name when the active pane changes within a split tab

#### Scenario: Tab bar shows active pane name
- **Given** a tab with split panes "Terminal 1" and "Terminal 2", "Terminal 2" is active
- **When** the tab bar is rendered
- **Then** the tab label shows "Terminal 2"
