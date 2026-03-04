# pty-manager-tests Specification

## Purpose
TBD
## Requirements

### Requirement: detect-shell-tests

Unit tests SHALL verify `detectShell()` behavior:
- Returns `$SHELL` when the env var is set and points to a valid executable
- Falls back to `/bin/zsh` → `/bin/bash` → `/bin/sh` when `$SHELL` is unset or invalid
- Throws `ShellNotFoundError` when no shell in the fallback chain is valid
- Returns `["--login"]` args for zsh and bash shells
- Returns `[]` args for `/bin/sh`

#### Scenario: Shell detection with mocked filesystem
- Given `process.env.SHELL` is `/bin/zsh` and `fs.statSync` confirms it exists and is executable
- When `detectShell()` is called
- Then it returns `{ shell: "/bin/zsh", args: ["--login"] }`

#### Scenario: Shell fallback chain
- Given `process.env.SHELL` is unset
- And `fs.statSync` for `/bin/zsh` throws (not found)
- And `/bin/bash` exists and is executable
- When `detectShell()` is called
- Then it returns `{ shell: "/bin/bash", args: ["--login"] }`

#### Scenario: No valid shell found
- Given `process.env.SHELL` is unset and all fallback shells fail validation
- When `detectShell()` is called
- Then it throws `ShellNotFoundError` with all attempted paths listed

### Requirement: validate-shell-tests

Unit tests SHALL verify `validateShell()` behavior:
- Returns `true` for existing executable files
- Returns `false` for non-existent paths
- Returns `false` for directories
- Returns `false` for files without execute permission

#### Scenario: Valid executable file
- Given `fs.statSync` returns a file stat with mode `0o755` (rwxr-xr-x)
- When `validateShell("/bin/zsh")` is called
- Then it returns `true`

### Requirement: build-environment-tests

Unit tests SHALL verify `buildEnvironment()` behavior:
- Sets `TERM=xterm-256color` and `COLORTERM=truecolor`
- Sets `LANG=en_US.UTF-8` only when `LANG` is not already in `process.env`
- Preserves existing `LANG` when already set
- Sets `TERM_PROGRAM=AnyWhereTerminal`
- Sets `TERM_PROGRAM_VERSION` from extension metadata (fallback `0.0.0`)
- Filters out `undefined` values from `process.env`

#### Scenario: LANG preservation
- Given `process.env.LANG` is `ja_JP.UTF-8`
- When `buildEnvironment()` is called
- Then the returned env has `LANG=ja_JP.UTF-8` (not overwritten)

### Requirement: resolve-working-directory-tests

Unit tests SHALL verify `resolveWorkingDirectory()` behavior:
- Returns first workspace folder path when workspace folders exist
- Falls back to `os.homedir()` when no workspace folders

#### Scenario: Workspace folder available
- Given `vscode.workspace.workspaceFolders` contains `[{ uri: { fsPath: "/projects/my-app" } }]`
- When `resolveWorkingDirectory()` is called
- Then it returns `/projects/my-app`

### Requirement: load-node-pty-tests

Unit tests SHALL verify `loadNodePty()` behavior:
- Returns cached module on subsequent calls
- Tries candidate paths in order (`node_modules.asar/node-pty`, `node_modules/node-pty`)
- Throws `PtyLoadError` with attempted paths when all candidates fail
- `_resetCache()` clears the cached module

#### Scenario: Successful load from first candidate
- Given `module.require` succeeds for the first candidate path
- When `loadNodePty()` is called
- Then it returns the loaded module
- And calling `loadNodePty()` again returns the same cached instance

