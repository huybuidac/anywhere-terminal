---
labels: [webview, refactor, architecture, dependency-injection]
source: cyberk-flow/changes/260309-0930-extract-complex-modules
summary: When extracting modules that need shared state, inject a getState() callback returning a minimal interface instead of passing the store directly. Prevents tight coupling and stale closures.
---
# State accessor callback for cross-cutting module extraction
**Date**: 2026-03-09

## TL;DR
- Extracted modules receive state via `getState: () => MinimalInterface` callback, not a direct store reference
- The callback returns a fresh snapshot each call, preventing stale closure bugs
- The minimal interface keeps the module decoupled from the store's full API surface

## Context
During the "extract complex modules" cycle (Phases 8.4-8.6), ResizeCoordinator needed access to shared state (`activeTabId`, `terminals`, `tabLayouts`) owned by WebviewStateStore. Direct dependency on the store would couple ResizeCoordinator to the store's full interface and make testing harder.

## Pattern
When an extracted module needs access to shared state owned by another module:

1. **Define a minimal read-only interface** for exactly the state the module needs
2. **Accept a `getState()` callback** in the constructor that returns this interface
3. **Call `getState()` at point-of-use**, not at construction time — ensures fresh data
4. **The composition root (main.ts) bridges** by creating the callback closure over the store

This extends the "accept library types" pattern (from extract-simple-modules) to handle cross-cutting state dependencies.

### Concrete example:

```typescript
// ResizeCoordinator defines its own minimal state needs:
interface ResizeState {
  activeTabId: string | null;
  terminals: Map<string, FittableInstance>;
  tabLayouts: Map<string, SplitNode>;
}

// Constructor accepts callback, not store:
constructor(
  fitTerminal: (instance: FittableInstance) => void,
  getState: () => ResizeState,
  onLocationChange: (location: TerminalLocation) => void,
)

// main.ts wires the callback:
const resizeCoordinator = new ResizeCoordinator(
  fitTerminal,
  () => ({
    activeTabId: store.activeTabId,
    terminals: store.terminals,
    tabLayouts: store.tabLayouts,
  }),
  (location) => updateLocation(location),
);
```

Excerpt (as of 2026-03-09; may drift):

## Evidence

### Anchors
- `src/webview/resize/ResizeCoordinator.ts` → `ResizeState` interface + constructor — defines minimal state needs
  - grep: `"getState: () => ResizeState"`
- `src/webview/main.ts` → `new ResizeCoordinator(` — wires the callback closure
  - grep: `"new ResizeCoordinator("`
- `src/webview/state/WebviewStateStore.ts` → `WebviewStateStore` class — the actual store being bridged
  - grep: `"export class WebviewStateStore"`

## When to apply
- When extracting a module that reads shared state owned by another module
- When a class constructor would otherwise accept a full store/manager just to read 2-3 properties
- When you see stale closure bugs from capturing store references at construction time
