# Change: Add Tests for Extracted Webview Modules

## Why

Phase 8 extracted 6 modules from `main.ts` but they have zero test coverage. Phase 10 in `docs/PLAN.md` requires unit tests for each module and integration tests for 4 critical flows to validate the refactoring.

## Appetite
<!-- S (≤1d) | M (≤3d) | L (≤2w) -->
M (≤3d)

## Scope
- **In**: Unit tests for ThemeManager, XtermFitService, ResizeCoordinator, WebviewStateStore, MessageRouter, BannerService. Integration tests for ack routing, tab lifecycle, split pane, config update flows. Shared xterm mock helper.
- **Out**: TerminalFactory tests (complex; depends on real addon loading). Modifying module source code. Coverage threshold changes.
- **Cut list**: Integration tests for split pane and config update flows (can follow up if over budget)

## What Changes
- New test files for each extracted module (6 files)
- New integration test file for critical flows (1 file)
- New shared test utility for xterm Terminal mocking (1 file)

## Capabilities
- **New**: N/A (test-only change)
- **Modified**: N/A

## UI Impact & E2E
- **User-visible UI behavior affected?** NO
- **E2E required?** NOT REQUIRED
- **Justification**: Test-only change. No runtime code modified. No UI behavior affected.
- **Target user journeys** (if REQUIRED): N/A

## Risk Level
LOW — test-only change, no runtime code modifications, well-established patterns to follow

## Impact
- Affected specs: None
- Affected code: New test files only — `src/webview/**/*.test.ts`, `src/webview/test-utils/mockTerminal.ts`

## Open Questions
- [x] Shared xterm mock needed? → Yes
