# AnyWhere Terminal - Refactoring Plan v2

## Context

Phases 1-3 and 5 from the original plan (`docs/PLAN.v1.md`) are complete. The extension works: sidebar, panel, editor terminals with multi-tab, split panes, theme integration, keyboard shortcuts, context menus, and flow control.

However, the codebase has accumulated significant technical debt:

- `src/webview/main.ts` is 1473 LOC with 18 distinct responsibilities
- Design docs have drifted from implementation (36 mismatches, 38 undocumented features)
- 3 correctness bugs identified
- Dead code exists across multiple files
- Zero testability in the webview layer

Full audit results: `docs/refactor/webview-implementation-vs-design.md`
VS Code patterns analysis: `docs/refactor/vscode-terminal-patterns.md`
Target architecture: `docs/refactor/webview-refactor-plan.md`

---

## Phase 6 — Fix Correctness Bugs

### Goal

Fix 3 bugs identified during the audit that affect runtime correctness.

### 6.1 Fix ack routing — make it session-scoped

**Problem**: Webview sends `{ type: "ack", charCount }` with no `tabId`. Provider routes all acks to the active session only (`TerminalViewProvider.ts:142-149`). If a background tab produces heavy output, its acks credit the wrong session's OutputBuffer, potentially permanently pausing the background tab's PTY.

**Fix**:
- [ ] Add `tabId: string` field to `AckMessage` in `src/types/messages.ts:89-93`
- [ ] Update `ackChars()` in `src/webview/main.ts:640-646` to track per-tab char counts and send `tabId` with each ack
- [ ] Update `TerminalViewProvider.ts:142-149` to route ack by `message.tabId` instead of finding the active tab
- [ ] Update `TerminalEditorProvider.ts` ack handler similarly

**Reference**: `docs/refactor/webview-implementation-vs-design.md` — "Fix correctness bugs" section

### 6.2 Fix shared resizeTimeout

**Problem**: `debouncedFit()` (`main.ts:709`) and `debouncedFitAllLeaves()` (`main.ts:400`) share a single `resizeTimeout` variable (`main.ts:95`). They clobber each other's debounce timers — a split-pane resize during a window resize cancels one operation.

**Fix**:
- [ ] Split `resizeTimeout` into two separate timers: `fitResizeTimeout` and `splitFitTimeout`
- [ ] `debouncedFit()` uses `fitResizeTimeout`
- [ ] `debouncedFitAllLeaves()` uses `splitFitTimeout`

### 6.3 Add null guard on `_renderService.clear()`

**Problem**: `main.ts:699` calls `core._renderService.clear()` without optional chaining, while `main.ts:666` uses `core?._renderService?.dimensions` with guards. If `_core` or `_renderService` is unavailable, line 699 throws.

**Fix**:
- [ ] Change `core._renderService.clear()` to `core?._renderService?.clear()`

---

## Phase 7 — Remove Dead Code

### Goal

Clean up unused code identified during the audit.

### 7.1 Remove dead `fitAddon` property from TerminalInstance

**Problem**: `FitAddon` is instantiated and loaded (`main.ts:859-861`), stored on every instance (`main.ts:896`), but `instance.fitAddon` is never read. The custom `fitTerminal()` bypasses it entirely using xterm `_core` internals.

**Fix**:
- [ ] Remove `fitAddon` from `TerminalInstance` interface (`main.ts:41`)
- [ ] Remove `webLinksAddon` from `TerminalInstance` interface (`main.ts:42`) — addon is loaded but stored property is never read
- [ ] Remove the property assignments in `createTerminal()` (`main.ts:896-897`)
- [ ] Keep the addon loading (`terminal.loadAddon(fitAddon)`) since the addons are still active — just stop storing references that are never used

### 7.2 Remove dead `handlePaste()` from InputHandler

**Problem**: `handlePaste()` in `InputHandler.ts:45-58` is exported but never called anywhere. The `case "v"` handler returns `false` to let xterm handle paste natively.

**Fix**:
- [ ] Remove `handlePaste()` function from `src/webview/InputHandler.ts:37-58`
- [ ] Remove `paste` from `TerminalLike` interface (`InputHandler.ts:21`) if no other consumer uses it

### 7.3 Remove dead error classes

**Problem**: 4 error classes in `src/types/errors.ts` are defined but never thrown: `SpawnError`, `CwdNotFoundError`, `WebViewDisposedError`, `SessionNotFoundError`.

