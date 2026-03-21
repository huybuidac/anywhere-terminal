<!-- Tasks are executed sequentially in dependency order (topological sort). -->
<!-- Tasks with no Deps run first; tasks whose Deps are all complete run next. -->

## 1. Extract TerminalFactory

- [x] 1_1 Create `src/webview/terminal/TerminalFactory.ts` — extract terminal creation and config logic
  - **Refs**: `specs.md#Terminal-Creation`; `docs/PLAN.md#8.7`
  - **Done**: `createTerminal()`, `attachInputHandler()`, `getClipboardProvider()`, `getFontFamily()`, `fitTerminal()` wrapper, WebGL tracking (`webglFailed`), and `applyConfig()` are in TerminalFactory; main.ts imports and delegates to the factory; `pnpm run check-types && pnpm run lint` passes
  - **Test**: N/A — pure refactor, no behavioral change; verify with `pnpm run check-types && pnpm run lint`
  - **Files**: `src/webview/terminal/TerminalFactory.ts` (new), `src/webview/main.ts` (modified)
  - **Approach**: Create a `TerminalFactory` class that receives dependencies via constructor: `themeManager: ThemeManager`, `store: WebviewStateStore`, `postMessage: (msg: unknown) => void`, `onTabBarUpdate: () => void`. Move `fitTerminal()` (lines 62-72 — the wrapper that calls XtermFitService and does `terminal.resize()`), `createTerminal()` (lines 388-506), `attachInputHandler()` (lines 332-354), `getClipboardProvider()` (lines 317-325), `getFontFamily()` (lines 378-382), `applyConfig()` (lines 714-754), `getActivePaneTerminal()` (lines 757-763), and the `webglFailed` state. Keep `isComposing` in main.ts and pass `getIsComposing: () => boolean` to the factory constructor. The factory exposes: `createTerminal(id, name, config, isActive): TerminalInstance`, `applyConfig(config)`, `fitTerminal(instance)`, and `getActivePaneTerminal()`. Note: `fitTerminal` is also needed by ResizeCoordinator — factory.fitTerminal.bind(factory) is passed to ResizeCoordinator. Note: `createTerminal` initializes split layout (`store.tabLayouts.set`) — this is acceptable since factory receives the store.

- [x] 1_2 Update main.ts to use TerminalFactory — remove extracted code, wire factory
  - **Deps**: 1_1
  - **Refs**: `specs.md#main.ts-as-Composition-Root`
  - **Done**: main.ts no longer contains createTerminal/attachInputHandler/getClipboardProvider/getFontFamily/fitTerminal/applyConfig/webglFailed; all callers (handleInit, routeMessage handlers, switchTab, closeSplitPaneById) use factory methods; ResizeCoordinator receives `factory.fitTerminal.bind(factory)`; `pnpm run check-types && pnpm run lint` passes
  - **Test**: N/A — pure refactor; verify with `pnpm run check-types && pnpm run lint`
  - **Files**: `src/webview/main.ts`
  - **Approach**: Instantiate TerminalFactory after store and themeManager. Pass `factory.fitTerminal.bind(factory)` to ResizeCoordinator constructor. Replace all inline function calls: `createTerminal(...)` → `factory.createTerminal(...)`, `applyConfig(...)` → `factory.applyConfig(...)`, `fitTerminal(instance)` → `factory.fitTerminal(instance)`, `getActivePaneTerminal()` → `factory.getActivePaneTerminal()`. Remove the extracted functions and `webglFailed` state. Update `routeMessage` handler bodies: `onConfigUpdate` → `factory.applyConfig()`, `onCtxClear` → `factory.getActivePaneTerminal()`.

## 2. Extract SplitTreeRenderer

- [x] 2_1 Create `src/webview/split/SplitTreeRenderer.ts` — extract split tree rendering and pane orchestration
  - **Refs**: `specs.md#Split-Tree-Rendering`; `docs/PLAN.md#8.7`
  - **Done**: `_renderTabSplitTree()`, `showTabContainer()`, `updateActivePaneVisual()`, and `closeSplitPaneById()` are in SplitTreeRenderer; main.ts imports and delegates; `pnpm run check-types && pnpm run lint` passes
  - **Test**: N/A — pure refactor; verify with `pnpm run check-types && pnpm run lint`
  - **Files**: `src/webview/split/SplitTreeRenderer.ts` (new), `src/webview/main.ts` (modified)
  - **Approach**: Create a `SplitTreeRenderer` class that receives via constructor: `store: WebviewStateStore`, `resizeCoordinator: ResizeCoordinator`, `flowControl: FlowControl`, `postMessage: (msg: unknown) => void`, `onTabBarUpdate: () => void`. Move `_renderTabSplitTree()` (lines 164-264), `showTabContainer()` (lines 269-278), `updateActivePaneVisual()` (lines 285-312), and `closeSplitPaneById()` (lines 99-158). `closeSplitPaneById` belongs here because it's primarily split-tree manipulation — it calls _renderTabSplitTree, showTabContainer, updateTabBar, and disposes terminals from the split layout. The class exposes: `renderTabSplitTree(tabId)`, `showTabContainer(tabId)`, `updateActivePaneVisual(tabId)`, `closeSplitPaneById(paneSessionId)`. The click-to-focus handler inside _renderTabSplitTree calls `onTabBarUpdate()` callback and `store.persist()`.

