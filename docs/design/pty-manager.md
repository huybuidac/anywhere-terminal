# PTY Manager — Detailed Design

## 1. Overview

The **PtyManager** is responsible for loading the `node-pty` native module, detecting the user's preferred shell, and spawning PTY (pseudo-terminal) processes. It is a singleton service used by the SessionManager.

### Responsibilities
- Load node-pty from VS Code's internal modules (no native compilation)
- Detect and validate the default shell on macOS
- Provide shell spawn configuration (executable, args, environment)
- Handle graceful PTY shutdown with data flush

### Non-Responsibilities
- Session tracking (→ SessionManager)
- Output buffering (→ OutputBuffer / SessionManager)
- Flow control (→ OutputBuffer)

---

## 2. node-pty Loading Strategy

### Problem
node-pty is a native Node.js addon (C++ binding). Bundling it with the extension would require compiling native code for every target platform/architecture. VS Code already ships node-pty internally.

### Solution: Reuse VS Code's Built-in node-pty

VS Code bundles node-pty in its installation. We dynamically require it at runtime.

```mermaid
flowchart TD
    A["PtyManager.loadNodePty()"] --> B{"Cached?"}
    B -->|Yes| C["Return cached module"]
    B -->|No| D["Try: appRoot/node_modules.asar/node-pty"]
    D -->|Success| E["Cache & return"]
    D -->|Fail| F["Try: appRoot/node_modules/node-pty"]
    F -->|Success| E
    F -->|Fail| G["Throw PtyLoadError"]
    G --> H["User sees: 'AnyWhere Terminal requires<br/>VS Code >= 1.109.0'"]
```

### Candidate Paths (in order)

| Priority | Path | Notes |
|----------|------|-------|
| 1 | `vscode.env.appRoot/node_modules.asar/node-pty` | Modern VS Code (asar-packed modules) |
| 2 | `vscode.env.appRoot/node_modules/node-pty` | Older VS Code versions |

### Dynamic Require (esbuild compatibility)

esbuild replaces `require()` with its own `__require`. To load node-pty from an external path at runtime, we need the real Node.js `require`:

```typescript
// Handle esbuild's require replacement
const requireFunc = typeof __webpack_require__ === 'function'
  ? __non_webpack_require__
  : typeof module !== 'undefined'
    ? module.require
    : require;
```

