## 1. Extract WebviewStateStore

- [x] 1_1 Create `src/webview/state/WebviewStateStore.ts` with WebviewStateStore class
  - **Refs**: docs/PLAN.md#8.5; design.md#WebviewStateStore
  - **Done**: New file exists; exports `WebviewStateStore` class with properties: `terminals`, `tabLayouts`, `tabActivePaneIds`, `resizeCleanups`, `activeTabId`, `currentConfig`; methods: `setActiveTab()`, `setLayout()`, `deleteLayout()`, `setActivePaneId()`, `getActivePaneId()`, `persist()`, `restore()`; type-check passes
  - **Test**: N/A — pure refactor, type-check verifies
  - **Files**: `src/webview/state/WebviewStateStore.ts`
  - **Approach**: Create a class that owns all mutable state currently at module level in `main.ts`. Constructor takes `vscode: { getState(): unknown; setState(state: unknown): void }` (minimal interface, not full VsCodeApi). Move `persistLayoutState()` -> `persist()` and `restoreLayoutState()` -> `restore()`. State Maps (`terminals`, `tabLayouts`, `tabActivePaneIds`, `resizeCleanups`) become `readonly` public properties. `activeTabId` and `currentConfig` are public mutable properties. `getActivePaneId(tabId)` falls back to tabId if no active pane is set. Export the `TerminalInstance` interface from this module since the store owns the terminals Map.

- [x] 1_2 Update `main.ts` to use WebviewStateStore for state management
  - **Deps**: 1_1
  - **Refs**: docs/PLAN.md#8.5
  - **Done**: `main.ts` no longer has module-level state variables (`activeTabId`, `currentConfig`, `tabLayouts`, `tabActivePaneIds`, `resizeCleanups`, `terminals`); all state access goes through `store.*`; `persistLayoutState()` and `restoreLayoutState()` removed from `main.ts`; type-check passes
  - **Test**: N/A — pure refactor
  - **Files**: `src/webview/main.ts`
  - **Approach**: Create `const store = new WebviewStateStore(vscode)` at module level. Replace all `activeTabId` references with `store.activeTabId`, all `terminals.get(id)` with `store.terminals.get(id)`, all `tabLayouts` with `store.tabLayouts`, etc. Replace `persistLayoutState()` calls with `store.persist()`, `restoreLayoutState()` with `store.restore()`. Remove the `TerminalInstance` interface (now imported from store). Remove all moved state variables and persistence functions.

## 2. Extract ResizeCoordinator

- [x] 2_1 Create `src/webview/resize/ResizeCoordinator.ts` with ResizeCoordinator class
  - **Deps**: 1_1
  - **Refs**: docs/PLAN.md#8.4; design.md#ResizeCoordinator
  - **Done**: New file exists; exports `ResizeCoordinator` class with methods: `setup(container)`, `debouncedFit()`, `debouncedFitAllLeaves(tabId)`, `onViewShow()`, `dispose()`; owns `pendingResize`, `fitTimeout`, `splitFitTimeout`, `observer` state; type-check passes
  - **Test**: N/A — pure refactor, type-check verifies
  - **Files**: `src/webview/resize/ResizeCoordinator.ts`
  - **Approach**: Create a class with constructor taking: `fitTerminal: (instance: { terminal: Terminal; container: HTMLDivElement }) => void` (fit callback), `getState: () => { activeTabId: string | null; terminals: Map<string, { terminal: Terminal; container: HTMLDivElement }>; tabLayouts: Map<string, SplitNode> }` (state accessor), and `onLocationChange: (location: TerminalLocation) => void` (location callback). Move `inferLocationFromSize()` as private static method. Move `debouncedFit()`, `fitAllTerminals()` (private), `debouncedFitAllLeaves()`, `setupResizeObserver()` -> `setup()`, `onViewShow()`. Import `RESIZE_DEBOUNCE_MS` or define locally. Import `getAllSessionIds` from SplitModel. The class does NOT import ThemeManager — location change is communicated via callback.

