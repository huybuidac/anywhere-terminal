# VS Code Terminal Patterns We Can Reuse

## Scope

Local VS Code source reviewed from `../vscode`:

- `src/vs/workbench/contrib/terminal/browser/terminalInstance.ts`
- `src/vs/workbench/contrib/terminal/browser/xterm/xtermTerminal.ts`
- `src/vs/workbench/contrib/terminal/browser/terminalResizeDebouncer.ts`
- `src/vs/workbench/contrib/terminal/browser/terminalTabbedView.ts`
- `src/vs/workbench/contrib/terminal/browser/terminalView.ts`
- `src/vs/workbench/contrib/terminal/browser/terminalService.ts`
- `src/vs/workbench/contrib/terminal/browser/terminalInstanceService.ts`
- `src/vs/workbench/contrib/terminal/browser/xterm/xtermAddonImporter.ts`

## Short Answer

VS Code does not put everything into one terminal entry file.

They split responsibilities very clearly:

- service/orchestration layer
- terminal instance lifecycle layer
- xterm wrapper layer
- resize policy layer
- view/tab UI layer
- addon-loading layer

That structure is directly useful for refactoring `src/webview/main.ts`.

## Main Patterns VS Code Applies

## 1. Orchestrator vs xterm wrapper separation

### What VS Code does

- `TerminalService` is the high-level orchestrator for terminal instances, active state, lifecycle, and host coordination.
- `TerminalInstanceService` is a factory/service entry point for creating instances.
- `TerminalInstance` owns one terminal instance lifecycle and process-facing coordination.
- `XtermTerminal` wraps raw xterm and keeps xterm-specific behavior isolated.

### Why it matters

- `TerminalInstance` does not dump raw xterm details everywhere.
- `XtermTerminal` does not become the app controller.
- UI containers like `TerminalViewPane` and `TerminalTabbedView` stay focused on view concerns.

### What we should copy

For this repo, split current `src/webview/main.ts` into:

- `WebviewApp` or `WebviewRuntime`: top-level composition
- `TerminalController`: lifecycle and command orchestration
- `XtermTerminalAdapter` or `TerminalFactory`: xterm-specific init/config/addons
- `TabLayoutController`: tab + split-pane DOM behavior

## 2. Explicit lifecycle ownership with `Disposable`

### What VS Code does

- Nearly every important class extends `Disposable`.
- Subscriptions and child resources are registered once and cleaned up centrally.
- Disposal order is deliberate: widget manager, scrollbars, xterm, process manager, then superclass cleanup in `TerminalInstance.dispose()`.

### Why it matters

- Cleanup is predictable.
- Long-lived UI objects do not leak listeners.
- Asynchronous paths check whether the object is already disposed.

### What we should copy

- Introduce one disposable-style ownership model in the webview layer.
- Each extracted module should own and clean its own listeners.
- `main.ts` should stop manually tracking unrelated cleanup arrays/maps for multiple concerns.

## 3. Event-driven architecture, not direct cross-calls everywhere

### What VS Code does

- `Emitter`-based events are everywhere: focus, selection, title, dimensions, active instance, capability changes, process readiness.
- Higher-level services subscribe to events from lower-level objects instead of poking internals constantly.
- `TerminalService` exposes aggregated events like `onAnyInstanceData`, `onAnyInstanceTitleChange`, `onAnyInstanceSelectionChange`.

### Why it matters

- Data flow is explicit.
- UI and lifecycle code stay loosely coupled.
- Cross-cutting features can subscribe without modifying core logic heavily.

### What we should copy

- Replace some direct calls in `main.ts` with internal events:
  - active tab changed
  - active pane changed
  - split layout changed
  - terminal created/disposed
  - terminal title changed
  - resize requested
  - theme changed

This is especially useful for tab bar refresh, persistence, and focus synchronization.

## 4. A dedicated resize policy object

### What VS Code does

- `TerminalResizeDebouncer` is a focused policy object.
- It knows when to resize immediately vs debounce.
- It treats horizontal and vertical resize differently.
- It defers hidden-terminal resize work to idle callbacks.

Key details:

- immediate resize when explicitly requested or buffer is small
- debounce starts only for larger buffers
- rows can be updated independently because vertical resize is cheaper
- hidden terminals are resized lazily

### Why it matters

- Resize is treated as a performance policy, not a dumb utility.
- Resize complexity does not leak into the main controller.

### What we should copy

We already have resize complexity in `src/webview/main.ts`, but it is mixed with many other concerns.

Extract:

- `ResizeCoordinator`
- `TerminalResizePolicy`
- `XtermFitService`

And adopt these ideas:

- separate policy from raw resize action
- hidden tabs/panes can use deferred fitting
- horizontal vs vertical resizing can be handled differently if profiling says it helps

## 5. Keep xterm internals behind one boundary

### What VS Code does

- `XtermTerminal` is the one class that wraps raw xterm behavior.
- xterm configuration, addon loading, theme translation, GPU decisions, and focus hooks live there.
- `getXtermScaledDimensions()` centralizes size math.

### Why it matters

- Private or fragile xterm behavior is isolated.
- The rest of the app depends on a stable adapter.

### What we should copy

Our current private xterm usage in `fitTerminal()` should move behind a single module.

Rule:

- only `XtermFitService` may touch `_core`, `_renderService`, or xterm-specific sizing details.

## 6. Thin view layer over services/controllers

### What VS Code does

- `TerminalViewPane` manages view creation, visibility, and layout integration.
- `TerminalTabbedView` manages tab list and terminal container layout.
- Neither class tries to also be the xterm wrapper or process manager.

### Why it matters