**Fix**:
- [ ] Remove unused error classes from `src/types/errors.ts`
- [ ] Keep `PtyLoadError` and `ShellNotFoundError` which are actively used

---

## Phase 8 — Extract Modules from `main.ts`

### Goal

Break `src/webview/main.ts` (1473 LOC) into focused modules. Target: `main.ts` < 300 LOC as a thin composition root.

**Reference**: `docs/refactor/webview-refactor-plan.md` for full target architecture and `docs/refactor/vscode-terminal-patterns.md` for applicable VS Code patterns.

### Design Patterns Applied

| Module            | Pattern                      | VS Code Inspiration                                    |
| ----------------- | ---------------------------- | ------------------------------------------------------- |
| ThemeManager      | Observer + Service           | `XtermTerminal._updateTheme()` separate from config     |
| BannerService     | Presenter (stateless UI)     | Notification rendering decoupled from logic             |
| XtermFitService   | Facade + Strategy            | `getXtermScaledDimensions()` in `xtermTerminal.ts`      |
| ResizeCoordinator | Coordinator + Policy object  | `TerminalResizeDebouncer` as dedicated policy            |
| WebviewStateStore | Store (named mutations)      | `TerminalService` owns state, UI reads from service      |
| MessageRouter     | Message Router + Command     | `ICommandHandler` registry for dispatch                  |
| main.ts           | Composition Root / App Shell | `TerminalViewPane` composes services, owns no logic      |

### Patterns to avoid

- **Deep inheritance** — use composition, not class hierarchies
- **Generic event bus** — use typed callbacks or direct method calls
- **Full DI container** — overkill for a webview; constructor injection is enough
- **Premature class extraction** — pure helper functions (e.g., `getFontFamily()`) stay as functions

### 8.1 Extract ThemeManager (~130 LOC)

**Target**: `src/webview/theme/ThemeManager.ts`
**Pattern**: Observer + Service

The ThemeManager is an **Observer** — it watches `document.body` class changes via `MutationObserver` and reacts by rebuilding the theme. It is also a **Service** that owns theme state and exposes it to consumers. VS Code's `XtermTerminal` separates `_updateTheme()` from `updateConfig()` — we follow the same principle: theme is a standalone concern, not tangled with config or resize.

**Extract from `main.ts`**:
- [ ] `getXtermTheme()` (lines 442-490)
- [ ] `isHighContrastTheme()` (lines 496-501)
- [ ] `getMinimumContrastRatio()` (lines 507-509)
- [ ] `applyThemeToAll()` (lines 514-521)
- [ ] `startThemeWatcher()` (lines 527-546)
- [ ] `applyBodyBackground()` (lines 417-424)
- [ ] `updateLocation()` (lines 427-434)
- [ ] Related constants: `LOCATION_BACKGROUND_MAP` (lines 60-64)
- [ ] Related state: `terminalLocation`, `themeObserver`

**Class shape**:
```typescript
class ThemeManager {
  private location: TerminalLocation;
  private observer: MutationObserver | undefined;

  constructor(initialLocation: TerminalLocation);
  getTheme(): Record<string, string | undefined>;
  getMinimumContrastRatio(): number;
  applyToAll(terminals: Iterable<TerminalInstance>): void;
  applyBodyBackground(): void;
  updateLocation(location: TerminalLocation): void;
  startWatching(onThemeChange: () => void): void;
  dispose(): void;
}
```

**Why this pattern**: Theme reads from DOM (CSS variables), reacts to DOM mutations, and pushes updates to all terminals. The Observer pattern makes the data flow explicit: mutation -> rebuild -> apply. The Service encapsulates all theme state so `main.ts` doesn't own `terminalLocation` or `themeObserver` directly.

### 8.2 Extract BannerService (~43 LOC)

**Target**: `src/webview/ui/BannerService.ts`
**Pattern**: Presenter (thin UI service)

A pure UI presenter — takes data, creates DOM, manages dismiss lifecycle. No business logic, no state beyond the banners it creates. This is the simplest extraction and the lowest risk.

**Extract from `main.ts`**:
- [ ] `showErrorBanner()` (lines 558-590)
- [ ] `INFO_BANNER_DISMISS_MS` constant (line 551)

**Function shape**:
```typescript
function showBanner(container: HTMLElement, message: string, severity: "error" | "warn" | "info"): void;
```