- [x] 2_2 Update `main.ts` to use ResizeCoordinator
  - **Deps**: 1_2, 2_1
  - **Refs**: docs/PLAN.md#8.4
  - **Done**: `main.ts` no longer has `debouncedFit()`, `fitAllTerminals()`, `debouncedFitAllLeaves()`, `setupResizeObserver()`, `onViewShow()`, `inferLocationFromSize()`, `pendingResize`, `fitResizeTimeout`, `splitFitTimeout`, `resizeObserver`; all resize coordination goes through `resizeCoordinator.*`; type-check passes
  - **Test**: N/A — pure refactor
  - **Files**: `src/webview/main.ts`
  - **Approach**: Create `const resizeCoordinator = new ResizeCoordinator(fitTerminal, () => ({ activeTabId: store.activeTabId, terminals: store.terminals, tabLayouts: store.tabLayouts }), (location) => updateLocation(location))` at module level. Replace all calls: `debouncedFit()` -> `resizeCoordinator.debouncedFit()`, `debouncedFitAllLeaves(tabId)` -> `resizeCoordinator.debouncedFitAllLeaves(tabId)`, `setupResizeObserver(el)` -> `resizeCoordinator.setup(el)`, `onViewShow()` -> `resizeCoordinator.onViewShow()`. Remove `inferLocationFromSize()`, `RESIZE_DEBOUNCE_MS` (if only used by resize functions), and all resize state variables.

## 3. Extract MessageRouter

- [x] 3_1 Create `src/webview/messaging/MessageRouter.ts` with createMessageRouter function
  - **Deps**: 1_1
  - **Refs**: docs/PLAN.md#8.6; design.md#MessageRouter
  - **Done**: New file exists; exports `MessageHandlers` interface and `createMessageRouter(handlers)` function that returns `(msg: ExtensionToWebViewMessage) => void`; `init` message type is excluded from routing (handled separately); type-check passes
  - **Test**: N/A — pure refactor, type-check verifies
  - **Files**: `src/webview/messaging/MessageRouter.ts`
  - **Approach**: Define `MessageHandlers` interface with a handler for each non-init message type. Each handler has the correct typed parameter from `messages.ts` (e.g., `onOutput(msg: OutputMessage): void`). `createMessageRouter(handlers)` returns a function that switches on `msg.type` and delegates to the corresponding handler. The `init` case is NOT included — the returned router function should ignore `init` messages (or throw/warn) since `handleInit` is called directly from `main.ts`. Unknown message types are silently ignored (matches current behavior).

- [x] 3_2 Update `main.ts` to use MessageRouter
  - **Deps**: 2_2, 3_1
  - **Refs**: docs/PLAN.md#8.6
  - **Done**: `main.ts` no longer has the `handleMessage()` switch statement; message routing delegates to the router function returned by `createMessageRouter()`; `handleInit()` is called directly for init messages; type-check passes
  - **Test**: N/A — pure refactor
  - **Files**: `src/webview/main.ts`
  - **Approach**: In `bootstrap()`, create the message router by calling `createMessageRouter({ onOutput: ..., onExit: ..., ... })` where each handler is a closure over the existing functions and state. For `init`, keep the existing `handleInit()` call in the `window.addEventListener("message", ...)` listener — check `msg.type === "init"` first and call `handleInit()`, otherwise delegate to the router. Remove the old `handleMessage()` function.

## 4. Verify

- [x] 4_1 Run type-check, lint, and unit tests to confirm no regressions
  - **Deps**: 1_2, 2_2, 3_2
  - **Refs**: project.md#Commands
  - **Done**: `pnpm run check-types` passes; `pnpm run lint` passes; `pnpm run test:unit` passes
  - **Test**: N/A — verification step
  - **Approach**: Run `pnpm run check-types`, `pnpm run lint`, `pnpm run test:unit` sequentially. Fix any issues found.