- [x] 2_2 Update main.ts to use SplitTreeRenderer — remove extracted code, wire renderer
  - **Deps**: 2_1, 3_1
  - **Refs**: `specs.md#main.ts-as-Composition-Root`
  - **Done**: main.ts no longer contains _renderTabSplitTree/showTabContainer/updateActivePaneVisual/closeSplitPaneById; all callers use renderer methods; routeMessage handlers (onSplitPaneCreated, onCloseSplitPane, onCloseSplitPaneById) delegate to renderer; `pnpm run check-types && pnpm run lint` passes
  - **Test**: N/A — pure refactor; verify with `pnpm run check-types && pnpm run lint`
  - **Files**: `src/webview/main.ts`
  - **Approach**: Instantiate SplitTreeRenderer after store, resizeCoordinator, and flowControl. Replace all calls: `_renderTabSplitTree(tabId)` → `splitRenderer.renderTabSplitTree(tabId)`, `showTabContainer(tabId)` → `splitRenderer.showTabContainer(tabId)`, `updateActivePaneVisual(tabId)` → `splitRenderer.updateActivePaneVisual(tabId)`, `closeSplitPaneById(id)` → `splitRenderer.closeSplitPaneById(id)`. Update routeMessage handlers: `onCloseSplitPane` and `onCloseSplitPaneById` become one-liners delegating to splitRenderer. `onSplitPaneCreated` handler body (lines 835-873) becomes a thin delegate — the split-tree update logic (createBranch, replaceNode, _renderTabSplitTree, showTabContainer, debouncedFitAllLeaves) moves into a `splitRenderer.handleSplitPaneCreated(msg)` method.

## 3. Extract FlowControl

- [x] 3_1 Create `src/webview/flow/FlowControl.ts` — extract ack batching logic
  - **Refs**: `specs.md#Flow-Control-Tracking`; `docs/PLAN.md#8.7`
  - **Done**: `ackChars()`, `ACK_BATCH_SIZE`, and `unsentAckCharsMap` are in FlowControl; main.ts imports and delegates; `pnpm run check-types && pnpm run lint` passes
  - **Test**: N/A — pure refactor; verify with `pnpm run check-types && pnpm run lint`
  - **Files**: `src/webview/flow/FlowControl.ts` (new), `src/webview/main.ts` (modified)
  - **Approach**: Create a `FlowControl` class with constructor taking `postMessage: (msg: unknown) => void`. Move `ACK_BATCH_SIZE` constant, `unsentAckCharsMap`, and `ackChars()` function. Expose `ackChars(count: number, tabId: string): void` and `delete(sessionId: string): void` methods. This is the simplest extraction — 10 LOC of logic + 1 constant + 1 Map. Follow the BannerService pattern (minimal, focused module).

- [x] 3_2 Update main.ts to use FlowControl — remove extracted code
  - **Deps**: 3_1
  - **Refs**: `specs.md#main.ts-as-Composition-Root`
  - **Done**: main.ts no longer contains ackChars/ACK_BATCH_SIZE/unsentAckCharsMap; routeMessage.onOutput handler uses flowControl.ackChars(); removeTerminal uses flowControl.delete(); `pnpm run check-types && pnpm run lint` passes
  - **Test**: N/A — pure refactor; verify with `pnpm run check-types && pnpm run lint`
  - **Files**: `src/webview/main.ts`
  - **Approach**: Replace `ackChars(count, tabId)` → `flowControl.ackChars(count, tabId)`. Replace `unsentAckCharsMap.delete(id)` → `flowControl.delete(id)`. Remove the extracted function, constant, and Map. Instantiate FlowControl early (only needs vscode.postMessage).

## 4. Slim down routeMessage handlers and updateTabBar

