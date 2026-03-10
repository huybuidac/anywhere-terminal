# Change: Reduce main.ts to Composition Root

## Why
`src/webview/main.ts` is 1037 LOC with terminal creation, split-tree rendering, tab orchestration, config propagation, and flow control all inlined. The Phase 8.7 target is <300 LOC as a thin composition root that creates services, wires dependencies, and delegates everything else.

## Appetite
M (2-3 days)

## Scope
- **In**: Extract TerminalFactory, SplitTreeRenderer, and FlowControl modules from main.ts; thin down remaining orchestration functions
- **Out**: No new features, no behavioral changes, no changes to message protocol or extension host
- **Cut list**: If over budget, keep `applyConfig` inline (41 LOC savings is not critical)

## What Changes
- Extract `createTerminal()`, `attachInputHandler()`, `getClipboardProvider()`, `getFontFamily()`, `fitTerminal()`, `applyConfig()`, WebGL logic into `src/webview/terminal/TerminalFactory.ts`
- Extract `_renderTabSplitTree()`, `showTabContainer()`, `updateActivePaneVisual()`, `closeSplitPaneById()`, and `onSplitPaneCreated` handler body into `src/webview/split/SplitTreeRenderer.ts`
- Extract `ackChars()` and `unsentAckCharsMap` into `src/webview/flow/FlowControl.ts`
- Move `updateTabBar()` data-assembly loop into `TabBarUtils.buildTabBarData()`
- Slim all routeMessage handler bodies to ≤5 LOC delegates
- Reduce `switchTab()`, `removeTerminal()` by delegating to extracted modules
- main.ts becomes: imports + state init + service wiring + thin orchestration + bootstrap

## Capabilities
- **Modified**: `specs/xterm-init/spec.md` (terminal creation moves to TerminalFactory)
- **Modified**: `specs/split-container-ui/spec.md` (rendering moves to SplitTreeRenderer)

## UI Impact & E2E
- **User-visible UI behavior affected?** NO
- **E2E required?** NOT REQUIRED
- **Justification**: Pure internal refactoring — no behavioral changes. All functions maintain identical signatures and behavior, just relocated to separate modules.

## Risk Level
LOW — follows established extraction patterns from Phases 8.1-8.6, no behavioral changes, pure file reorganization with build verification at each step.

## Impact
- Affected specs: `specs/xterm-init/spec.md`, `specs/split-container-ui/spec.md` (implementation location changes only)
- Affected code: `src/webview/main.ts` (primary), `src/webview/TabBarUtils.ts` (modified), new files in `src/webview/terminal/`, `src/webview/split/`, `src/webview/flow/`

## Open Questions
- [x] Keep `applyConfig` inline or extract? Decision: Extract to TerminalFactory as `applyConfigToAll()` — it's tightly coupled with terminal options.
