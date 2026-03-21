<!-- Tasks are executed sequentially in dependency order (topological sort). -->
<!-- Tasks with no Deps run first; tasks whose Deps are all complete run next. -->
<!-- All tasks are doc-only — no code changes, no tests needed. -->

## 1. Protocol & Messages

- [x] 1_1 Update `docs/design/message-protocol.md` to match `src/types/messages.ts`
  - **Refs**: specs/design-doc-accuracy/spec.md#message-protocol; docs/PLAN.md#9.1
  - **Done**: All 10 WV→Ext and 15 Ext→WV message types documented; `AckMessage.tabId` present; `TerminalConfig.fontFamily` present; stale file reference removed; union type counts match
  - **Test**: N/A — doc-only
  - **Files**: `docs/design/message-protocol.md`
  - **Approach**: Add `RequestSplitSessionMessage`, `RequestCloseSplitPaneMessage` to WV→Ext catalog (§3). Add `ViewShowMessage`, `SplitPaneMessage`, `SplitPaneCreatedMessage`, `CloseSplitPaneMessage`, `CloseSplitPaneByIdMessage`, `SplitPaneAtMessage`, `CtxClearMessage` to Ext→WV catalog (§4). Add `tabId` to `AckMessage` (§3.2). Add `fontFamily` to `TerminalConfig` (§5). Update union types (§6). Remove `src/webview/utils/MessageHandler.ts` from dependents (§12). Update dependent list to include MessageRouter.

## 2. Xterm & Terminal Creation

- [x] 2_1 Update `docs/design/xterm-integration.md` to match TerminalFactory and post-refactor structure
  - **Refs**: specs/design-doc-accuracy/spec.md#xterm-integration; docs/PLAN.md#9.2
  - **Done**: xterm v6 referenced; lazy loading removed; `allowProposedApi` removed; WebGL documented as always-loaded; addon cache removed; custom fitTerminal() documented; file structure reflects new modules; TerminalInstance interface updated (no fitAddon/webLinksAddon properties)
  - **Test**: N/A — doc-only
  - **Files**: `docs/design/xterm-integration.md`
  - **Approach**: Fix version in §9 deps table (v5→v6). Remove §3 lazy loading section. Remove `allowProposedApi` from §3 constructor options. Update §4 addon loading to reflect always-loaded WebGL (no gpuAcceleration config). Remove addon cache code block. Document custom `fitTerminal()` in §5 renderer selection. Update §2 architecture diagram to show new modules (TerminalFactory, WebviewStateStore, FlowControl, etc.). Update TerminalInstance interface (remove fitAddon, webLinksAddon). Update §10 file locations to show new module structure.

## 3. Resize System

- [x] 3_1 Update `docs/design/resize-handling.md` to match ResizeCoordinator + XtermFitService
  - **Refs**: specs/design-doc-accuracy/spec.md#resize-handling; docs/PLAN.md#9.3
  - **Done**: FitAddon.fit() pipeline replaced with custom fitTerminal() using getBoundingClientRect(); ResizeHandler class replaced with ResizeCoordinator + XtermFitService; split-pane resize documented; file paths match actual code; `inferLocationFromSize()` documented
  - **Test**: N/A — doc-only
  - **Files**: `docs/design/resize-handling.md`
  - **Approach**: Update §3 pipeline to show custom `fitTerminal()` via XtermFitService instead of FitAddon.fit(). Replace §5 ResizeHandler class with ResizeCoordinator (one coordinator, not per-terminal). Update §4 DPI calculation to reference XtermFitService using getBoundingClientRect(). Add split-pane resize system note. Replace §10 IResizeHandler interface with actual ResizeCoordinator shape. Update §11 file location from `src/webview/utils/ResizeHandler.ts` to `src/webview/resize/ResizeCoordinator.ts` + `src/webview/resize/XtermFitService.ts`.

## 4. Theme System