- [x] 4_1 Move routeMessage handler bodies into service method calls — reduce handler closure from 157 to ~50 LOC
  - **Deps**: 1_2, 2_2, 3_2
  - **Refs**: `specs.md#main.ts-as-Composition-Root`
  - **Done**: Each routeMessage handler is at most 5 LOC (one-liner or short delegate); `onSplitPaneCreated` delegates to `splitRenderer.handleSplitPaneCreated()`; `onOutput` is a thin write+ack delegate; `pnpm run check-types && pnpm run lint` passes
  - **Test**: N/A — pure refactor; verify with `pnpm run check-types && pnpm run lint`
  - **Files**: `src/webview/main.ts`, `src/webview/split/SplitTreeRenderer.ts`
  - **Approach**: Audit each routeMessage handler body. Most are already 1-3 LOC delegates. The big one is `onSplitPaneCreated` (38 LOC) — move its body into `splitRenderer.handleSplitPaneCreated(msg, factory)` where it calls factory.createTerminal, updates split layout, calls renderTabSplitTree, etc. `onSplitPane` (7 LOC) and `onSplitPaneAt` (9 LOC) are small enough to stay. `onOutput` (11 LOC) stays — it's a write+ack pattern that touches terminal and flowControl. Estimated: 157 → ~60 LOC.

- [x] 4_2 Move `updateTabBar` data-assembly logic into TabBarUtils — thin main.ts to 5-line delegate
  - **Deps**: 1_2
  - **Refs**: `specs.md#main.ts-as-Composition-Root`
  - **Done**: The data-mapping loop (building tabTerminals from store) is in TabBarUtils as `buildTabBarData()`; main.ts `updateTabBar()` is ≤10 LOC calling buildTabBarData + renderTabBar; `pnpm run check-types && pnpm run lint` passes
  - **Test**: N/A — pure refactor; verify with `pnpm run check-types && pnpm run lint`
  - **Files**: `src/webview/TabBarUtils.ts` (modified), `src/webview/main.ts` (modified)
  - **Approach**: Extract the for-loop at lines 674-692 (builds `tabTerminals` map from `store.tabLayouts` + `store.tabActivePaneIds` + `store.terminals`) into a new `buildTabBarData(store)` function in TabBarUtils. This function returns `Map<string, TabInfo>`. In main.ts, `updateTabBar()` becomes: `const data = buildTabBarData(store); renderTabBar({...})`. Saves ~35 LOC.

## 5. Final Cleanup and Verification

- [x] 5_1 Audit and clean up main.ts — verify <300 LOC target, clean imports
  - **Deps**: 4_1, 4_2
  - **Refs**: `specs.md#main.ts-as-Composition-Root`; `docs/PLAN.md#8.7`
  - **Done**: main.ts is <300 LOC; only contains: imports, service instantiation, thin orchestration (switchTab, removeTerminal, updateTabBar, updateLocation), routeMessage wiring (thin handlers), handleInit, bootstrap, DOMContentLoaded guard; `pnpm run check-types && pnpm run lint && pnpm run test:unit` all pass
  - **Test**: N/A — pure refactor; verify with `pnpm run check-types && pnpm run lint && pnpm run test:unit`
  - **Files**: `src/webview/main.ts`
  - **Approach**: Count lines in main.ts (target <300). Expected breakdown: imports (~15), state/service init (~15), factory/renderer/flow instantiation (~15), updateLocation (~6), switchTab (~50 — thinner now with factory.fitTerminal), removeTerminal (~55 — thinner with flowControl.delete and splitRenderer removed), updateTabBar (~10), routeMessage (~60), handleInit (~40), bootstrap (~50), DOMContentLoaded (~6) = ~322 LOC. If over 300, look for: (a) switchTab fit-all-leaves loop → delegate to resizeCoordinator, (b) removeTerminal split-pane cleanup → delegate to splitRenderer.removeTab(). Run full verification suite.

- [x] 5_2 Update PLAN.md — mark Phase 8.7 tasks as complete
  - **Deps**: 5_1
  - **Refs**: `docs/PLAN.md#8.7`
  - **Done**: Phase 8.7 checklist items in PLAN.md are marked [x]; remaining LOC count is documented
  - **Test**: N/A — doc-only
  - **Files**: `docs/PLAN.md`
  - **Approach**: Mark the Phase 8.7 bullet items as [x] in PLAN.md. Update any LOC references if the actual count differs from estimates. If LOC is slightly above 300 (e.g., 310), document the actual count and note what would need further extraction.
