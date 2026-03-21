---
labels: [webview, refactor, architecture, dependency-injection]
source: cyberk-flow/changes/reduce-main-composition-root
summary: When an extracted module mutates shared state extensively (TerminalFactory, SplitTreeRenderer), pass the store directly via deps object. Reserve getState() callbacks for modules with read-only cross-cutting state needs (ResizeCoordinator).
---
# Direct store injection for tightly-coupled module extraction
**Date**: 2026-03-09

## TL;DR
- Pass the store directly when the extracted module reads AND writes many store properties (terminals, tabLayouts, tabActivePaneIds, resizeCleanups)
- Use getState() callback pattern (from state-accessor-callback knowledge) when the module only reads a few properties
- Both patterns coexist — choose based on coupling surface area

## Context
Phase 8.7 extracted TerminalFactory and SplitTreeRenderer from main.ts. Unlike ResizeCoordinator (Phase 8.4), which reads 3 state properties via a `getState()` callback, these modules heavily mutate store state — TerminalFactory writes `store.terminals`, `store.tabLayouts`, `store.tabActivePaneIds`; SplitTreeRenderer writes `store.tabLayouts`, `store.resizeCleanups`, reads `store.terminals` and calls `store.persist()`.

Wrapping 6+ state mutations in a callback interface would create a verbose, brittle abstraction layer with no practical benefit — the modules are inherently tightly coupled to the store's shape.

## Pattern
Choose the injection strategy based on coupling surface:

| Coupling | Strategy | Example |
|----------|----------|---------|
| Read-only, 2-3 properties | `getState()` callback returning minimal interface | ResizeCoordinator |
| Read+write, 4+ properties | Direct store reference via deps object | TerminalFactory, SplitTreeRenderer |
| No state, only actions | Function callbacks (`postMessage`, `onTabBarUpdate`) | FlowControl |

The deps object pattern groups all dependencies into a single typed interface:

```typescript
export interface TerminalFactoryDeps {
  themeManager: ThemeManager;
  store: WebviewStateStore;
  postMessage: (msg: unknown) => void;
  onTabBarUpdate: () => void;
  getIsComposing: () => boolean;
}
```

## Evidence

### Anchors
- `src/webview/terminal/TerminalFactory.ts` → `TerminalFactoryDeps` interface — direct store injection
  - grep: `"interface TerminalFactoryDeps"`
- `src/webview/split/SplitTreeRenderer.ts` → `SplitTreeRendererDeps` interface — direct store injection
  - grep: `"interface SplitTreeRendererDeps"`
- `src/webview/resize/ResizeCoordinator.ts` → `ResizeState` interface — callback pattern (contrast)
  - grep: `"getState: () => ResizeState"`
- `src/webview/flow/FlowControl.ts` → constructor — function-only injection (simplest case)
  - grep: `"constructor(postMessage: (msg: unknown)"`

## When to apply
- When extracting a module from main.ts that reads AND writes 4+ store properties
- When a getState() callback interface would have more than 3-4 properties — switch to direct store injection
- When the module calls store.persist() or mutates Maps on the store