- UI code stays replaceable.
- View concerns are easier to test and reason about.

### What we should copy

Split our current webview UI into:

- `TabBarController`
- `SplitLayoutController`
- `BannerService`

And keep terminal object creation elsewhere.

## 7. Lazy addon loading and capability-based enhancement

### What VS Code does

- `XtermAddonImporter` loads addons lazily and caches constructors.
- `XtermTerminal` always loads core addons, but optional addons are activated only when needed.
- Some behavior reacts to capabilities appearing later.

### Why it matters

- startup cost stays lower
- optional features stay modular
- addon code is not tangled with the main constructor too much

### What we should copy

- Keep `FitAddon`, `WebLinksAddon`, `WebglAddon` decisions inside a factory/adapter.
- Consider lazy-loading or conditional-loading WebGL and optional future addons.
- Model optional features as capabilities or flags, not hardcoded side effects in `main.ts`.

## 8. Config and theme updates are centralized per concern

### What VS Code does

- `XtermTerminal.updateConfig()` applies xterm runtime option updates.
- `XtermTerminal.getXtermTheme()` translates VS Code theme tokens to xterm theme.
- `XtermTerminal._updateTheme()` updates only theme.
- `TerminalViewPane` separately handles shell-integration-related container classes.

### Why it matters

- Config update and theme update are related but not the same concern.
- Each layer updates only what it owns.

### What we should copy

Our code should separate:

- config persistence/update logic
- xterm option application
- body/background theme application
- split-pane visual state styling

Right now they are too interleaved in `main.ts`.

## 9. State and UI are synchronized through explicit services, not ad hoc maps alone

### What VS Code does

- active instance, active group, background terminals, detached terminals, and restored terminals are tracked at service level
- tab UI reads from service state and reacts to service events

### Why it matters

- state mutations are easier to follow
- UI does not become the source of truth

### What we should copy

Today we have useful maps like:

- `terminals`
- `tabLayouts`
- `tabActivePaneIds`

But they are effectively unmanaged global state.

Refactor toward a dedicated `WebviewStateStore` so that:

- mutations happen through named actions
- persistence hooks are centralized
- tab bar and split view render from state, not scattered mutations

## 10. Visibility matters as a first-class concept

### What VS Code does

- terminal visibility is tracked explicitly
- hidden terminals can defer heavy work
- view body visibility and terminal group visibility are separate concerns

### Why it matters

- avoids doing expensive resize/render work when offscreen
- reduces hidden-state bugs

### What we should copy

- formalize visible/hidden tab and pane behavior
- let resize/focus logic consume a single visibility API
- stop mixing `activeTabId`, DOM display state, and pending resize flags in multiple places

## Patterns Most Applicable to This Repo

## High value to adopt immediately

### Facade / App Shell

- Create `WebviewApp` as the composition root.
- `main.ts` only bootstraps and wires DOM events.

### Factory

- Create `TerminalFactory` for xterm instance creation, addon loading, and wiring.

### Registry

- Create `TerminalRegistry` for lookup, add/remove, active-pane retrieval, and safe disposal.

### Message Router

- Create `WebviewMessageRouter` with one handler per message type.

### Observer

- Use internal events for tab/pane/theme/layout changes.

### Strategy

- Use a `ResizeStrategy`/`FitStrategy` boundary so xterm-private sizing logic is isolated.

### Composite

- Keep `SplitNode` as the layout tree model.
- Add a controller above it rather than bloating the tree helpers.

## Lower value or avoid copying blindly

- Full DI container pattern from VS Code is overkill here.
- Their context-key system is powerful but probably too heavy for this extension.
- Their service graph is much larger because they support panel/editor/remote/persistence/backends at IDE scale.

## Concrete Refactor Guidance for `anywhere-terminal`

## Recommended module map inspired by VS Code

- `src/webview/main.ts`: bootstrap only
- `src/webview/app/WebviewApp.ts`: compose the webview runtime
- `src/webview/state/WebviewStateStore.ts`: active tab, active pane, layouts, persisted state
- `src/webview/messaging/WebviewMessageRouter.ts`: extension-to-webview dispatch
- `src/webview/terminal/TerminalFactory.ts`: create configured xterm instances
- `src/webview/terminal/TerminalRegistry.ts`: register/lookup/dispose terminals
- `src/webview/resize/ResizeCoordinator.ts`: observer + deferred resize policy
- `src/webview/resize/XtermFitService.ts`: the only xterm-private fitting code
- `src/webview/theme/ThemeManager.ts`: theme + background updates
- `src/webview/layout/SplitLayoutController.ts`: split tree rendering and pane focus
- `src/webview/ui/TabBarController.ts`: tab bar rendering/events
- `src/webview/ui/BannerService.ts`: webview notifications

## Best lessons from VS Code for our current pain points

### For `main.ts` being too large

Most relevant lesson:

- separate orchestration, instance lifecycle, and xterm adapter into different classes.

### For resize complexity

Most relevant lesson:

- create a dedicated resize policy object, not just a debounce helper.

### For theme/config drift

Most relevant lesson:

- keep `updateConfig()` and `updateTheme()` separate and owned by the xterm wrapper/theme manager.

### For split/tab behavior

Most relevant lesson:

- keep view/layout logic in a view controller layer, not in the terminal instance layer.

## Recommendation

We should not copy VS Code's whole architecture.

We should copy these ideas:

- strict separation of controller vs xterm wrapper vs UI
- disposable ownership
- event-driven coordination
- dedicated resize policy module
- isolated xterm-private boundary
- state store as the single source of UI truth

That is the cleanest path to refactor `src/webview/main.ts` without overengineering the extension.
