# ack-routing Specification

## Purpose
TBD
## Requirements

### Requirement: Session-Scoped Ack Message

> Original: AckMessage contains only `type` and `charCount`
> -- _source: `src/types/messages.ts#AckMessage`_

The system SHALL include a `tabId: string` field in `AckMessage` to identify which session the acknowledgment belongs to.

#### Scenario: Background tab ack routed correctly

- **WHEN** a background tab receives PTY output and the webview acknowledges it
- **THEN** the ack message includes the correct `tabId` for that session
- **THEN** the provider routes the ack to the correct session's OutputBuffer (not the active tab)

#### Scenario: Per-session char counting

- **WHEN** output arrives for multiple tabs concurrently
- **THEN** each tab's unacked char count is tracked independently
- **THEN** ack batching (ACK_BATCH_SIZE threshold) is evaluated per-session

### Requirement: Independent Resize Debounce Timers

> Original: Single `resizeTimeout` variable shared by `debouncedFit()` and `debouncedFitAllLeaves()`
> -- _source: `src/webview/main.ts:95`_

The system SHALL use separate debounce timers for window resize (`debouncedFit`) and split-pane resize (`debouncedFitAllLeaves`) so they do not cancel each other.

#### Scenario: Concurrent window and split resize

- **WHEN** a window resize event and a split-pane resize occur simultaneously
- **THEN** both debounced operations execute independently after their respective delays

### Requirement: Null Guard on Render Service

> Original: `core._renderService.clear()` called without optional chaining
> -- _source: `src/webview/main.ts:699`_

The system SHALL use optional chaining (`core?._renderService?.clear()`) when calling the xterm render service clear method to prevent TypeError during terminal disposal.

#### Scenario: Terminal disposed during resize

- **WHEN** `fitTerminal()` is called on a terminal whose `_core` or `_renderService` has been disposed
- **THEN** the call is a no-op instead of throwing a TypeError

### Requirement: handlePaste Removed

Dead code removal. `handlePaste()` was exported from `InputHandler.ts` but never called in production. The `case "v"` handler returns `false` to let xterm handle paste natively via browser events. Function removed, `paste` removed from `TerminalLike` interface, associated tests removed.

### Requirement: Dead Error Classes Removed

Dead code removal. `SpawnError`, `CwdNotFoundError`, `WebViewDisposedError`, `SessionNotFoundError` were defined in `src/types/errors.ts` but never thrown in production code. Classes removed, corresponding `ErrorCode` enum values removed, associated tests removed.

### Requirement: Dead fitAddon webLinksAddon Properties Removed

Dead code removal. `fitAddon` and `webLinksAddon` properties on `TerminalInstance` were assigned in `createTerminal()` but never read. `fitTerminal()` bypasses `FitAddon.fit()` entirely. The addons remain loaded into xterm (they are active); only the stored property references were removed from the interface and object literal.

