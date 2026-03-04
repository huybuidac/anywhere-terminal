## ADDED Requirements

### Requirement: Output Buffer Coalescing

The OutputBuffer SHALL collect PTY output chunks into a string array buffer (max `MAX_CHUNKS` = 100 entries). It SHALL flush the buffer to the webview via `postMessage({ type: 'output', tabId, data })` when ANY of these conditions is met:
- A `setInterval` timer fires at `FLUSH_INTERVAL_MS` (8ms)
- The total buffer size (measured as string `.length` — UTF-16 code units) exceeds `MAX_BUFFER_SIZE` (65,536 chars)
- The buffer reaches `MAX_CHUNKS` (100) entries
- The PTY process exits (final flush)

All size/count values SHALL be measured in string `.length` (UTF-16 code units), consistent with the webview's `data.length` used for ack counting.

On flush, the buffer chunks SHALL be joined into a single string, sent via postMessage, and the buffer reset to empty. The flush timer SHALL be created on first data event and cleared on dispose.

The OutputBuffer SHALL accept a `FlowControllable` interface for PTY flow control: `{ pause(): void; resume(): void }`. This allows `PtySession` to expose pause/resume without leaking the full Pty object.

#### Scenario: Timer-based flush after 8ms
- **Given** PTY emits 3 small chunks ("a", "b", "c") within 8ms
- **When** the 8ms flush timer fires
- **Then** one postMessage is sent with data "abc" and the buffer is emptied

#### Scenario: Size-based immediate flush at 64KB
- **Given** the buffer contains 60KB of data
- **When** PTY emits a 5KB chunk (total > 64KB)
- **Then** the buffer is flushed immediately without waiting for the timer

#### Scenario: Final flush on PTY exit
- **Given** the buffer contains "remaining output"
- **When** PTY exit event fires
- **Then** the remaining buffer is flushed before the exit message is sent

### Requirement: Flow Control via Watermarks

The OutputBuffer SHALL track `unackedCharCount` — the number of characters sent to the webview that have not been acknowledged. On each flush, `unackedCharCount` SHALL increase by the flushed data length.

When the webview sends `{ type: 'ack', charCount }`, the OutputBuffer SHALL decrease `unackedCharCount` by `charCount`. The result MUST be clamped to >= 0 to handle edge cases where acks arrive out of order or are duplicated.

- When `unackedCharCount` exceeds `HIGH_WATERMARK_CHARS` (100,000): the OutputBuffer SHALL call `pty.pause()` to stop PTY data events
- When `unackedCharCount` drops below `LOW_WATERMARK_CHARS` (5,000): the OutputBuffer SHALL call `pty.resume()` to resume PTY data events

The OutputBuffer MUST NOT pause a PTY that is already paused, and MUST NOT resume a PTY that is already flowing.

#### Scenario: Pause PTY at high watermark
- **Given** unackedCharCount is 95,000
- **When** a flush sends 6,000 chars (total = 101,000 > 100,000)
- **Then** `pty.pause()` is called

#### Scenario: Resume PTY at low watermark
- **Given** PTY is paused and unackedCharCount is 6,000
- **When** ack message arrives with charCount 2,000 (total = 4,000 < 5,000)
- **Then** `pty.resume()` is called

#### Scenario: Ack when PTY is already flowing
- **Given** PTY is not paused and unackedCharCount is 3,000
- **When** ack message arrives with charCount 1,000
- **Then** unackedCharCount decreases to 2,000 and `pty.resume()` is NOT called

### Requirement: OutputBuffer Disposal

The OutputBuffer SHALL implement `Disposable`. On dispose:
- Clear the flush timer
- Flush any remaining buffered data (best-effort — postMessage may fail if webview is disposed)
- Reset all state (buffer, unackedCharCount)
- Wrap `postMessage` calls in try/catch to handle disposed webview gracefully

#### Scenario: Dispose cleans up timer
- **Given** the flush timer is running
- **When** `dispose()` is called
- **Then** the timer is cleared and no further flushes occur
