# test-infrastructure Specification

## Purpose
TBD
## Requirements

### Requirement: vitest-configuration

The project SHALL have a Vitest configuration file (`vitest.config.ts`) at the project root that:
- Uses the `test` workspace to isolate unit tests
- Resolves `vscode` module imports to a manual mock
- Enables TypeScript support without additional plugins
- Excludes `node_modules/`, `dist/`, `out/` from test discovery

#### Scenario: Running unit tests
- Given Vitest is configured
- When a developer runs `pnpm run test:unit`
- Then Vitest discovers and executes all `*.test.ts` files colocated with source files under `src/`
- And tests complete without requiring VS Code Extension Host runtime

### Requirement: vscode-mock-module

The project SHALL provide a manual mock for the `vscode` module (`src/test/__mocks__/vscode.ts`) that stubs:
- `vscode.env.appRoot` (string)
- `vscode.workspace.workspaceFolders` (array)
- `vscode.extensions.getExtension()` (returns mock extension)
- `vscode.Uri.joinPath()` and `vscode.Uri.file()` (path utilities)

#### Scenario: Importing vscode in tests
- Given a test file imports from a module that uses `import * as vscode from "vscode"`
- When the test runs under Vitest
- Then the vscode mock is resolved instead of the real VS Code API
- And no "Cannot find module 'vscode'" error occurs

### Requirement: coverage-threshold

The project SHALL configure Vitest coverage with:
- Provider: `v8` (built-in, no extra deps)
- Minimum threshold: 80% for lines, functions, and branches
- Reporter: `text` (console) and `lcov` (for CI integration)
- Coverage target: all `.ts` files under `src/` excluding `src/test/`, `src/webview/`, `src/types/messages.ts`

#### Scenario: Coverage below threshold
- Given coverage for a metric drops below 80%
- When `pnpm run test:unit --coverage` is executed
- Then the command exits with a non-zero code
- And the console output shows which file/metric failed the threshold

### Requirement: test-scripts

The `package.json` SHALL include:
- `test:unit` — runs Vitest in single-run mode
- `test:unit:watch` — runs Vitest in watch mode
- `test:unit:coverage` — runs Vitest with coverage reporting

The existing `test` script (VS Code integration tests) MUST remain unchanged.

#### Scenario: Script coexistence
- Given both `test` and `test:unit` scripts exist
- When a developer runs `pnpm run test`
- Then only VS Code integration tests run (existing behavior preserved)
- When a developer runs `pnpm run test:unit`
- Then only Vitest unit tests run

