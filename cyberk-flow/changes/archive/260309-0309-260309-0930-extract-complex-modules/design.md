# Design: Extract Complex Modules (Phases 8.4-8.6)

## Overview

Extract three cross-cutting modules from `main.ts`: ResizeCoordinator (resize policy), WebviewStateStore (centralized state), and MessageRouter (message dispatch). These modules have interdependencies that require careful extraction ordering.

## Extraction Order Rationale

**WebviewStateStore first**, then ResizeCoordinator, then MessageRouter:

1. **WebviewStateStore** (8.5) — Owns the state that both other modules read. Must exist before ResizeCoordinator and MessageRouter can reference it.
2. **ResizeCoordinator** (8.4) — Depends on state (activeTabId, terminals, tabLayouts) and XtermFitService + ThemeManager. Can be extracted once state is accessible via the store.
3. **MessageRouter** (8.6) — Depends on everything (calls ResizeCoordinator, reads/writes state, calls terminal operations). Extracted last because it orchestrates the other modules.

## Module Designs

### WebviewStateStore

**Pattern**: Store (centralized state with named mutations)

The store owns all mutable UI state currently scattered as module-level `let` variables and Maps in `main.ts`. It exposes state through public readonly properties and mutations through named methods.

**Key design decision**: The store does NOT own business logic (e.g., `removeTerminal`, `switchTab`). It owns state containers and persistence. Orchestration stays in `main.ts` (future composition root).

**State owned**:
- `terminals: Map<string, TerminalInstance>` — all terminal instances
- `tabLayouts: Map<string, SplitNode>` — split layout tree per tab
- `tabActivePaneIds: Map<string, string>` — active pane per tab
- `resizeCleanups: Map<string, (() => void)[]>` — resize handle cleanup functions
- `activeTabId: string | null` — currently visible tab
- `currentConfig: TerminalConfig` — terminal config from settings

**Mutations**:
- `setActiveTab(tabId)` — simple assignment
- `setLayout(tabId, layout)` / `deleteLayout(tabId)` — tabLayouts map operations
- `setActivePaneId(tabId, paneId)` / `getActivePaneId(tabId)` — active pane tracking
- `persist()` — serialize layouts + active panes to `vscode.setState()`
- `restore()` — deserialize from `vscode.getState()`

**What stays in main.ts**: The `VsCodeApi` type declaration, `acquireVsCodeApi()` call, and the `vscode` handle. The store receives the vscode api via constructor injection.

### ResizeCoordinator

**Pattern**: Coordinator + Policy object

Coordinates ResizeObserver events, debounce timers, visibility state, location inference, and fit delegation. Owns resize **policy** — when to fit, when to defer, when to skip.

**Dependencies** (injected via constructor):
- `fitTerminal: (instance: TerminalInstance) => void` — fit function (wraps XtermFitService)
- `getState: () => { activeTabId, terminals, tabLayouts }` — state accessor callback
- `onLocationChange: (location: TerminalLocation) => void` — callback when location inferred from container size

**Functions moved**:
- `debouncedFit()` — debounced single terminal fit (becomes method)
- `fitAllTerminals()` — fits all terminals in active tab (becomes private method)
- `debouncedFitAllLeaves(tabId)` — debounced fit for split panes (becomes method)
- `setupResizeObserver(container)` — creates ResizeObserver (becomes `setup()`)
- `onViewShow()` — handles deferred resize on visibility (becomes method)
- `inferLocationFromSize(width, height)` — location inference (becomes private method)

**State moved**:
- `pendingResize: boolean`
- `fitResizeTimeout: number | undefined`
- `splitFitTimeout: number | undefined`
- `resizeObserver: ResizeObserver | undefined`

**What stays in main.ts**: The `updateLocation()` wrapper that calls `themeManager.updateLocation()` and `themeManager.applyToAll()`. The ResizeCoordinator calls the injected `onLocationChange` callback instead.

### MessageRouter

**Pattern**: Message Router + Command Handler (dispatch table)

Replaces the 172-line `switch` statement with a typed dispatch function. Each message type maps to a named handler from a `MessageHandlers` interface.

**Key design decisions**:

1. **`init` stays in main.ts** — The `handleInit()` function orchestrates bootstrap (creates terminals, sets up resize observer, restores state). It's the composition root's job, not a message handler.

2. **Handlers are a plain interface** — `main.ts` constructs the handlers object by wiring functions that already exist. No new logic is added.

3. **Function, not class** — `createMessageRouter(handlers)` returns a `(msg: ExtensionToWebViewMessage) => void` function. No class needed — the router is stateless; state lives in the handlers' closures.

4. **Unknown messages** — silently ignored (matches current behavior).

**Handler interface**:
```
onOutput, onExit, onTabCreated, onTabRemoved, onRestore,
onConfigUpdate, onViewShow, onSplitPane, onSplitPaneCreated,
onCloseSplitPane, onCloseSplitPaneById, onSplitPaneAt,
onCtxClear, onError
```

Each handler receives the typed message (e.g., `onOutput(msg: OutputMessage)`). Handlers with no payload (e.g., `onViewShow`, `onCloseSplitPane`) take no arguments.

## Risk Map

| Item | Risk | Mitigation |
|------|------|------------|
| State access ordering | MEDIUM | Extract WebviewStateStore first; other modules receive state via callbacks/getters |
| ResizeCoordinator closure capture | LOW | Use `getState()` callback pattern — no stale closures |
| MessageRouter handler wiring | LOW | Each handler is a simple function call — type-check catches mismatches |
| Cross-module circular deps | LOW | Clear dependency graph: Store <- ResizeCoordinator <- MessageRouter |

## Dependency Graph

```
main.ts (composition root)
  ├── WebviewStateStore (state)
  ├── ThemeManager (theme — already extracted)
  ├── XtermFitService (fit — already extracted)
  ├── ResizeCoordinator (resize policy)
  │     ├── depends on: fitTerminal fn, state accessor, location callback
  │     └── does NOT depend on: ThemeManager directly
  └── MessageRouter (dispatch)
        ├── depends on: handler functions defined in main.ts
        └── handler functions use: store, resize coordinator, terminal operations
```
