# Discovery: add-unit-tests

## Workstreams Used/Skipped

| # | Workstream | Status | Justification |
|---|---|---|---|
| 1 | Memory Recall | Used | Searched for test-related knowledge, found design docs and past decisions |
| 2 | Architecture Snapshot | Used | Read all source files to inventory testable logic |
| 3 | Internal Patterns | Used | Examined existing test file (`extension.test.ts`) and test config |
| 4 | External Research | Skipped | Standard unit testing — no novel patterns needed |
| 5 | Documentation | Skipped | No new external libs beyond test framework |
| 6 | Constraint Check | Used | Reviewed `package.json`, `tsconfig.json` for build constraints |

## Key Findings

### Current Test State
- **1 test file** exists: `src/test/extension.test.ts` — placeholder sample (2 trivial assertions)
- **Test framework**: Mocha + `@vscode/test-cli` + `@vscode/test-electron` (VS Code integration tests only)
- **No unit test framework** configured — existing setup requires full VS Code runtime
- **No mocking library** installed
- **No test config files** (`.mocharc`, vitest.config, etc.)

### Testable Logic Inventory

| File | Functions/Methods | Dependencies | Testability |
|---|---|---|---|
| `src/pty/PtyManager.ts` | `detectShell`, `validateShell`, `buildEnvironment`, `resolveWorkingDirectory`, `loadNodePty`, `getShellArgs` (private) | `fs`, `os`, `vscode`, `process.env` | HIGH — mostly mockable pure logic |
| `src/pty/PtySession.ts` | `spawn`, `write`, `resize`, `kill`, `dispose` | node-pty types only (injected) | HIGH — dependency injection friendly |
| `src/types/errors.ts` | 6 error classes with codes, messages | None | TRIVIAL — pure constructors |
| `src/providers/TerminalViewProvider.ts` | `handleMessage`, `getViewId`, `getHtmlForWebview` | `vscode` (heavy) | MEDIUM — needs VS Code mocks |
| `src/types/messages.ts` | Pure type definitions | None | N/A — no runtime logic |
| `src/webview/main.ts` | Placeholder (1 console.log) | None | N/A — no logic yet |

### Gap Analysis

| Have | Need |
|---|---|
| VS Code integration test runner (slow, heavyweight) | Fast unit test runner for pure/mockable logic |
| 1 placeholder test | Tests for ~15 functions across 3 files |
| No mocking | `vscode` module mock, `fs` mock, `node-pty` mock |
| No test scripts for unit tests | `pnpm run test:unit` script |
| `_resetCache()` test helper in PtyManager | More test-friendly exports or DI patterns |

## Key Decisions

| Decision | Options | Chosen | Reasoning |
|---|---|---|---|
| Unit test framework | Vitest vs Mocha vs Jest | **TBD — Gate** | Need user input |
| vscode mock approach | Manual mock module vs `jest-mock-vscode` | Manual mock | Lightweight, no extra dep, only need subset |
| Test file location | `src/test/unit/` vs `src/**/*.test.ts` colocated | **TBD — Gate** | Affects config and imports |

## Options Comparison: Test Framework

| Criteria | Vitest ✅ Recommended | Mocha (standalone) | Jest |
|---|---|---|---|
| Speed | Very fast (native ESM, Vite-powered) | Fast | Moderate |
| TS support | Built-in (via esbuild/swc) | Needs ts-node/tsx | Needs ts-jest |
| Mocking | Built-in `vi.mock()` | Needs sinon | Built-in `jest.mock()` |
| ESM support | Native | Experimental | Experimental |
| Config | `vitest.config.ts` | `.mocharc.yml` | `jest.config.ts` |
| Watch mode | Built-in | Needs flag | Built-in |
| New dependency | Yes (1 dep) | Already partially installed | Yes (3+ deps) |
| Community/Ecosystem | Growing fast, modern | Mature, stable | Mature, large |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| `vscode` module is virtual (not importable outside Extension Host) | MEDIUM | Create manual mock module |
| PtySession timers (`setTimeout`) in kill/shutdown logic | LOW | Use fake timers from test framework |
| `module.require` in `loadNodePty` — non-standard require | LOW | Mock at module level |
| Private methods (`getShellArgs`, `getHtmlForWebview`) | LOW | Test through public API surface |

## Open Questions (for Gate)

1. **Test framework**: Vitest (recommended) or Mocha/Jest?
2. **Test file location**: Colocated (`src/pty/PtyManager.test.ts`) or centralized (`src/test/unit/`)?
3. **Coverage target**: Should we add coverage reporting and a minimum threshold?
