# Spec: error-type-tests

## ADDED Requirements

### Requirement: error-class-tests

Unit tests SHALL verify all custom error classes:
- `AnyWhereTerminalError` — sets `message`, `code`, and `name` correctly
- `PtyLoadError` — stores `attemptedPaths`, formats message with paths joined by `, `, has code `PTY_LOAD_FAILED`
- `ShellNotFoundError` — stores `attemptedShells`, has code `SHELL_NOT_FOUND`
- `SpawnError` — stores `shellPath` and `cause`, includes cause message, has code `SPAWN_FAILED`
- `CwdNotFoundError` — stores `cwdPath` and `fallbackPath`, has code `CWD_NOT_FOUND`
- `WebViewDisposedError` — stores `viewId`, has code `WEBVIEW_DISPOSED`
- `SessionNotFoundError` — stores `sessionId`, has code `SESSION_NOT_FOUND`
- All errors SHALL be `instanceof Error` and `instanceof AnyWhereTerminalError`

#### Scenario: PtyLoadError construction
- Given attempted paths `["/app/node_modules.asar/node-pty", "/app/node_modules/node-pty"]`
- When `new PtyLoadError(paths)` is created
- Then `error.message` contains both paths
- And `error.code` is `ErrorCode.PtyLoadFailed`
- And `error.attemptedPaths` is the original array
- And `error instanceof AnyWhereTerminalError` is `true`
- And `error instanceof Error` is `true`

### Requirement: error-code-enum-tests

Unit tests SHALL verify the `ErrorCode` enum contains all expected values:
- `PTY_LOAD_FAILED`, `SHELL_NOT_FOUND`, `SPAWN_FAILED`, `CWD_NOT_FOUND`, `WEBVIEW_DISPOSED`, `SESSION_NOT_FOUND`, `BUFFER_OVERFLOW`

#### Scenario: Enum completeness
- Each `ErrorCode` value MUST be a non-empty string matching its key in SCREAMING_SNAKE_CASE