**Why this pattern**: This is stateless DOM manipulation. No class needed — a single exported function with its constant is sufficient. VS Code similarly keeps notification rendering separate from notification logic.

### 8.3 Extract XtermFitService (~100 LOC)

**Target**: `src/webview/resize/XtermFitService.ts`
**Pattern**: Facade + Strategy (Adapter over xterm internals)

This module is a **Facade** — it hides the ugly reality of xterm's private `_core._renderService` API behind a clean `fitTerminal(instance)` interface. It is also a **Strategy** — the fit algorithm could be swapped (e.g., revert to `FitAddon.fit()`) without any other module knowing. VS Code uses the same principle: `getXtermScaledDimensions()` in `xtermTerminal.ts` centralizes all private xterm math.

**Extract from `main.ts`**:
- [ ] `fitTerminal()` (lines 660-701) — the only place that touches xterm `_core._renderService`

**Function shape**:
```typescript
function fitTerminal(terminal: Terminal, parentElement: HTMLElement): { cols: number; rows: number } | null;
```

**Rule**: This is the **only module** allowed to use xterm private APIs (`_core`, `_renderService`, `as any` casts). If xterm updates break internals, only this file needs fixing.

**Why this pattern**: Isolating unstable dependencies behind a stable interface is textbook Facade. The custom `fitTerminal()` already acts as a replacement Strategy for `FitAddon.fit()` — making that boundary explicit improves maintainability.

### 8.4 Extract ResizeCoordinator (~100 LOC)

**Target**: `src/webview/resize/ResizeCoordinator.ts`
**Pattern**: Coordinator + Policy object

The ResizeCoordinator is a **Coordinator** — it orchestrates the interaction between ResizeObserver events, debounce timers, visibility state, location inference, and the XtermFitService. It owns the resize **policy** (when to fit, when to defer, when to skip). VS Code's `TerminalResizeDebouncer` is the direct inspiration — a dedicated policy object that decides immediate vs deferred resize, separate from the terminal instance itself.

**Extract from `main.ts`**:
- [ ] `debouncedFit()` (lines 708-715)
- [ ] `fitAllTerminals()` (lines 721-742)
- [ ] `debouncedFitAllLeaves()` (lines 399-414)
- [ ] `setupResizeObserver()` (lines 748-770)
- [ ] `onViewShow()` (lines 776-800)
- [ ] `inferLocationFromSize()` (lines 119-121)
- [ ] Related state: `pendingResize`, `fitResizeTimeout`, `splitFitTimeout`, `resizeObserver`

**Class shape**:
```typescript
class ResizeCoordinator {
  private pendingResize: boolean;
  private fitTimeout: number | undefined;
  private splitFitTimeout: number | undefined;
  private observer: ResizeObserver | undefined;

  constructor(
    private fitService: XtermFitService,
    private themeManager: ThemeManager,
    private getState: () => { activeTabId, terminals, tabLayouts },
  );
  setup(container: HTMLElement): void;
  debouncedFit(): void;
  debouncedFitAllLeaves(tabId: string): void;
  onViewShow(): void;
  dispose(): void;
}
```

**Dependencies**: `XtermFitService` (for actual fit), `ThemeManager` (for location updates), state accessors (terminals, tabLayouts, activeTabId).

**Why this pattern**: Resize involves 4 concerns (observation, debouncing, visibility, fitting) that are currently scattered across 7 functions sharing global state. A Coordinator consolidates the policy decisions while delegating actual work to XtermFitService.

### 8.5 Extract WebviewStateStore (~100 LOC)

**Target**: `src/webview/state/WebviewStateStore.ts`
**Pattern**: Store (centralized state with named mutations)

A **Store** that owns all mutable UI state and exposes mutations through named methods. This replaces the current 16 scattered module-level `let` variables and 4 Maps that are mutated from 7+ different functions across 1400+ lines. The Store pattern (inspired by Redux/Vuex but much simpler) makes state transitions explicit, debuggable, and testable. VS Code's `TerminalService` follows a similar principle — services own state, UI reads from services.

**Extract from `main.ts`**:
- [ ] `persistLayoutState()` (lines 126-137)
- [ ] `restoreLayoutState()` (lines 140-173)
- [ ] State variables: `activeTabId`, `currentConfig`, `tabLayouts`, `tabActivePaneIds`, `resizeCleanups`
- [ ] `terminals` Map (or keep it in main and pass reference)

