# pty-integration Specification

## Purpose
TBD
## Requirements

### Requirement: node-pty Dynamic Loading

The system SHALL load the `node-pty` native module from VS Code's internal installation at runtime using dynamic require.

- The system SHALL try candidate paths in order: `vscode.env.appRoot/node_modules.asar/node-pty`, then `vscode.env.appRoot/node_modules/node-pty`.
- The system SHALL cache the loaded module after first successful load (singleton pattern).
- The system SHALL use `module.require` (not bare `require`) to bypass esbuild's require replacement.
- The system SHALL throw `PtyLoadError` with attempted paths if all candidates fail.

#### Scenario: Successful load from asar path

- **WHEN** VS Code bundles node-pty in `node_modules.asar/node-pty`
- **THEN** `loadNodePty()` returns the module and caches it
- **AND** subsequent calls return the cached module without filesystem access

#### Scenario: Fallback to non-asar path

- **WHEN** the `.asar` path fails
- **AND** `node_modules/node-pty` exists
- **THEN** the module is loaded from the fallback path

#### Scenario: All paths fail

- **WHEN** no candidate path contains node-pty
- **THEN** `PtyLoadError` is thrown containing the list of attempted paths

### Requirement: Shell Detection

The system SHALL detect the user's preferred shell on macOS using a fallback chain: `$SHELL` env var, then `/bin/zsh`, then `/bin/bash`, then `/bin/sh`.

- Each candidate SHALL be validated: file exists AND is executable (`fs.statSync` + mode check for `X_OK`).
- If no args are configured, default args SHALL be `['--login']` (login shell, matching VS Code behavior).

#### Scenario: $SHELL is valid

- **WHEN** `process.env.SHELL` is `/bin/zsh` and the file exists and is executable
- **THEN** `detectShell()` returns `{ shell: '/bin/zsh', args: ['--login'] }`

#### Scenario: $SHELL is invalid, fallback succeeds

- **WHEN** `process.env.SHELL` points to a non-existent path
- **AND** `/bin/zsh` exists and is executable
- **THEN** `detectShell()` returns `{ shell: '/bin/zsh', args: ['--login'] }`

#### Scenario: All shells invalid except /bin/sh

- **WHEN** only `/bin/sh` is available
- **THEN** `detectShell()` returns `{ shell: '/bin/sh', args: ['--login'] }`

### Requirement: PTY Environment Setup

The system SHALL build a PTY environment by cloning `process.env` and applying terminal-specific overrides.

- `TERM` SHALL be set to `xterm-256color`
- `COLORTERM` SHALL be set to `truecolor`
- `LANG` SHALL be set to `en_US.UTF-8` only if not already set
- `TERM_PROGRAM` SHALL be set to `AnyWhereTerminal`
- `TERM_PROGRAM_VERSION` SHALL be set to the extension version
- `PATH`, `HOME`, `SHELL` SHALL NOT be overridden

#### Scenario: LANG already set

- **WHEN** `process.env.LANG` is `ja_JP.UTF-8`
- **THEN** `buildEnvironment()` preserves `ja_JP.UTF-8` (does not override)

### Requirement: Working Directory Resolution

The system SHALL resolve the PTY working directory using a fallback chain: first workspace folder (if available), then `os.homedir()`.

#### Scenario: Workspace folder available

- **WHEN** a VS Code workspace folder exists
- **THEN** `resolveWorkingDirectory()` returns the first workspace folder's `fsPath`

#### Scenario: No workspace folder

- **WHEN** no workspace folders are open
- **THEN** `resolveWorkingDirectory()` returns `os.homedir()`

### Requirement: PTY Session Lifecycle

The system SHALL provide a `PtySession` class that wraps a single node-pty process with spawn, write, resize, and kill operations.

- `spawn()` SHALL create a PTY process with shell, args, cols, rows, cwd, and env.
- `write(data)` SHALL forward input data to the PTY process.
- `resize(cols, rows)` SHALL resize the PTY, ensuring cols and rows are >= 1.
- `kill()` SHALL initiate graceful shutdown (see Requirement: Graceful Shutdown).
- The class SHALL expose `onData` and `onExit` event callbacks.
- The class SHALL have an `isAlive` property reflecting whether the PTY process is running.

#### Scenario: Spawn and receive data

- **WHEN** `spawn()` is called with a valid shell
- **THEN** the PTY process starts and `onData` fires with shell prompt output

#### Scenario: Write input

- **WHEN** `write('ls\r')` is called on a running session
- **THEN** the PTY process receives the input and produces output via `onData`

#### Scenario: Resize

- **WHEN** `resize(120, 40)` is called
- **THEN** the PTY is resized to 120 columns and 40 rows
- **AND** cols/rows below 1 are clamped to 1

### Requirement: Graceful Shutdown

The system SHALL implement graceful PTY shutdown following VS Code's pattern.

- On `kill()`, stop accepting new input.
- Wait for data flush: 250ms after last `onData` event (reset timer on each data event).
- After flush timeout, call `pty.kill()` (sends SIGHUP on macOS).
- If process doesn't exit within 5000ms, force-kill with SIGKILL.
- `onExit` SHALL fire with the exit code after termination.

#### Scenario: Clean shutdown

- **WHEN** `kill()` is called on a running shell
- **THEN** final data is flushed (250ms quiet period)
- **AND** `pty.kill()` is called
- **AND** `onExit` fires with exit code 0

#### Scenario: Unresponsive process force-killed

- **WHEN** `kill()` is called and the process doesn't exit within 5000ms after `pty.kill()`
- **THEN** `pty.kill('SIGKILL')` is called to force termination

### Requirement: Error Types

The system SHALL define typed error classes for PTY-related failures.

- `PtyLoadError` — node-pty could not be loaded; includes `attemptedPaths: string[]`
- `ShellNotFoundError` — no valid shell found; includes `attemptedShells: string[]`
- `SpawnError` — PTY spawn failed; includes `shellPath: string` and `cause: Error`
- `CwdNotFoundError` — working directory not found; includes `cwdPath: string` and `fallbackPath: string`
- All errors SHALL extend a base `AnyWhereTerminalError` class with an `ErrorCode` enum.

#### Scenario: Error identity

- **WHEN** a `PtyLoadError` is caught
- **THEN** `error instanceof AnyWhereTerminalError` is `true`
- **AND** `error.code` equals `ErrorCode.PtyLoadFailed`

