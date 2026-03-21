## ADDED Requirements

### Requirement: Unit tests for ThemeManager

The test suite SHALL verify ThemeManager's CSS variable reading, high-contrast detection, theme object building, location-aware background, and MutationObserver watching.

#### Scenario: getTheme reads CSS variables

- **WHEN** CSS variables are set on `document.documentElement`
- **THEN** `getTheme()` returns an object with background, foreground, cursor, and ANSI color properties read from those variables

#### Scenario: getTheme uses location-specific background

- **WHEN** location is "panel"
- **THEN** `getTheme()` reads `--vscode-panel-background` for the background property
- **WHEN** location is "sidebar"
- **THEN** `getTheme()` reads `--vscode-sideBar-background` for the background property

#### Scenario: getTheme falls back to defaults

- **WHEN** no CSS variables are set
- **THEN** `getTheme()` returns default background (#1e1e1e) and foreground (#cccccc)

#### Scenario: high-contrast detection

- **WHEN** `document.body` has class `vscode-high-contrast`
- **THEN** `getMinimumContrastRatio()` returns 7
- **WHEN** `document.body` has class `vscode-high-contrast-light`
- **THEN** `getMinimumContrastRatio()` returns 7
- **WHEN** `document.body` has no high-contrast class
- **THEN** `getMinimumContrastRatio()` returns 4.5

#### Scenario: applyToAll applies theme to all terminals

- **WHEN** `applyToAll()` is called with an iterable of terminal instances
- **THEN** each terminal's `options.theme` and `options.minimumContrastRatio` are set

#### Scenario: updateLocation changes location and re-applies background

- **WHEN** `updateLocation("panel")` is called while current location is "sidebar"
- **THEN** returns true, body background is updated
- **WHEN** `updateLocation("sidebar")` is called while current location is already "sidebar"
- **THEN** returns false, body background is unchanged

#### Scenario: startWatching observes body class mutations

- **WHEN** `startWatching(callback)` is called and body class changes
- **THEN** the callback is invoked

#### Scenario: dispose disconnects MutationObserver

- **WHEN** `dispose()` is called
- **THEN** the MutationObserver is disconnected and further class mutations do not trigger the callback

---

### Requirement: Unit tests for XtermFitService

The test suite SHALL verify fitTerminal dimension calculation, no-op when dimensions are unchanged, and null guards.

#### Scenario: fitTerminal calculates cols and rows

- **WHEN** a terminal with known cell dimensions and a parent with known size is provided
- **THEN** `fitTerminal()` returns `{ cols, rows }` calculated from available space divided by cell dimensions

#### Scenario: fitTerminal returns null when element is missing

- **WHEN** `terminal.element` is null/undefined
- **THEN** `fitTerminal()` returns null

#### Scenario: fitTerminal returns null when render service is unavailable

- **WHEN** `terminal._core._renderService` is undefined
- **THEN** `fitTerminal()` returns null

#### Scenario: fitTerminal returns null when cell dimensions are zero

- **WHEN** cell width or height is 0
- **THEN** `fitTerminal()` returns null

#### Scenario: fitTerminal returns null when parent has zero dimensions

- **WHEN** `parentElement.getBoundingClientRect()` returns 0 width or height
- **THEN** `fitTerminal()` returns null

#### Scenario: fitTerminal returns null when dimensions unchanged

- **WHEN** calculated cols/rows equal `terminal.cols` and `terminal.rows`
- **THEN** `fitTerminal()` returns null (no resize needed)

#### Scenario: fitTerminal clears render service on resize

- **WHEN** dimensions changed and a resize is needed
- **THEN** `_core._renderService.clear()` is called before returning

#### Scenario: fitTerminal enforces minimum dimensions

- **WHEN** available space yields less than 2 cols or 1 row
- **THEN** `fitTerminal()` returns at least `{ cols: 2, rows: 1 }`

#### Scenario: fitTerminal accounts for scrollbar width

- **WHEN** `terminal.options.scrollback` is 0
- **THEN** scrollbar width is 0 (no scrollbar lane)
- **WHEN** `terminal.options.scrollback` is nonzero and no `overviewRuler.width` is set
- **THEN** scrollbar width defaults to 14px, reducing available columns

---

### Requirement: Unit tests for ResizeCoordinator

The test suite SHALL verify debounce behavior, pending resize flag, location inference, and fit delegation.

#### Scenario: debouncedFit debounces multiple calls

- **WHEN** `debouncedFit()` is called 3 times in rapid succession
- **THEN** the fit function is called only once after the debounce period

#### Scenario: debouncedFitAllLeaves fits all leaves in a tab's layout

- **WHEN** `debouncedFitAllLeaves(tabId)` is called for a tab with a split layout
- **THEN** the fit function is called for each leaf session in the layout after the debounce period

#### Scenario: setup marks pendingResize when container is invisible

- **WHEN** ResizeObserver fires with width=0 and height=0
- **THEN** `pendingResize` is set to true (verified via `onViewShow` behavior)

#### Scenario: onViewShow flushes pending resize

- **WHEN** `pendingResize` is true and `onViewShow()` is called
- **THEN** all terminals in the active tab are fitted

#### Scenario: onViewShow does nothing when no pending resize

- **WHEN** `pendingResize` is false and `onViewShow()` is called
- **THEN** the fit function is not called

#### Scenario: inferLocationFromSize determines location by aspect ratio

- **WHEN** width > height * 1.2
- **THEN** location is "panel"
- **WHEN** width <= height * 1.2
- **THEN** location is "sidebar"

#### Scenario: dispose clears timers and disconnects observer

- **WHEN** `dispose()` is called after setup
- **THEN** ResizeObserver is disconnected and pending timers are cleared

---

### Requirement: Unit tests for WebviewStateStore

The test suite SHALL verify persist/restore, state mutations, config defaults, and active pane management.

#### Scenario: initial state has empty collections and default config

- **WHEN** a new WebviewStateStore is created
- **THEN** terminals, tabLayouts, tabActivePaneIds, resizeCleanups are empty Maps
- **AND** activeTabId is null
- **AND** currentConfig has default values (fontSize=14, cursorBlink=true, scrollback=10000, fontFamily="")

#### Scenario: setActiveTab updates activeTabId

- **WHEN** `setActiveTab("tab-1")` is called
- **THEN** `activeTabId` equals "tab-1"

#### Scenario: setLayout and deleteLayout manage tab layouts

- **WHEN** `setLayout("tab-1", layout)` is called
- **THEN** `tabLayouts.get("tab-1")` returns the layout
- **WHEN** `deleteLayout("tab-1")` is called
- **THEN** `tabLayouts.has("tab-1")` returns false

#### Scenario: setActivePaneId and getActivePaneId manage active panes

- **WHEN** `setActivePaneId("tab-1", "pane-2")` is called
- **THEN** `getActivePaneId("tab-1")` returns "pane-2"
- **WHEN** no active pane is set for "tab-2"
- **THEN** `getActivePaneId("tab-2")` returns "tab-2" (fallback)

#### Scenario: persist serializes state to vscode.setState

- **WHEN** `persist()` is called with tabLayouts and tabActivePaneIds populated
- **THEN** `vscode.setState()` is called with serialized layouts and pane IDs

#### Scenario: restore deserializes state from vscode.getState

- **WHEN** `vscode.getState()` returns previously persisted state
- **THEN** `restore()` returns a Map of layouts, and tabActivePaneIds are populated

#### Scenario: restore handles malformed state gracefully

- **WHEN** `vscode.getState()` returns null, undefined, or malformed data
- **THEN** `restore()` returns an empty Map without throwing

#### Scenario: restore validates pane IDs against layout

- **WHEN** a persisted pane ID no longer exists in the restored layout
- **THEN** the invalid pane ID is not restored (fallback to getActivePaneId default)

---

### Requirement: Unit tests for MessageRouter

The test suite SHALL verify dispatch by type, init message exclusion, and unknown message handling.

#### Scenario: dispatches each message type to the correct handler

- **WHEN** a message with type "output" is dispatched
- **THEN** `handlers.onOutput(msg)` is called with the message
- (Repeat for all 14 message types: output, exit, tabCreated, tabRemoved, restore, configUpdate, viewShow, splitPane, splitPaneCreated, closeSplitPane, closeSplitPaneById, splitPaneAt, ctxClear, error)

#### Scenario: init message is not routed

- **WHEN** a message with type "init" is dispatched
- **THEN** no handler is called

#### Scenario: unknown message type is silently ignored

- **WHEN** a message with an unknown type is dispatched
- **THEN** no handler is called and no error is thrown

---

### Requirement: Unit tests for BannerService

The test suite SHALL verify DOM creation, severity CSS classes, dismiss button, and auto-dismiss behavior.

#### Scenario: showBanner creates a banner element

- **WHEN** `showBanner(container, "Error message", "error")` is called
- **THEN** a `div.error-banner.error-banner-error` is inserted as the first child of the container
- **AND** the banner contains a span with the message text
- **AND** the banner contains a dismiss button

#### Scenario: dismiss button removes banner

- **WHEN** the dismiss button is clicked
- **THEN** the banner element is removed from the DOM

#### Scenario: info banners auto-dismiss after 5 seconds

- **WHEN** `showBanner(container, "Info", "info")` is called
- **AND** 5 seconds elapse
- **THEN** the banner is automatically removed from the DOM

#### Scenario: error and warn banners do not auto-dismiss

- **WHEN** `showBanner(container, "Error", "error")` is called
- **AND** 5 seconds elapse
- **THEN** the banner remains in the DOM
- **WHEN** `showBanner(container, "Warning", "warn")` is called
- **AND** 5 seconds elapse
- **THEN** the banner remains in the DOM

#### Scenario: severity determines CSS class

- **WHEN** severity is "warn"
- **THEN** the banner has class `error-banner-warn`
- **WHEN** severity is "info"
- **THEN** the banner has class `error-banner-info`

---

### Requirement: Unit tests for FlowControl

The test suite SHALL verify ack batching threshold behavior, session deletion, and multi-session independence.

#### Scenario: ackChars accumulates below threshold without sending

- **WHEN** `ackChars(4999, "tab-1")` is called
- **THEN** no ack message is sent via postMessage

#### Scenario: ackChars sends ack at threshold

- **WHEN** accumulated chars reach or exceed 5000 (ACK_BATCH_SIZE)
- **THEN** an ack message is sent with `{ type: "ack", charCount: <total>, tabId }`
- **AND** the accumulator is reset to 0

#### Scenario: ackChars handles exact threshold

- **WHEN** `ackChars(5000, "tab-1")` is called in a single call
- **THEN** an ack message is sent immediately

#### Scenario: delete removes session tracking

- **WHEN** `delete("tab-1")` is called
- **THEN** subsequent `ackChars()` for "tab-1" starts from 0

#### Scenario: multiple sessions track independently

- **WHEN** `ackChars(3000, "tab-1")` and `ackChars(3000, "tab-2")` are called
- **THEN** neither triggers an ack (both below threshold)
- **WHEN** `ackChars(2000, "tab-1")` is called
- **THEN** only "tab-1" sends an ack (total=5000), "tab-2" remains at 3000

---

### Requirement: Integration tests for critical flows

The test suite SHALL verify end-to-end behavior of ack routing, tab lifecycle, split pane, and config update flows by wiring real module instances together.

#### Scenario: ack routing delivers to correct session

- **WHEN** output is written to a background tab's terminal
- **THEN** the ack message includes the correct `tabId` for that background session

#### Scenario: tab lifecycle: create → switch → close → auto-create

- **WHEN** a tab is created, switched to, then closed as the last tab
- **THEN** a `createTab` message is sent to request a new tab

#### Scenario: split pane: split → close → restructure layout

- **WHEN** a split pane is created then the new pane is closed
- **THEN** the layout reverts to a single leaf node

#### Scenario: config update: font change triggers refit

- **WHEN** a configUpdate message with a new fontSize is processed
- **THEN** all terminal instances have their fontSize option updated
