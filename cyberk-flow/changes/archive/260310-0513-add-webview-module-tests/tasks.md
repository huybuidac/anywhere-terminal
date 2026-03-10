<!-- Tasks are executed sequentially in dependency order (topological sort). -->
<!-- Tasks with no Deps run first; tasks whose Deps are all complete run next. -->

## 1. Test Infrastructure

- [x] 1_1 Create shared xterm Terminal mock helper for webview tests
  - **Refs**: specs.md; discovery.md#Key-Decisions
  - **Done**: `src/webview/test-utils/mockTerminal.ts` exists and exports `createMockTerminal()` that returns an object satisfying the `Terminal` interface subset used by all 6 modules
  - **Test**: N/A — utility file, validated by consumer tests
  - **Files**: `src/webview/test-utils/mockTerminal.ts`
  - **Approach**: Create a factory function returning an object with: `element` (mock HTMLDivElement), `options` (mutable object with `theme`, `minimumContrastRatio`, `fontSize`, `scrollback`, `fontFamily`), `rows`/`cols` (numbers), `_core._renderService.dimensions` (mock cell dimensions), `_core._renderService.clear` (vi.fn), `write` (vi.fn that calls callback sync), `clear` (vi.fn), `dispose` (vi.fn). Follow pattern from InputHandler.test.ts `createMockTerminal()`.

## 2. Unit Tests — Extracted Modules

- [x] 2_1 Add unit tests for BannerService
  - **Deps**: 1_1
  - **Refs**: specs.md#Unit-tests-for-BannerService
  - **Done**: All 5 BannerService scenarios pass
  - **Test**: `src/webview/ui/BannerService.test.ts` (unit)
  - **Files**: `src/webview/ui/BannerService.test.ts`
  - **Approach**: Use `// @vitest-environment jsdom`. Create container div in beforeEach, clean up in afterEach. Use `vi.useFakeTimers()` for auto-dismiss test. Call `showBanner()`, assert DOM structure (querySelector for classes), click dismiss button, advance timers for info auto-dismiss. Simplest module — good first test to validate patterns.

- [x] 2_2 Add unit tests for MessageRouter
  - **Deps**: 1_1
  - **Refs**: specs.md#Unit-tests-for-MessageRouter
  - **Done**: All 3 MessageRouter scenarios pass (dispatch, init exclusion, unknown type)
  - **Test**: `src/webview/messaging/MessageRouter.test.ts` (unit)
  - **Files**: `src/webview/messaging/MessageRouter.test.ts`
  - **Approach**: No DOM needed (default node environment). Create `MessageHandlers` object with all 14 handler functions as `vi.fn()`. Call `createMessageRouter(handlers)` to get dispatch function. For each message type, dispatch a message and assert the correct handler was called with the message. Test init → no handler called. Test unknown type → no handler called, no throw.

- [x] 2_3 Add unit tests for WebviewStateStore
  - **Deps**: 1_1
  - **Refs**: specs.md#Unit-tests-for-WebviewStateStore
  - **Done**: All 8 WebviewStateStore scenarios pass
  - **Test**: `src/webview/state/WebviewStateStore.test.ts` (unit)
  - **Files**: `src/webview/state/WebviewStateStore.test.ts`
  - **Approach**: No DOM needed. Create mock VsCodeStateApi with `getState: vi.fn()` and `setState: vi.fn()`. Test initial state defaults. Test mutations (setActiveTab, setLayout, deleteLayout, setActivePaneId, getActivePaneId). Test persist (assert setState called with correct shape). Test restore with valid, null, and malformed state. Test pane ID validation against layout using real SplitModel `createLeaf`/`createBranch`.

- [x] 2_4 Add unit tests for ThemeManager
  - **Deps**: 1_1
  - **Refs**: specs.md#Unit-tests-for-ThemeManager
  - **Done**: All 8 ThemeManager scenarios pass
  - **Test**: `src/webview/theme/ThemeManager.test.ts` (unit)
  - **Files**: `src/webview/theme/ThemeManager.test.ts`
  - **Approach**: Use `// @vitest-environment jsdom`. Mock `getComputedStyle` to return controlled CSS variable values. Set body class for high-contrast detection. Use `createMockTerminal()` from shared helper for `applyToAll`. Test `updateLocation` return values. For MutationObserver tests: call `startWatching(callback)`, mutate `document.body.className`, and use `await vi.waitFor()` or `MutationObserver` flush to verify callback was called.

