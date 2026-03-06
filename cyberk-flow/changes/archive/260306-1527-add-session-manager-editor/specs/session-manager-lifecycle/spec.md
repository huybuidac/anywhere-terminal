# session-manager-lifecycle Specification

## Purpose

Define the SessionManager's destructive operation handling: destroy, operation queue, kill tracking, and disposable pattern.

## ADDED Requirements

### Requirement: Destroy Session

`SessionManager.destroySession(sessionId: string)` SHALL queue the destruction via the operation queue. The actual destruction MUST:
1. Validate the session exists (no-op if not found)
2. Add the session ID to `terminalBeingKilled` Set
3. Flush and dispose the OutputBuffer
4. Call `pty.kill()` (graceful shutdown)
5. On PTY exit: remove from all maps (`sessions`, `viewSessions`, `usedNumbers`), remove from `terminalBeingKilled`
6. Return `{ tabId, exitCode }` info for the caller

#### Scenario: Destroy existing session cleans up all resources

- **Given**: A session "abc" exists with a running PTY
- **When**: `destroySession("abc")` is called
- **Then**: The session is removed from `sessions` map
- **And**: The session ID is removed from `viewSessions`
- **And**: The terminal number is removed from `usedNumbers`
- **And**: The PTY process is killed
- **And**: The OutputBuffer is disposed

#### Scenario: Destroy non-existent session is no-op

- **Given**: No session "xyz" exists
- **When**: `destroySession("xyz")` is called
- **Then**: No error is thrown, operation completes silently

### Requirement: Destroy All For View

`SessionManager.destroyAllForView(viewId: string)` SHALL queue destruction of all sessions for the given view via the operation queue. Each session MUST be cleaned up following the same sequence as `destroySession`.

#### Scenario: Destroy all sessions for a view

- **Given**: View "sidebar" has sessions "s1" and "s2"
- **When**: `destroyAllForView("sidebar")` is called
- **Then**: Both sessions are destroyed
- **And**: The viewSessions entry for "sidebar" is removed

### Requirement: Operation Queue Serialization

All destructive operations (`destroySession`, `destroyAllForView`, `dispose`) MUST be serialized via a Promise chain (`operationQueue`). This SHALL prevent race conditions from rapid operations (double-kill, orphaned sessions, number collisions).

Non-destructive operations (`createSession`, `writeToSession`, `resizeSession`, `switchActiveSession`) SHALL NOT be serialized — they are safe for concurrent execution.

#### Scenario: Rapid destroy calls are serialized

- **Given**: Sessions "s1" and "s2" exist
- **When**: `destroySession("s1")` and `destroySession("s2")` are called in rapid succession
- **Then**: The second destroy waits for the first to complete before executing
- **And**: No double-kill or orphaned session occurs

#### Scenario: Operation queue catches and logs errors

- **Given**: A destroy operation throws an error
- **When**: The operation queue processes it
- **Then**: The error is caught and logged
- **And**: Subsequent queued operations still execute

### Requirement: Kill Tracking

The `terminalBeingKilled` Set SHALL prevent re-entrant cleanup when `destroySession()` calls `pty.kill()` and the PTY fires `onExit`.

Two distinct exit paths MUST be handled:
1. **Intentional kill**: `destroySession()` adds to Set → `pty.kill()` → `onExit` fires → checks Set → skips cleanup (destroySession handles it)
2. **Unexpected crash**: shell crashes → `onExit` fires → checks Set → not found → runs cleanup → sends `exit` message to webview

#### Scenario: Intentional kill prevents double cleanup

- **Given**: `destroySession("abc")` is in progress
- **When**: PTY `onExit` fires for "abc"
- **Then**: The onExit handler checks `terminalBeingKilled` and skips cleanup
- **And**: `destroySession` completes the cleanup

#### Scenario: Unexpected PTY crash triggers cleanup

- **Given**: Session "abc" is running normally (not being killed)
- **When**: The PTY process crashes and `onExit` fires
- **Then**: The onExit handler checks `terminalBeingKilled`, finds "abc" is NOT in the set
- **And**: Cleanup runs: session removed from maps, exit message sent to webview

### Requirement: Disposable Pattern

`SessionManager` SHALL extend VS Code's `Disposable` pattern. On `dispose()`:
1. Queue a `destroyAll` operation that kills all PTY processes
2. Clear all maps (`sessions`, `viewSessions`, `usedNumbers`)
3. Dispose all session-specific resources (event subscriptions, output buffers)

The SessionManager MUST be registered in `context.subscriptions` for automatic cleanup on extension deactivation.

#### Scenario: Extension deactivation cleans up all sessions

- **Given**: Multiple sessions exist across different views
- **When**: The extension deactivates (SessionManager.dispose() called)
- **Then**: All PTY processes are killed
- **And**: All maps are cleared
- **And**: No orphaned PTY processes remain
