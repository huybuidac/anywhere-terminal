# pty-session-tests Specification

## Purpose
TBD
## Requirements

### Requirement: spawn-lifecycle-tests

Unit tests SHALL verify `PtySession.spawn()` behavior:
- Calls `nodePty.spawn()` with correct shell, args, and clamped options (cols/rows min 1)
- Sets `isAlive=true` and wires `onData`/`onExit` handlers
- No-ops when called on an already alive session (logs warning)
- No-ops when called on a previously used (already-spawned) session
- Defaults cols to 80, rows to 30 when not provided
- Clamps cols/rows to minimum of 1

#### Scenario: Successful spawn
- Given a new `PtySession("test-1")`
- When `spawn()` is called with a mock nodePty, shell `/bin/zsh`, args `["--login"]`, and `{ cols: 120, rows: 40 }`
- Then `nodePty.spawn` is called with `("/bin/zsh", ["--login"], { name: "xterm-256color", cols: 120, rows: 40, cwd: undefined, env: undefined })`
- And `session.isAlive` is `true`

#### Scenario: Spawn with zero cols/rows
- Given a new `PtySession`
- When `spawn()` is called with `{ cols: 0, rows: 0 }`
- Then `nodePty.spawn` receives `cols: 1, rows: 1` (clamped)

### Requirement: write-resize-tests

Unit tests SHALL verify:
- `write()` forwards data to `pty.write()` when alive
- `write()` is a no-op when not alive or shutting down
- `resize()` forwards clamped dimensions to `pty.resize()` when alive
- `resize()` clamps cols/rows to minimum of 1
- `resize()` is a no-op when not alive

#### Scenario: Write during shutdown
- Given a session is alive and `kill()` has been called (shutting down)
- When `write("ls\n")` is called
- Then `pty.write()` is NOT called

### Requirement: kill-graceful-shutdown-tests

Unit tests SHALL verify the graceful shutdown sequence using fake timers:
- `kill()` sets `_isShuttingDown=true` and starts flush timer (250ms)
- After 250ms of no data, `pty.kill()` is called (SIGHUP)
- If data arrives during flush, the timer resets
- After `pty.kill()`, if process doesn't exit within 5000ms, `pty.kill("SIGKILL")` is called
- Hard grace period (3000ms) force-kills even if data keeps flowing
- `kill()` is idempotent (second call is no-op)
- `kill()` on dead session is no-op

#### Scenario: Clean shutdown — no data during flush
- Given a spawned session
- When `kill()` is called
- Then `write()` calls are rejected (no-op)
- After advancing fake timers by 250ms, `pty.kill()` is called
- After the onExit fires, `session.isAlive` is `false`

#### Scenario: Force kill after timeout
- Given a spawned session where `pty.kill()` does not trigger onExit
- When `kill()` is called and 250ms + 5000ms elapse
- Then `pty.kill("SIGKILL")` is called

### Requirement: dispose-tests

Unit tests SHALL verify `dispose()`:
- Kills process immediately if alive (no graceful shutdown)
- Clears all timers
- Disposes all event subscriptions
- Clears callbacks (`onData`, `onExit`)
- Sets `isAlive=false`

#### Scenario: Dispose during active shutdown
- Given a session in graceful shutdown (kill already called)
- When `dispose()` is called
- Then all timers are cleared and process is killed immediately

### Requirement: exit-callback-tests

Unit tests SHALL verify exit event handling:
- `onExit` callback fires with the exit code when process exits
- After exit, `isAlive=false`, disposables are cleaned up, pty reference is cleared
- `onData` callback fires with data strings during normal operation

#### Scenario: Process exits normally
- Given a spawned session with onExit callback registered
- When the mock pty fires onExit with `{ exitCode: 0 }`
- Then the callback receives `0`
- And `session.isAlive` is `false`