**Class shape**:
```typescript
class WebviewStateStore {
  readonly terminals: Map<string, TerminalInstance>;
  readonly tabLayouts: Map<string, SplitNode>;
  readonly tabActivePaneIds: Map<string, string>;
  readonly resizeCleanups: Map<string, (() => void)[]>;

  activeTabId: string | null;
  currentConfig: TerminalConfig;

  constructor(private vscode: VsCodeApi);
  setActiveTab(tabId: string | null): void;
  setLayout(tabId: string, layout: SplitNode): void;
  deleteLayout(tabId: string): void;
  setActivePaneId(tabId: string, paneId: string): void;
  getActivePaneId(tabId: string): string;
  persist(): void;
  restore(): Map<string, SplitNode>;
}
```

**Why this pattern**: The biggest testability blocker in `main.ts` is scattered mutable state. A Store consolidates mutations, enables reset for testing, and makes it possible to trace which operation changed what state.

### 8.6 Extract MessageRouter (~172 LOC)

**Target**: `src/webview/messaging/MessageRouter.ts`
**Pattern**: Message Router + Command Handler (dispatch table)

A **Message Router** with a typed dispatch table — one handler per message type. This replaces the current 172-line `switch` statement where some cases contain 30+ lines of inline business logic (e.g., `splitPaneCreated` at lines 1271-1309). Each handler becomes a named function that receives the message and a context object. VS Code's extension host uses a similar `ICommandHandler` registry pattern for command dispatch.

**Extract from `main.ts`**:
- [ ] `handleMessage()` switch statement (lines 1198-1363)
- [ ] Each case becomes a named handler function

**Shape**:
```typescript
interface MessageHandlers {
  onOutput(msg: OutputMessage): void;
  onExit(msg: ExitMessage): void;
  onTabCreated(msg: TabCreatedMessage): void;
  onTabRemoved(msg: TabRemovedMessage): void;
  onRestore(msg: RestoreMessage): void;
  onConfigUpdate(msg: ConfigUpdateMessage): void;
  onViewShow(): void;
  onSplitPane(msg: SplitPaneMessage): void;
  onSplitPaneCreated(msg: SplitPaneCreatedMessage): void;
  onCloseSplitPane(): void;
  onCloseSplitPaneById(msg: CloseSplitPaneByIdMessage): void;
  onSplitPaneAt(msg: SplitPaneAtMessage): void;
  onCtxClear(msg: CtxClearMessage): void;
  onError(msg: ErrorMessage): void;
}

function createMessageRouter(handlers: MessageHandlers): (msg: ExtensionToWebViewMessage) => void;
```

**Why this pattern**: The Router makes protocol drift visible during code review — adding a message type requires adding a handler. Inline logic is replaced by named functions that can be tested independently. The `init` message is handled separately in `main.ts` since it orchestrates bootstrap.

### 8.7 Reduce `main.ts` to Composition Root

**Pattern**: Facade / App Shell (Composition Root)

After all extractions, `main.ts` becomes a thin **Composition Root** (also called App Shell) — it creates all services, wires their dependencies, sets up DOM event listeners, and delegates everything else. VS Code's `TerminalViewPane` follows the same principle: it composes `TerminalService`, `TerminalTabbedView`, etc., but doesn't implement terminal logic itself.

After all extractions, `main.ts` should only contain:
- [ ] `bootstrap()` — create ThemeManager, ResizeCoordinator, StateStore, MessageRouter; wire DOM events; send `ready`
- [ ] `handleInit()` — create terminals from init message, set up resize observer
- [ ] `createTerminal()` — may stay here or move to a TerminalFactory (Phase 8 optional)
- [ ] `switchTab()`, `removeTerminal()` — orchestration that calls multiple services
- [ ] `updateTabBar()` — delegates to TabBarUtils

**Target**: < 300 LOC

**Why this pattern**: A Composition Root is the natural end-state of extracting concerns into services. It answers "where do I wire things together?" without becoming a God Object. The key rule: the root creates and connects components but contains no business logic itself.

---

## Phase 9 — Update Design Docs

### Goal

Bring all 9 design docs in sync with actual code. Currently 36 mismatches and 38 undocumented features.

**Reference**: `docs/refactor/webview-implementation-vs-design.md` — per-doc mismatch lists

