# Discovery: Add Tests for Extracted Webview Modules

## 1. Feature Summary

Add unit tests for 6 extracted webview modules (ThemeManager, XtermFitService, ResizeCoordinator, WebviewStateStore, MessageRouter, BannerService) and integration tests for 4 critical flows (ack routing, tab lifecycle, split pane, config update).

## 2. Workstreams Used / Skipped

| Workstream              | Used? | Justification |
| ----------------------- | ----- | ------------- |
| Memory Recall           | ⏭️    | No prior conversation history for this change |
| Architecture Snapshot   | ✅    | Mapped all 7 extracted modules, their interfaces, and dependencies |
| Internal Patterns       | ✅    | Studied 15 existing test files for patterns (jsdom, mocks, vi.fn) |
| External Research & Docs | ⏭️   | No external libs needed — vitest + jsdom already configured |
| Constraint Check        | ✅    | Identified DOM mocking, xterm mocking, VS Code API mocking needs |

## 3. Memory Recall

### Related Results

N/A — first conversation for this change.

### Key Findings

N/A

## 4. Architecture Snapshot

### Relevant Packages

| Package | Purpose | Key Files |
| ------- | ------- | --------- |
| `src/webview/theme/` | Theme resolution from CSS variables | `ThemeManager.ts` (185 LOC) |
| `src/webview/resize/` | Terminal fitting and resize coordination | `XtermFitService.ts` (62 LOC), `ResizeCoordinator.ts` (205 LOC) |
| `src/webview/state/` | Centralized webview state | `WebviewStateStore.ts` (158 LOC) |
| `src/webview/messaging/` | Typed message dispatch | `MessageRouter.ts` (115 LOC) |
| `src/webview/ui/` | Banner notifications | `BannerService.ts` (41 LOC) |
| `src/webview/flow/` | Output ack batching | `FlowControl.ts` (53 LOC) |
| `src/webview/terminal/` | Terminal creation factory | `TerminalFactory.ts` (325 LOC) |

### Entry Points

- Webview: `src/webview/main.ts` (composition root, 293 LOC)
- Tests: `src/**/*.test.ts` (vitest discovers colocated tests)

## 5. Internal Patterns

### Similar Implementations

| Feature | Location | Pattern Used |
| ------- | -------- | ------------ |
| InputHandler tests | `src/webview/InputHandler.test.ts` | Mock `TerminalLike` interface, `createMockTerminal()` factory |
| TabBar tests | `src/webview/TabBar.test.ts` | jsdom environment, `createMockDeps()`, DOM cleanup in beforeEach/afterEach |
| SplitContainer tests | `src/webview/SplitContainer.test.ts` | jsdom, mock `getBoundingClientRect`, pointer event simulation |
| SplitModel tests | `src/webview/SplitModel.test.ts` | Pure functions, no DOM needed |
| SessionManager tests | `src/session/SessionManager.test.ts` | `vi.mock()` for deps, fake timers, factory functions |

### Reusable Utilities

- DOM mocking: `// @vitest-environment jsdom` pragma per file
- VS Code API mock: `src/test/__mocks__/vscode.ts` (alias in vitest.config.mts)
- Timer mocking: `vi.useFakeTimers()` / `vi.useRealTimers()`
- Factory pattern: `createMock*()` functions per test file

## 6. Constraint Check

- **Dependencies**: No new runtime deps. `vitest` and `jsdom` already configured.
- **Build Requirements**: Tests must pass with `pnpm run test:unit`.
- **Coverage**: Current coverage config excludes `src/webview/**`. For new webview tests to be meaningful in CI, this exclusion should stay (webview coverage is a stretch goal, not a gate).

## 7. External Research & Documentation

N/A — all tools already in place.

## 8. Gap Analysis (Synthesized)

| Component | Have | Need | Gap Size |
| --------- | ---- | ---- | -------- |
| ThemeManager tests | None | CSS variable reading, high-contrast, theme building | New |
| XtermFitService tests | None | Dimension calc, no-op when unchanged, null guards | New |
| ResizeCoordinator tests | None | Debounce, pending resize, location inference | New |
| WebviewStateStore tests | None | Persist/restore, state mutations, config defaults | New |
| MessageRouter tests | None | Dispatch by type, unknown message, init exclusion | New |
| BannerService tests | None | DOM creation, severity classes, auto-dismiss | New |
| Ack routing integration | None | Background tab ack delivery to correct session | New |
| Tab lifecycle integration | None | Create → switch → close → auto-create flow | New |
| Split pane integration | None | Split → close → restructure layout | New |
| Config update integration | None | Font change → refit all terminals | New |
| xterm mock helper | None | Reusable mock Terminal for webview tests | New |

## 9. Key Decisions

| Decision | Options Considered | Chosen | Rationale |
| -------- | ------------------ | ------ | --------- |
| DOM environment | jsdom vs happy-dom | jsdom | Already used by TabBar/SplitContainer tests; proven to work |
| xterm mock approach | Full mock class vs minimal interface mock | Minimal interface mock | Modules use `Terminal` type but only access `.options`, `.rows`, `.cols`, `._core`; mock only what's needed |
| Test file location | Colocated vs `__tests__/` dir | Colocated | Matches existing pattern — `*.test.ts` next to source |
| Integration test scope | Full main.ts bootstrap vs isolated wiring | Isolated wiring | Testing module interactions directly avoids brittle DOM setup from main.ts |
| Shared mock helper | Per-file mocks vs shared helper | Shared helper file | 6+ test files need same xterm mock; DRY with `src/webview/test-utils/` |

## 10. Options Comparison

N/A — single viable approach.

## 11. Risks & Constraints

- **Must**: Tests must not depend on real xterm.js Terminal (not available in Node/jsdom)
- **Must**: Tests must pass in CI with `pnpm run test:unit`
- **Should**: Follow existing test patterns (factory functions, beforeEach cleanup)
- **Should**: Keep test files colocated with source modules

## 12. Open Questions

- [x] Should we create a shared xterm mock helper? → Yes, in `src/webview/test-utils/mockTerminal.ts`
