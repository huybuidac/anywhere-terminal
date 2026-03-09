# Change: Extract ResizeCoordinator, WebviewStateStore, and MessageRouter from main.ts

## Why
`main.ts` is 1269 LOC after Cycle 2 extractions. Phases 8.4-8.6 extract the three cross-cutting modules (resize coordination, state management, message routing) that account for ~370 LOC and are the last major extractions before `main.ts` becomes a composition root.

## Appetite
M (<=3d) — three extractions with cross-cutting dependencies that require careful wiring

## Scope
- **In**: Extract ResizeCoordinator (8.4), WebviewStateStore (8.5), MessageRouter (8.6) from `main.ts`
- **Out**: Composition root (8.7), TerminalFactory/Registry, SplitLayoutController, TabBarController — later phases
- **Cut list**: MessageRouter handler extraction into separate file (handlers can stay inline in createMessageRouter if over budget)

## What Changes
- New file `src/webview/resize/ResizeCoordinator.ts` — class coordinating resize observation, debouncing, visibility, and fit delegation
- New file `src/webview/state/WebviewStateStore.ts` — centralized store for webview mutable state (terminals, layouts, active tab, config)
- New file `src/webview/messaging/MessageRouter.ts` — typed dispatch table replacing the 172-line switch statement
- Modified `src/webview/main.ts` — imports and delegates to the three new modules

## Capabilities
- **New**: None — pure refactor, no new behavior
- **Modified**: None — no spec changes

## UI Impact & E2E
- **User-visible UI behavior affected?** NO
- **E2E required?** NOT REQUIRED — pure refactor, behavior-preserving extraction
- **Justification**: All three modules are extract-and-delegate refactors; no logic changes, no new features, no API surface changes

## Risk Level
MEDIUM — cross-cutting extractions with shared state; ResizeCoordinator and MessageRouter both depend on state that will move to WebviewStateStore; requires careful dependency ordering

## Impact
- Affected specs: None
- Affected code: `src/webview/main.ts`, 3 new files in `src/webview/{resize,state,messaging}/`

## Open Questions
- None