### 9.1 Update message-protocol.md
- [ ] Add 9 undocumented message types (split pane + viewShow + ctxClear)
- [ ] Add `fontFamily` to `TerminalConfig`
- [ ] Update union type counts
- [ ] Add `tabId` to `AckMessage` (after Phase 6.1)
- [ ] Remove reference to non-existent `src/webview/utils/MessageHandler.ts`

### 9.2 Update xterm-integration.md
- [ ] Fix xterm version: v5 -> v6
- [ ] Remove lazy loading pattern (not implemented)
- [ ] Remove `allowProposedApi` claim
- [ ] Document WebGL as always-loaded (not on-demand)
- [ ] Remove addon cache pattern
- [ ] Document custom `fitTerminal()` replacing `FitAddon.fit()`
- [ ] Update file size estimate and structure

### 9.3 Update resize-handling.md
- [ ] Replace FitAddon.fit() pipeline with custom fitTerminal() using getBoundingClientRect()
- [ ] Fix debounce placement description
- [ ] Document split-pane resize system
- [ ] Remove non-existent `ResizeHandler` class and file path
- [ ] Document `inferLocationFromSize()` behavior

### 9.4 Update theme-integration.md
- [ ] Fix background resolution priority order
- [ ] Remove non-existent `ThemeManager` class (or update after Phase 8.1)
- [ ] Add 7 missing theme properties
- [ ] Document dynamic location inference
- [ ] Document `minimumContrastRatio` for high-contrast themes
- [ ] Fix default location parameter (`"panel"` -> `"sidebar"`)

### 9.5 Update keyboard-input.md
- [ ] Replace paste section with actual behavior (native xterm paste)
- [ ] Remove `enableCmdK` setting reference
- [ ] Add Escape selection clear, Cmd+Backspace line kill
- [ ] Mark `handlePaste()` as removed (after Phase 7.2)
- [ ] Fix file path

### 9.6 Update flow-initialization.md
- [ ] Remove pre-launch input queue (not implemented)
- [ ] Fix ResizeObserver timing (happens in handleInit, not bootstrap)
- [ ] Fix init message shape (no `sessionId` field)

### 9.7 Update flow-multi-tab.md
- [ ] Remove `stateUpdate` reconciliation (not implemented)
- [ ] Remove `maxTabs` / `_canCreateTerminal` (not implemented)
- [ ] Document "request new tab when last closed" behavior

### 9.8 Update output-buffering.md
- [ ] Document adaptive flush interval (4-16ms, not fixed 8ms)
- [ ] Document 1MB buffer overflow protection with FIFO eviction
- [ ] Document output pause/resume for hidden views
- [ ] Fix ack batching description (`if` not `while`)

### 9.9 Update error-handling.md
- [ ] Remove CWD validation (not implemented)
- [ ] Remove Output Channel logging (not implemented — uses console.*)
- [ ] Remove orphaned PTY cleanup on WebView communication failure
- [ ] Mark dead error classes as removed (after Phase 7.3)
- [ ] Document error banner UI system

---

## Phase 10 — Testing

### Goal

Add tests for the extracted modules and critical flows.

### 10.1 Unit tests for extracted modules
- [ ] ThemeManager: CSS variable reading, high-contrast detection, theme object building
- [ ] XtermFitService: dimension calculation, no-op when unchanged
- [ ] ResizeCoordinator: debounce behavior, pending resize flag
- [ ] WebviewStateStore: persist/restore, state mutations
- [ ] MessageRouter: dispatch by type, unknown message handling
- [ ] BannerService: DOM creation, auto-dismiss

### 10.2 Integration tests for critical flows
- [ ] Ack routing: background tab output + correct ack delivery
- [ ] Tab lifecycle: create -> switch -> close -> auto-create
- [ ] Split pane: split -> close -> restructure layout
- [ ] Config update: font change -> refit all terminals

---

## Priority Order

1. **Phase 6** (correctness bugs) — highest impact, lowest risk
2. **Phase 7** (dead code) — clean slate for refactoring
3. **Phase 8** (module extraction) — main refactoring work
4. **Phase 9** (doc updates) — can be done incrementally alongside Phase 8
5. **Phase 10** (testing) — validates the refactoring

## Success Criteria

- `src/webview/main.ts` < 300 LOC
- No xterm private API access outside `XtermFitService`
- All correctness bugs fixed
- Design docs match code
- Key flows have test coverage