- [x] 2_5 Add unit tests for XtermFitService
  - **Deps**: 1_1
  - **Refs**: specs.md#Unit-tests-for-XtermFitService
  - **Done**: All 8 XtermFitService scenarios pass
  - **Test**: `src/webview/resize/XtermFitService.test.ts` (unit)
  - **Files**: `src/webview/resize/XtermFitService.test.ts`
  - **Approach**: Use `// @vitest-environment jsdom`. Use `createMockTerminal()` for the terminal. Create a real HTMLDivElement for parentElement and mock `getBoundingClientRect` with `vi.spyOn`. Mock `window.getComputedStyle` to return padding values. Test each null-return scenario by removing required properties. Test dimension calculation: set cell dims to 10x20, parent to 200x400, expect cols=20, rows=20. Test no-op when cols/rows match. Test minimum enforcement (cols≥2, rows≥1). Test `_renderService.clear()` called on resize.

- [x] 2_6 Add unit tests for ResizeCoordinator
  - **Deps**: 1_1
  - **Refs**: specs.md#Unit-tests-for-ResizeCoordinator
  - **Done**: All 7 ResizeCoordinator scenarios pass
  - **Test**: `src/webview/resize/ResizeCoordinator.test.ts` (unit)
  - **Files**: `src/webview/resize/ResizeCoordinator.test.ts`
  - **Approach**: Use `vi.useFakeTimers()`. Create mock fitTerminal as `vi.fn()`. Create mock state with terminals Map and tabLayouts Map using real SplitModel nodes. Create mock onLocationChange as `vi.fn()`. For debounce tests: call `debouncedFit()` 3 times, advance timer by 100ms, assert fitTerminal called once. For pending resize: need to mock ResizeObserver — use `vi.stubGlobal('ResizeObserver', mockClass)` to control callback invocation. For `inferLocationFromSize`: test via setup callback — trigger ResizeObserver with different aspect ratios and verify onLocationChange calls. Mock `requestAnimationFrame` with `vi.stubGlobal('requestAnimationFrame', (cb: Function) => cb())` to execute callbacks synchronously, since jsdom may not provide it and the coordinator uses it inside `debouncedFit()` and `onViewShow()`.

- [x] 2_7 Add unit tests for FlowControl
  - **Deps**: 1_1
  - **Refs**: specs.md#Unit-tests-for-FlowControl
  - **Done**: All FlowControl scenarios pass (batching, threshold, delete, multi-session)
  - **Test**: `src/webview/flow/FlowControl.test.ts` (unit)
  - **Files**: `src/webview/flow/FlowControl.test.ts`
  - **Approach**: No DOM needed. Create FlowControl with mock postMessage (`vi.fn()`). Test: accumulate below threshold (4999 chars) → no ack sent. Add 1 more char → ack sent with charCount=5000. Test `delete()` removes session tracking. Test interleaved multi-session acking — each session has independent accumulator.

## 3. Integration Tests

- [x] 3_1 Add integration tests for critical flows (ack routing, tab lifecycle, split pane, config update)
  - **Deps**: 2_1, 2_2, 2_3, 2_4, 2_5, 2_6, 2_7
  - **Refs**: specs.md#Integration-tests-for-critical-flows
  - **Done**: All 4 integration scenarios pass
  - **Test**: `src/webview/integration/webviewFlows.test.ts` (integration)
  - **Files**: `src/webview/integration/webviewFlows.test.ts`
  - **Approach**: Use `// @vitest-environment jsdom`. Wire real module instances together: FlowControl + MessageRouter + WebviewStateStore + createMockTerminal. For ack routing: create FlowControl with mock postMessage, write output to a background tab terminal, verify ack includes correct tabId. For tab lifecycle: create store, add terminals, switch tabs, remove last terminal, verify createTab message sent. For split pane: create store with layout, use SplitModel to split/remove, verify layout state transitions. For config update: create store with terminals, apply config, verify terminal options updated.

## 4. Validation

- [x] 4_1 Run full test suite and verify all new tests pass alongside existing 333 tests
  - **Deps**: 3_1
  - **Refs**: cyberk-flow/project.md#Commands
  - **Done**: `pnpm run test:unit` passes with 0 failures, test count increased
  - **Test**: N/A — validation step
  - **Approach**: Run `pnpm run test:unit`. Verify no regressions in existing tests. Run `pnpm run check-types` to verify no type errors in test files. Run `pnpm run lint` to verify formatting.
