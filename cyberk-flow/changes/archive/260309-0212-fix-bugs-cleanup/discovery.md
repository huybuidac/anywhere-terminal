# Discovery: fix-bugs-cleanup

## Architecture Snapshot

### Relevant Layers

| Layer | File | Role |
| ----- | ---- | ---- |
| Types | `src/types/messages.ts` | Message protocol types incl. `AckMessage` |
| Types | `src/types/errors.ts` | Error class hierarchy (4 dead, 2 live) |
| Webview | `src/webview/main.ts` | 1473 LOC monolith — ack logic, resize, terminal creation |
| Webview | `src/webview/InputHandler.ts` | Key/paste handling — `handlePaste()` is dead |
| Provider | `src/providers/TerminalViewProvider.ts` | Sidebar/panel webview — ack routing bug |
| Provider | `src/providers/TerminalEditorProvider.ts` | Editor webview — same ack routing bug |

### Data Flow (ack routing)

```
PTY output → SessionManager → OutputBuffer.write() → postMessage("output", {tabId, data})
  ↓ (webview)
main.ts handleMessage("output") → terminal.write() → ackChars(dataLen)  [GLOBAL counter]
  ↓
postMessage("ack", {charCount})  [NO tabId]
  ↓ (provider)
TerminalViewProvider → finds ACTIVE tab → sessionManager.handleAck(activeTab.id, charCount)
  ↓
OutputBuffer.handleAck() → decrements _unackedCharCount → may resume PTY
```

**Bug**: Background tab acks are misrouted to active tab.

## Internal Patterns

- `TerminalInstance` is a module-private interface in `main.ts` — safe to modify without cross-module impact
- `TerminalLike` is exported from `InputHandler.ts` but only used within webview tests
- Error classes follow a base-class pattern (`AnyWhereTerminalError`) — dead subclasses can be removed without affecting live ones
- Resize uses debounced callbacks with `window.setTimeout` IDs stored in module-level variables

## Findings

### Bug 1: Ack routing (CORRECTNESS)
- `AckMessage` lacks `tabId` — `src/types/messages.ts:89-93`
- `ackChars()` uses single global counter — `src/webview/main.ts:89,640-646`
- Both providers route to active tab only — `TerminalViewProvider.ts:142-151`, `TerminalEditorProvider.ts:150-158`
- **Risk**: Background tab PTY permanently paused under heavy output

### Bug 2: Shared resizeTimeout (CORRECTNESS)
- Single `resizeTimeout` variable at `main.ts:95`
- Used by both `debouncedFit()` (line 709) and `debouncedFitAllLeaves()` (line 400)
- Concurrent resize operations cancel each other

### Bug 3: Missing null guard (CRASH)
- `core._renderService.clear()` at `main.ts:699` lacks optional chaining
- Earlier line 666 uses `core?._renderService?.dimensions` safely
- Can throw TypeError during rapid terminal disposal

### Dead Code 1: fitAddon/webLinksAddon properties
- Stored on `TerminalInstance` interface (lines 41-42) but never read after creation
- `fitTerminal()` bypasses `FitAddon.fit()` entirely
- `webLinksAddon` addon is active (loaded into xterm) but stored reference is unused

### Dead Code 2: handlePaste()
- Defined at `InputHandler.ts:45-58`, exported but never imported in production
- `case "v"` returns `false` (line 117-123) — browser native paste
- `paste` on `TerminalLike` interface only used by dead `handlePaste()`
- Tests exist at `InputHandler.test.ts:247,400-462` — must be removed too

### Dead Code 3: Error classes
- `SpawnError`, `CwdNotFoundError`, `WebViewDisposedError`, `SessionNotFoundError` — defined but never thrown
- Only referenced in `errors.test.ts` — tests must be removed too
- Corresponding `ErrorCode` enum values are also dead
