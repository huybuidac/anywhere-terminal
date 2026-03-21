# Webview Refactor Plan

## Goal

Reduce `src/webview/main.ts` into a thin composition root and move behavior into explicit modules with stable contracts.

## Refactor Principles

- Preserve runtime behavior first.
- Separate state, rendering, and side effects.
- Make protocol handling explicit and typed.
- Keep DOM-manipulation boundaries small.
- Isolate xterm-private APIs in one place.

## Target Architecture

### 1. Composition Root

- `src/webview/main.ts`
- Responsibility: bootstrap only, create services/controllers, wire listeners, call `start()`.

### 2. Messaging Layer

- `src/webview/messaging/WebviewMessageRouter.ts`
- `src/webview/messaging/WebviewMessageHandlers.ts`

Responsibility:

- parse and dispatch `ExtensionToWebViewMessage`
- keep one handler per message type
- make protocol drift visible during code review

Pattern:

- Message Router
- Command Handler

### 3. State Layer

- `src/webview/state/WebviewStateStore.ts`
- `src/webview/state/LayoutPersistence.ts`

Responsibility:

- active tab
- terminal location
- split layouts
- active pane per tab
- persisted view state

Pattern:

- Store
- Reducer-style state transitions
- Repository for persisted layout state

### 4. Terminal Layer

- `src/webview/terminal/TerminalFactory.ts`
- `src/webview/terminal/TerminalRegistry.ts`
- `src/webview/terminal/TerminalLifecycle.ts`

Responsibility:

- create/dispose terminal instances
- register addons
- wire title change, input, resize
- expose lookup helpers

Pattern:

- Factory
- Registry
- Lifecycle Manager

### 5. Resize Layer

- `src/webview/resize/ResizeCoordinator.ts`
- `src/webview/resize/XtermFitService.ts`

Responsibility:

- observe container changes
- fit active tabs and split leaves
- hide all xterm-private access in one module
- own deferred resize and view-show logic

Pattern:

- Strategy
- Facade

Recommended note:

- `XtermFitService` is the only place allowed to touch `_core` or `_renderService`.

### 6. Theme Layer

- `src/webview/theme/ThemeManager.ts`

Responsibility:

- resolve theme from CSS variables
- apply to all registered terminals
- watch body class changes
- manage location-aware background behavior

Pattern:

- Observer
- Service

### 7. Split Layout Layer

- `src/webview/layout/SplitLayoutController.ts`
- `src/webview/layout/SplitFocusController.ts`

Responsibility:

- render tab split trees
- attach resize handles
- handle active pane focus and visual state
- close/split pane orchestration

Pattern:

- Controller
- Composite (already present in `SplitNode` tree)

### 8. UI Layer

- `src/webview/ui/TabBarController.ts`
- `src/webview/ui/BannerService.ts`

Responsibility:

- tab bar rendering and events
- error/info banner rendering

Pattern:

- Presenter/Controller

## Proposed Extraction Sequence

## Phase 0: Stabilize Contracts

- Update protocol docs to match current messages.
- Add missing comments/tests around split-pane lifecycle.
- Decide the canonical ack payload.

Deliverable:

- docs and types aligned before behavior-moving refactors.

## Phase 1: Fix Correctness Before Structure

- Change ack to include session identity.
- Route provider-side ack to the correct `SessionManager` session.
- Add tests for background-tab output + ack.

Deliverable:

- flow control becomes correct under multi-tab and split output.

## Phase 2: Extract Pure or Low-Risk Modules

- move theme logic into `ThemeManager`
- move banner logic into `BannerService`
- move persistence into `LayoutPersistence`
- move message dispatch into `WebviewMessageRouter`

Deliverable:

- `main.ts` shrinks with minimal behavior risk.

## Phase 3: Extract Terminal and Resize Services

- introduce `TerminalFactory`
- introduce `TerminalRegistry`
- introduce `ResizeCoordinator` and `XtermFitService`

Deliverable:

- terminal creation/disposal and resize behavior become testable in isolation.

## Phase 4: Extract Split/Tab Orchestration

- introduce `SplitLayoutController`
- introduce `TabBarController`
- move close/switch/split flows out of `main.ts`

Deliverable:

- `main.ts` becomes a small app shell.

## Phase 5: Optional Cleanup

- remove unused `handlePaste()` if native paste remains the chosen design
- re-evaluate whether `FitAddon` should remain stored on `TerminalInstance`
- decide whether editor webviews should support the same split command surface as sidebar/panel views

## Recommended Design Patterns

### Must use

- Facade: one `WebviewApp` or `WebviewRuntime` coordinates subsystems.
- Message Router: one dispatch table for extension-to-webview messages.
- Factory: create fully wired `TerminalInstance` objects.
- Registry: central access to terminal instances.
- Observer: theme changes, resize changes, visibility changes.
- Composite: keep `SplitNode` tree as the core layout model.

### Good fits

- Strategy: alternate fit/resize implementations without leaking xterm internals everywhere.
- Command: model user actions such as `switchTab`, `closePane`, `splitPane`, `clearPane`.
- Adapter: wrap VS Code `postMessage` and webview state APIs behind small interfaces.

### Avoid overusing

- Deep inheritance hierarchies
- Generic event buses for everything
- Premature class extraction for already-pure helpers

## Suggested File Ownership Map

- `main.ts`: bootstrap only
- `WebviewApp`: compose services/controllers
- `WebviewStateStore`: source of UI state
- `WebviewMessageRouter`: inbound protocol
- `TerminalRegistry`: terminal lookup/disposal
- `TerminalFactory`: terminal creation
- `ResizeCoordinator`: resize lifecycle
- `ThemeManager`: theme lifecycle
- `SplitLayoutController`: split DOM + focus
- `TabBarController`: tab UI behavior
- `BannerService`: non-terminal notifications

## Testing Plan

- unit tests for message routing and state transitions
- unit tests for ack routing by session id
- unit tests for split layout persistence restore/prune behavior
- integration tests for tab switch + resize + split-pane focus
- regression tests for hidden-tab output and process exit behavior

## Success Criteria

- `src/webview/main.ts` becomes less than 250 LOC.
- No xterm private API access outside `XtermFitService`.
- Protocol docs and `src/types/messages.ts` match exactly.
- Background output and ack handling are deterministic.
- Split, tab, theme, and resize behaviors remain unchanged from the user's perspective.