- [x] 4_1 Update `docs/design/theme-integration.md` to match ThemeManager class
  - **Refs**: specs/design-doc-accuracy/spec.md#theme-integration; docs/PLAN.md#9.4
  - **Done**: Background resolution priority order matches code; ThemeManager interface matches actual class; all theme properties documented (including cursor accent, selection foreground, inactive selection bg, scrollbar properties); dynamic location inference documented; `minimumContrastRatio` high-contrast behavior documented; file path correct; default location parameter matches code (`"sidebar"`)
  - **Test**: N/A — doc-only
  - **Files**: `docs/design/theme-integration.md`
  - **Approach**: Fix §3 background resolution to location-specific first, then terminal-background (matching code line `get(LOCATION_BACKGROUND_MAP[location]) ?? get("--vscode-terminal-background")`). Add 7 missing theme properties to §2.2 and §6 (cursorAccent, selectionForeground, selectionInactiveBackground, scrollbarSliderBackground/HoverBackground/ActiveBackground + hiding scrollbar). Update §9 IThemeManager interface to match actual ThemeManager class (applyToAll(terminals) instead of registerTerminal/unregisterTerminal). Fix §10 file path from `src/webview/ui/ThemeManager.ts` to `src/webview/theme/ThemeManager.ts`. Fix default location from `"panel"` to `"sidebar"`. Document `inferLocationFromSize()` and `minimumContrastRatio` (7 for high-contrast, 4.5 for normal).

## 5. Input Handling

- [x] 5_1 Update `docs/design/keyboard-input.md` to match InputHandler factory function
  - **Refs**: specs/design-doc-accuracy/spec.md#keyboard-input; docs/PLAN.md#9.5
  - **Done**: Paste section replaced with native xterm paste behavior; `enableCmdK` removed; Escape (clear selection) and Cmd+Backspace (line kill \x15) documented; interface updated to `createKeyEventHandler()` factory; file path fixed to `src/webview/InputHandler.ts`; `handlePaste()` marked as removed
  - **Test**: N/A — doc-only
  - **Files**: `docs/design/keyboard-input.md`
  - **Approach**: Replace §4 bracketed paste flow entirely — document that Cmd+V returns `false` to let xterm handle paste natively (no custom `handlePaste()`). Remove `enableCmdK` from §2 decision tree and §8 config table. Add Escape→clearSelection and Cmd+Backspace→`\x15` line kill to §2 decision tree and §7 key routing table. Replace §10 IInputHandler interface with `createKeyEventHandler(deps: KeyHandlerDeps)` factory. Fix §11 file path. Note Cmd+K sends clear notification via postMessage (not just terminal.clear).

## 6. Flow & Lifecycle

- [x] 6_1 Update `docs/design/flow-initialization.md` to match actual bootstrap sequence
  - **Refs**: specs/design-doc-accuracy/spec.md#flow-initialization; docs/PLAN.md#9.6
  - **Done**: Pre-launch input queue removed; ResizeObserver timing fixed; init message shape corrected (no `sessionId`); function names updated to match post-refactor code
  - **Test**: N/A — doc-only
  - **Files**: `docs/design/flow-initialization.md`
  - **Approach**: Remove steps 9a and 22a (pre-launch input queue) from sequence diagram. Remove "Pre-Launch Input Queue" section. Fix step 17 init message to not include `sessionId`. Update step 8 to note ResizeObserver is set up in handleInit, not bootstrap. Update function name references to match new module structure (TerminalFactory.createTerminal, etc.).