### Reference
- VS Code loads node-pty in `src/vs/platform/terminal/node/terminalProcess.ts` via standard import (it's bundled in their build)
- The reference project `vscode-sidebar-terminal` uses `@homebridge/node-pty-prebuilt-multiarch` as a webpack external with `bundledDependencies`
- Our approach avoids shipping native binaries entirely

---

## 3. Shell Detection

### Detection Flow

```mermaid
flowchart TD
    A["detectShell()"] --> B{"User config<br/>anywhereTerminal.shell.macOS<br/>set?"}
    B -->|Yes| C["Validate: file exists?"]
    C -->|Yes| D["Return configured shell"]
    C -->|No| E["Log warning, fall through"]
    B -->|No| E
    E --> F{"$SHELL env var set?"}
    F -->|Yes| G["Validate: file exists?"]
    G -->|Yes| H["Return $SHELL"]
    G -->|No| I["Fall through"]
    F -->|No| I
    I --> J["Try fallback chain"]
    J --> K["/bin/zsh"]
    K -->|exists| L["Return /bin/zsh"]
    K -->|missing| M["/bin/bash"]
    M -->|exists| N["Return /bin/bash"]
    M -->|missing| O["/bin/sh"]
    O --> P["Return /bin/sh (always exists)"]
```

### Shell Configuration

| Config Key | Type | Default | Description |
|------------|------|---------|-------------|
| `anywhereTerminal.shell.macOS` | `string` | `""` (auto-detect) | Path to shell executable |
| `anywhereTerminal.shell.args` | `string[]` | `[]` | Arguments to pass to shell |

### Default Shell Args

When no custom args are configured:
- **Login shell**: `['--login']` — ensures `.zprofile`, `.bash_profile`, etc. are sourced
- This matches VS Code's behavior (login shell by default on macOS)

### Available Shells Discovery (Future Enhancement)

VS Code reads `/etc/shells` to discover available shells on Unix/macOS:
```
# /etc/shells — typical macOS content
/bin/bash
/bin/csh
/bin/dash
/bin/ksh
/bin/sh
/bin/tcsh
/bin/zsh
```
This can be used for a shell picker UI in later phases.

---

## 4. PTY Spawn Configuration

### Spawn Options

```typescript
interface SpawnOptions {
  name: string;        // Terminal type identifier
  cols: number;        // Initial column count
  rows: number;        // Initial row count
  cwd: string;         // Working directory
  env: Record<string, string>; // Environment variables
}
```

### Default Values

| Option | Value | Rationale |
|--------|-------|-----------|
| `name` | `'xterm-256color'` | Standard terminal type with 256-color support |
| `cols` | `80` | Standard terminal width (overridden by fitAddon on attach) |
| `rows` | `30` | Default height (overridden by fitAddon on attach) |
| `cwd` | Workspace root or `$HOME` | See CWD resolution below |
| `env` | `process.env` + overrides | See environment setup below |

### CWD Resolution

```mermaid
flowchart TD
    A["Determine CWD"] --> B{"anywhereTerminal.defaultCwd<br/>configured?"}
    B -->|Yes| C["Validate: directory exists?"]
    C -->|Yes| D["Use configured CWD"]
    C -->|No| E["Log warning, fall through"]
    B -->|No| E
    E --> F{"Workspace folders<br/>available?"}
    F -->|Yes| G["Use first workspace folder"]
    F -->|No| H["Use os.homedir()"]
```

### Environment Setup

The PTY process inherits `process.env` with these overrides/additions:

| Variable | Value | Reason |
|----------|-------|--------|
| `TERM` | `xterm-256color` | Tell programs they're in a color-capable terminal |
| `COLORTERM` | `truecolor` | Advertise 24-bit color support |
| `LANG` | `en_US.UTF-8` (if unset) | Ensure UTF-8 locale for proper character handling |
| `LC_ALL` | (preserve existing) | Don't override if user has locale configured |
| `TERM_PROGRAM` | `AnyWhereTerminal` | Identify our terminal (used by shell integrations) |
| `TERM_PROGRAM_VERSION` | Extension version | For shell integration version checks |

Variables explicitly **excluded** from override:
- `PATH` — always inherited from user environment
- `HOME` — always inherited
- `SHELL` — inherited (describes user's default shell, not current running shell)

---

## 5. Graceful Shutdown

### Shutdown Sequence

Based on VS Code's `TerminalProcess.shutdown()` in `terminalProcess.ts:444`:

```mermaid
sequenceDiagram
    participant Caller as SessionManager
    participant PM as PtyManager
    participant PTY as node-pty Process
    participant OS as OS Kernel

    Caller->>PM: shutdown(pty, immediate=false)
    
    Note over PM: 1. Stop accepting input
    Note over PM: 2. Wait for data flush (250ms)
    
    PM->>PM: Start flush timer (250ms)
    
    alt Data still arriving
        PTY-->>PM: onData(chunk)
        Note over PM: Reset flush timer
    end
    
    Note over PM: 3. Flush timer expires<br/>(250ms since last data)
    
    PM->>PTY: pty.kill()
    PTY->>OS: SIGHUP → shell process
    
    alt Process exits cleanly
        PTY-->>PM: onExit({ exitCode })
        Note over PM: Cleanup complete
    else Process doesn't exit
        Note over PM: 4. Force-kill timer (5s)
        PM->>PTY: pty.kill('SIGKILL')
        PTY-->>PM: onExit({ exitCode })
    end
```

### Shutdown Constants

| Constant | Value | Rationale |
|----------|-------|-----------|
| `DATA_FLUSH_TIMEOUT` | 250ms | Wait for final data after last `onData` event (from VS Code) |
| `MAX_SHUTDOWN_TIME` | 5000ms | Force-kill if process doesn't exit (from VS Code `ShutdownConstants`) |
| `IMMEDIATE_KILL` | — | On macOS, direct `pty.kill()` without queue (no conpty issues) |

### macOS-Specific Notes

- On macOS, `pty.kill()` sends `SIGHUP` to the process group, which is the standard Unix signal for terminal hangup
- No kill/spawn throttling needed (VS Code only throttles on Windows for conpty stability)
- Child processes of the shell receive SIGHUP and typically exit cleanly

---

## 6. Error Handling

### Error Categories

| Error | Cause | Recovery |
|-------|-------|----------|
| `PtyLoadError` | VS Code version too old, asar corruption | Show error notification, disable extension gracefully |
| `ShellNotFoundError` | Invalid shell path, permissions denied | Fall through to next shell in fallback chain |
| `SpawnError` | CWD doesn't exist, env issues | Retry with `$HOME` as CWD, log original error |
| `ShutdownError` | Process doesn't respond to SIGTERM | Force-kill with SIGKILL after 5s timeout |

### Error Events

```typescript
interface PtyError {
  type: 'load' | 'spawn' | 'runtime' | 'shutdown';
  message: string;
  shellPath?: string;
  exitCode?: number;
}
```

---

## 7. Interface Definition

```typescript
interface IPtyManager {
  /**
   * Load node-pty from VS Code's internal modules.
   * Caches the module after first successful load.
   * @throws PtyLoadError if node-pty cannot be found
   */
  loadNodePty(): typeof import('node-pty');

  /**
   * Detect the user's preferred shell and arguments.
   * Priority: user config → $SHELL → /bin/zsh → /bin/bash → /bin/sh
   */
  detectShell(): { shell: string; args: string[] };

  /**
   * Build the environment variables for a new PTY process.
   * Clones process.env and adds terminal-specific overrides.
   */
  buildEnvironment(): Record<string, string>;

  /**
   * Resolve the working directory for a new PTY process.
   * Priority: user config → workspace root → $HOME
   */
  resolveWorkingDirectory(): string;

  /**
   * Validate that a shell executable exists and is executable.
   */
  validateShell(shellPath: string): boolean;
}
```

---

## 8. File Location

```
src/pty/PtyManager.ts
```

### Dependencies
- `vscode` (for `env.appRoot`, workspace configuration)
- `path` (for path joining)
- `fs` (for shell validation)
- `os` (for `homedir()`)

### Dependents
- `SessionManager` — calls `loadNodePty()`, `detectShell()`, `buildEnvironment()`, `resolveWorkingDirectory()`
