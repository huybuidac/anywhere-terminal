# Change: Extract ThemeManager, BannerService, and XtermFitService from main.ts

## Why
`main.ts` is 1478 LOC with 18+ responsibilities. Extracting the three simplest, most independent modules (theme, banner, fit) reduces it by ~270 LOC and establishes the extraction pattern for later phases without any behavioral risk.

## Appetite
S (<=1d) — three independent extractions with no cross-dependencies

## Scope
- **In**: Extract ThemeManager (8.1), BannerService (8.2), XtermFitService (8.3) from `main.ts`
- **Out**: ResizeCoordinator (8.4), WebviewStateStore (8.5), MessageRouter (8.6), composition root (8.7) — those are later phases
- **Cut list**: None — all three extractions are straightforward move-and-wrap

## What Changes
- New file `src/webview/theme/ThemeManager.ts` — class encapsulating theme resolution, MutationObserver, location-aware background
- New file `src/webview/ui/BannerService.ts` — standalone function for error/info banner DOM creation
- New file `src/webview/resize/XtermFitService.ts` — standalone function isolating all xterm `_core._renderService` access
- Modified `src/webview/main.ts` — imports and delegates to the three new modules instead of inline implementations

## Capabilities
- **New**: None — pure refactor, no new behavior
- **Modified**: None — no spec changes

## UI Impact & E2E
- **User-visible UI behavior affected?** NO
- **E2E required?** NOT REQUIRED — pure refactor, behavior-preserving extraction
- **Justification**: All three modules are move-only refactors; no logic changes, no new features, no API surface changes

## Risk Level
LOW — move-and-wrap extraction with no logic changes; existing patterns in codebase (InputHandler, SplitModel, TabBarUtils)

## Impact
- Affected specs: None
- Affected code: `src/webview/main.ts`, 3 new files in `src/webview/{theme,ui,resize}/`

## Open Questions
- None
