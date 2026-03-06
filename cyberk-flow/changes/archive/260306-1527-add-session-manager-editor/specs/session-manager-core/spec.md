# session-manager-core Specification

## Purpose

Define the central SessionManager registry that tracks all terminal sessions across all views.

## ADDED Requirements

### Requirement: Session Data Model

The `SessionManager` SHALL maintain a `TerminalSession` interface with the following fields:
- `id: string` — unique session identifier (UUID via `crypto.randomUUID()`)
- `viewId: string` — which view this session belongs to
- `pty: PtySession` — the PTY process wrapper
- `name: string` — display name (e.g., "Terminal 1")
- `isActive: boolean` — whether this is the active tab in its view
- `number: number` — assigned terminal number (for name and recycling)
- `outputBuffer: OutputBuffer` — per-session output buffer
- `scrollbackCache: string[]` — cached scrollback lines for view restore
- `createdAt: number` — timestamp of session creation
- `cols: number` — current terminal columns
- `rows: number` — current terminal rows
- `disposables: Array<{ dispose(): void }>` — per-session event subscriptions

The `SessionManager` MUST maintain these internal maps:
- `sessions: Map<string, TerminalSession>` — all sessions indexed by ID
- `viewSessions: Map<string, string[]>` — view ID → ordered list of session IDs
- `usedNumbers: Set<number>` — terminal numbers currently in use

#### Scenario: Session creation populates all maps

- **Given**: SessionManager is initialized with no sessions
- **When**: `createSession("anywhereTerminal.sidebar", webview)` is called
- **Then**: A new TerminalSession is created with a UUID id
- **And**: The session is added to `sessions` map
- **And**: The session ID is appended to `viewSessions` for the given viewId
- **And**: The session's terminal number is added to `usedNumbers`

### Requirement: Create Session

`SessionManager.createSession(viewId: string, webview: MessageSender)` SHALL:
1. Generate a UUID via `crypto.randomUUID()`
2. Allocate a terminal number via gap-filling algorithm
3. Use `PtyManager` to detect shell, load node-pty, build environment, resolve CWD
4. Spawn a PTY process via `PtySession`
5. Create an `OutputBuffer` for the session
6. Wire `pty.onData` → `outputBuffer.append()` and `pty.onData` → scrollback cache append
7. Wire `pty.onExit` → cleanup handler
8. Register the session in all maps
9. Set `isActive: true` for the new session (and `false` for other sessions in the same view if this is the first session)
10. Return the session ID

#### Scenario: First session in a view is automatically active

- **Given**: No sessions exist for viewId "anywhereTerminal.sidebar"
- **When**: `createSession("anywhereTerminal.sidebar", webview)` is called
- **Then**: The new session has `isActive: true`

#### Scenario: Subsequent sessions in a view are active by default

- **Given**: One session exists for viewId "anywhereTerminal.sidebar"
- **When**: `createSession("anywhereTerminal.sidebar", webview)` is called again
- **Then**: The new session has `isActive: true`
- **And**: The previous session has `isActive: false`

### Requirement: Write To Session

`SessionManager.writeToSession(sessionId: string, data: string)` SHALL forward data to the session's PTY via `pty.write(data)`. It MUST silently ignore calls with unknown session IDs.

#### Scenario: Write to valid session

- **Given**: A session "abc" exists with a running PTY
- **When**: `writeToSession("abc", "ls\r")` is called
- **Then**: The PTY receives `"ls\r"` via `pty.write()`

#### Scenario: Write to unknown session is no-op

- **Given**: No session "xyz" exists
- **When**: `writeToSession("xyz", "data")` is called
- **Then**: No error is thrown, call is silently ignored

### Requirement: Resize Session

`SessionManager.resizeSession(sessionId: string, cols: number, rows: number)` SHALL resize the session's PTY and update the session's `cols` and `rows` fields. It MUST silently ignore calls with unknown session IDs.

#### Scenario: Resize updates PTY and session dimensions

- **Given**: A session "abc" exists with cols=80, rows=24
- **When**: `resizeSession("abc", 120, 40)` is called
- **Then**: The PTY is resized to 120x40
- **And**: The session's cols=120 and rows=40

### Requirement: Switch Active Session

`SessionManager.switchActiveSession(viewId: string, sessionId: string)` SHALL set `isActive: true` on the target session and `isActive: false` on all other sessions in the same view. It MUST silently ignore calls with unknown viewId or sessionId.

#### Scenario: Switch active session in a view

- **Given**: View "sidebar" has sessions "s1" (active) and "s2" (inactive)
- **When**: `switchActiveSession("sidebar", "s2")` is called
- **Then**: "s1" has `isActive: false` and "s2" has `isActive: true`

### Requirement: Get Tabs For View

`SessionManager.getTabsForView(viewId: string)` SHALL return an array of `{ id, name, isActive }` for all sessions in the given view, in creation order. It MUST return an empty array for unknown viewIds.

#### Scenario: Get tabs returns ordered session info

- **Given**: View "sidebar" has sessions "s1" (Terminal 1, active) and "s2" (Terminal 2, inactive)
- **When**: `getTabsForView("sidebar")` is called
- **Then**: Returns `[{ id: "s1", name: "Terminal 1", isActive: true }, { id: "s2", name: "Terminal 2", isActive: false }]`

### Requirement: Get Session

`SessionManager.getSession(sessionId: string)` SHALL return the `TerminalSession` for the given ID, or `undefined` if not found.

#### Scenario: Get existing session

- **Given**: A session "abc" exists
- **When**: `getSession("abc")` is called
- **Then**: Returns the TerminalSession object

### Requirement: Clear Scrollback

`SessionManager.clearScrollback(sessionId: string)` SHALL clear the scrollback cache for the given session. It MUST silently ignore calls with unknown session IDs.

#### Scenario: Clear scrollback resets cache

- **Given**: A session "abc" has scrollback data
- **When**: `clearScrollback("abc")` is called
- **Then**: The session's `scrollbackCache` is empty
