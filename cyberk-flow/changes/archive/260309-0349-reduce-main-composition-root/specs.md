## ADDED Requirements

### Requirement: TerminalFactory Module

The system SHALL provide a `TerminalFactory` class in `src/webview/terminal/TerminalFactory.ts` that encapsulates all terminal instance creation and configuration logic.

#### Scenario: Terminal creation through factory

- **WHEN** a new tab is created (init or tabCreated message)
- **THEN** `TerminalFactory.createTerminal()` is called with (id, name, config, isActive)
- **AND** the returned `TerminalInstance` is stored in `WebviewStateStore.terminals`
- **AND** behavior is identical to the previous inline `createTerminal()`

#### Scenario: WebGL fallback is factory-scoped

- **WHEN** WebGL initialization fails for any terminal
- **THEN** the factory internally tracks `webglFailed` state
- **AND** subsequent terminals skip WebGL without main.ts involvement

#### Scenario: Config application through factory

- **WHEN** a configUpdate message arrives
- **THEN** `TerminalFactory.applyConfig()` updates all terminals' xterm options
- **AND** triggers refit via `fitTerminal()` when font-related properties change

#### Scenario: Fit terminal through factory

- **WHEN** a terminal needs to be resized to fit its container
- **THEN** `TerminalFactory.fitTerminal()` delegates to `XtermFitService.fitTerminal()` for dimension calculation
- **AND** calls `terminal.resize()` if dimensions changed

### Requirement: SplitTreeRenderer Module

The system SHALL provide a `SplitTreeRenderer` class in `src/webview/split/SplitTreeRenderer.ts` that encapsulates split tree DOM rendering, active pane visuals, and split pane close/create orchestration.

#### Scenario: Split tree re-render after layout change

- **WHEN** a split pane is created, closed, or resized
- **THEN** `SplitTreeRenderer.renderTabSplitTree(tabId)` is called
- **AND** the split tree DOM is rebuilt with terminals mounted in leaf containers
- **AND** resize handles are attached with cleanup tracking via store.resizeCleanups

#### Scenario: Active pane visual indicator

- **WHEN** a pane is clicked or the active pane changes
- **THEN** `SplitTreeRenderer.updateActivePaneVisual(tabId)` applies the `.active-pane` class
- **AND** the class is only applied when 2+ panes exist in the tab

#### Scenario: Close split pane by ID

- **WHEN** a split pane close is requested (via keyboard shortcut or context menu)
- **THEN** `SplitTreeRenderer.closeSplitPaneById(paneSessionId)` removes the pane from the layout tree
- **AND** disposes the terminal instance and cleans up flow control tracking
- **AND** re-renders the split tree and updates the tab bar

#### Scenario: Handle split pane created

- **WHEN** the extension host creates a new session for a split pane
- **THEN** `SplitTreeRenderer.handleSplitPaneCreated(msg, factory)` creates the terminal, updates the layout tree, re-renders, and focuses the new pane

### Requirement: FlowControl Module

The system SHALL provide a `FlowControl` class in `src/webview/flow/FlowControl.ts` that encapsulates output ack batching per session.

#### Scenario: Ack batching per session

- **WHEN** output data is written to a terminal
- **THEN** `flowControl.ackChars(count, tabId)` accumulates the count
- **AND** sends an ack message when the ACK_BATCH_SIZE threshold (5000 chars) is reached

#### Scenario: Cleanup on terminal removal

- **WHEN** a terminal or split pane is removed
- **THEN** `flowControl.delete(sessionId)` clears the tracking entry for that session

### Requirement: TabBarUtils buildTabBarData

The system SHALL provide a `buildTabBarData()` function in `src/webview/TabBarUtils.ts` that builds the tab-bar-ready data Map from the store's tabLayouts, tabActivePaneIds, and terminals.

#### Scenario: Data assembly for tab bar

- **WHEN** `updateTabBar()` is called
- **THEN** `buildTabBarData(store)` iterates tabLayouts, resolves active pane names for split tabs, and returns a `Map<string, TabInfo>`
- **AND** the returned data is passed directly to `renderTabBar()`

## MODIFIED Requirements

### Requirement: main.ts as Composition Root

> Original: main.ts contains all terminal creation, split rendering, flow control, tab orchestration, message handling, and bootstrap logic (1037 LOC).
> — _source: `src/webview/main.ts`_

The system SHALL use `src/webview/main.ts` as a composition root (<300 LOC) that:
1. Creates service instances (ThemeManager, ResizeCoordinator, WebviewStateStore, TerminalFactory, SplitTreeRenderer, FlowControl)
2. Wires dependencies between services via constructor injection and callbacks
3. Defines `bootstrap()` for DOM event setup and ready handshake
4. Defines `handleInit()` for initial terminal creation
5. Defines thin orchestration functions (`switchTab`, `removeTerminal`, `updateTabBar`) that coordinate across services
6. Wires `routeMessage` with handler bodies that are each ≤5 LOC (one-liner delegates)
7. Contains NO business logic — only delegation and wiring

#### Scenario: main.ts LOC target

- **WHEN** all extractions are complete
- **THEN** `src/webview/main.ts` is less than 300 lines of code

#### Scenario: bootstrap creates and wires all services

- **WHEN** the webview DOM is ready
- **THEN** `bootstrap()` creates all services, wires message/resize/theme listeners, and sends `ready`

#### Scenario: routeMessage handlers are thin delegates

- **WHEN** a non-init message is received
- **THEN** the routeMessage handler delegates to the appropriate service method in ≤5 LOC per handler
- **AND** no inline business logic exists in handler bodies