- [x] 6_2 Update `docs/design/flow-multi-tab.md` to remove fictional features and update lifecycle
  - **Deps**: 6_1
  - **Refs**: specs/design-doc-accuracy/spec.md#flow-multi-tab; docs/PLAN.md#9.7
  - **Done**: `stateUpdate` reconciliation removed; `maxTabs`/`_canCreateTerminal` removed; "request new tab when last closed" documented; `_operationQueue` pattern removed (inline orchestration used)
  - **Test**: N/A — doc-only
  - **Files**: `docs/design/flow-multi-tab.md`
  - **Approach**: Remove `stateUpdate` message from create and close flows. Remove §"Max Terminal Limit" section and `_canCreateTerminal` code block. Remove `_operationQueue` code block. Document that closing the last tab triggers auto-creation of a new tab (postMessage createTab). Add note about split pane lifecycle being handled by SplitTreeRenderer. Update TabManager references to SplitTreeRenderer/WebviewStateStore where appropriate.

## 7. Buffering & Errors

- [x] 7_1 Update `docs/design/output-buffering.md` to match adaptive buffering and FlowControl
  - **Refs**: specs/design-doc-accuracy/spec.md#output-buffering; docs/PLAN.md#9.8
  - **Done**: Adaptive flush interval (4-16ms) documented; 1MB buffer overflow protection with FIFO eviction documented; output pause/resume for hidden views documented; ack batching uses `if` not `while`; AckBatcher replaced with FlowControl per-session; `tabId` included in ack messages
  - **Test**: N/A — doc-only
  - **Files**: `docs/design/output-buffering.md`
  - **Approach**: Update §3 flush interval from fixed 8ms to adaptive 4-16ms based on rolling throughput. Update constants table. Add 1MB buffer overflow protection with FIFO eviction to §3 or new subsection. Add output pause/resume for hidden views. Replace §4 AckBatcher class with FlowControl (`src/webview/flow/FlowControl.ts`) using per-session `unsentAckCharsMap`. Change `while` loop to `if` in ack batching code. Add `tabId` to ack message examples. Update architecture diagram labels.

- [x] 7_2 Update `docs/design/error-handling.md` to match actual error classes and logging
  - **Deps**: 7_1
  - **Refs**: specs/design-doc-accuracy/spec.md#error-handling; docs/PLAN.md#9.9
  - **Done**: Only 3 error classes documented; removed classes noted; `ErrorCode` as `string enum` with 3 values (`PtyLoadFailed`, `ShellNotFound`, `BufferOverflow`); logging is `console.*`; CWD validation removed; error banner UI documented; orphaned PTY cleanup on webview disposal removed
  - **Test**: N/A — doc-only
  - **Files**: `docs/design/error-handling.md`
  - **Approach**: Remove `SpawnError`, `CwdNotFoundError`, `WebViewDisposedError`, `SessionNotFoundError` from §7 error types. Remove `SpawnFailed`, `CwdNotFound`, `WebViewDisposed`, `SessionNotFound` from ErrorCode enum. Change `const enum` to `enum` (string enum). Remove §3.6 CWD validation section. Remove §9.2 Output Channel section — replace with note that all logging uses `console.*`. Simplify §3.4 WebView communication failure (remove orphaned PTY cleanup — code just swallows silently). Add §5.5 for error banner UI system (BannerService). Update §10 file locations table to remove references to dead error classes.

## 8. Final Review

- [x] 8_1 Cross-check all 9 updated docs for internal consistency
  - **Deps**: 1_1, 2_1, 3_1, 4_1, 5_1, 6_1, 6_2, 7_1, 7_2
  - **Refs**: docs/refactor/webview-implementation-vs-design.md
  - **Done**: All cross-references between docs are valid; no doc references a removed class/file; all file paths match `src/` structure
  - **Test**: N/A — doc-only
  - **Approach**: Grep all 9 updated docs for references to removed entities (ResizeHandler, handlePaste, FitAddon.fit, AckBatcher, stateUpdate, maxTabs, _operationQueue, MessageHandler.ts, CwdNotFoundError, SpawnError, WebViewDisposedError, SessionNotFoundError). Verify cross-doc references (e.g., message-protocol references from other docs). Ensure mermaid diagrams don't reference removed components.
