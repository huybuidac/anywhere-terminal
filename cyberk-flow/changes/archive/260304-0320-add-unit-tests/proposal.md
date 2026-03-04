# Proposal: add-unit-tests

## Why

The project currently has **zero unit tests** — only a placeholder sample test that runs in the VS Code Extension Host. All business logic in `PtyManager`, `PtySession`, and error classes is completely untested. This creates risk for regressions as features are added (SessionManager, OutputBuffer, etc. are planned next).

A fast unit test suite with coverage enforcement will catch bugs early and establish a testing culture before the codebase grows.

## Appetite

**S (<=1 day)** — Infrastructure setup + tests for existing logic only. No refactoring of source code for testability.

## Scope Boundaries

### In Scope
- Install and configure Vitest with TypeScript support
- Create `vscode` module mock for unit testing outside Extension Host
- Create `node-pty` mock for PtySession tests
- Write unit tests for:
  - `PtyManager.ts`: `detectShell`, `validateShell`, `buildEnvironment`, `resolveWorkingDirectory`, `loadNodePty`
  - `PtySession.ts`: `spawn`, `write`, `resize`, `kill` (graceful shutdown), `dispose`
  - `errors.ts`: all 6 error classes (construction, codes, messages, inheritance)
- Add `pnpm run test:unit` script
- Configure coverage reporting with minimum threshold (80%)
- Update `project.md` with new test commands

### Out of Scope (Explicitly Cut)
- Refactoring source code for better testability (no DI changes)
- Tests for `TerminalViewProvider` (too VS Code-coupled, better as integration tests)
- Tests for `webview/main.ts` (placeholder, no logic)
- Tests for `messages.ts` (pure types, no runtime logic)
- E2E tests
- CI pipeline setup
- Integration tests (keep existing VS Code test infrastructure unchanged)

## Capability List

1. **test-infrastructure** — Vitest setup, config, vscode mock, scripts
2. **pty-manager-tests** — Unit tests for PtyManager functions
3. **pty-session-tests** — Unit tests for PtySession lifecycle
4. **error-type-tests** — Unit tests for custom error classes
5. **coverage-reporting** — Coverage thresholds and reporting config

## Impact

- **Developers**: Can run `pnpm run test:unit` for fast feedback (~seconds vs minutes for VS Code integration tests)
- **CI (future)**: Coverage gate prevents merging untested code
- **Codebase**: ~15 functions gain test coverage, establishing patterns for future tests

## Risk Rating

**LOW** — Adding tests only, no production code changes, well-understood tooling.

## UI Impact & E2E

**NO** — This change is test infrastructure only. No user-visible behavior changes. E2E is **NOT REQUIRED**.
