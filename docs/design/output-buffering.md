# Output Buffering & Flow Control — Detailed Design

## 1. Overview

Terminal output from PTY processes can arrive at extremely high rates (e.g., `find /`, `yes`, `cat large-file`). Without buffering and flow control, the IPC channel (postMessage) gets overwhelmed and xterm.js rendering falls behind, causing lag and potential memory issues.

This document describes the **two-layer buffering architecture** and **flow control mechanism** used by AnyWhere Terminal.

### Reference Sources
- VS Code: `TerminalDataBufferer` (5ms throttle), `FlowControlConstants` (100K/5K watermarks), `AckDataBufferer`
- Reference project: Extension-side 16ms/50-chunk buffer, webview-side adaptive 4-16ms buffer

---

## 2. Architecture Overview

```mermaid
flowchart LR
    subgraph PTY["PTY Process"]
        P["Shell Output"]
    end

    subgraph ExtHost["Extension Host"]
        OB["Output Buffer<br/>(Layer 1)"]
    end

    subgraph IPC["IPC"]
        PM["postMessage"]
    end

    subgraph WebView["WebView"]
        XT["xterm.write()"]
        ACK["Ack Counter"]
    end

    P -->|"pty.onData<br/>(rapid, unbounded)"| OB
    OB -->|"Flush every 8ms<br/>or on size limit"| PM
    PM -->|"{ type: 'output',<br/>tabId, data }"| XT
    XT -->|"write callback"| ACK
    ACK -->|"Batch ack<br/>every 5K chars"| OB
    OB -->|"Pause/Resume"| P

    style OB fill:#345,stroke:#6af
    style ACK fill:#543,stroke:#fa6
```

---

## 3. Layer 1: Extension-Side Output Buffer

### Purpose
Coalesce rapid `pty.onData` events into fewer, larger `postMessage` calls. PTY can fire data events hundreds of times per second; postMessage has overhead per call.

### Design

```mermaid
flowchart TD
    A["pty.onData(chunk)"] --> B["buffer.append(chunk)"]
    B --> C{"Flush<br/>condition?"}
    
    C -->|"Timer: 8ms elapsed"| D["Flush"]
    C -->|"Size: buffer > 64KB"| D
    C -->|"Exit: pty.onExit"| D
    C -->|"None met"| E["Wait"]
    
    D --> F["Join buffer chunks"]
    F --> G["webview.postMessage(<br/>{ type: 'output', data })"]
    G --> H["Reset buffer to empty"]
    H --> I["Update unacked<br/>char count"]
```

### Constants

| Constant | Value | Rationale |
|----------|-------|-----------|
| `FLUSH_INTERVAL_MS` | 8 | Compromise between VS Code (5ms) and reference (16ms). 8ms ≈ 120fps ceiling, good balance of responsiveness vs. IPC reduction |
| `MAX_BUFFER_SIZE` | 65536 (64KB) | Large enough to batch big outputs, small enough to avoid visible delay |
| `MAX_CHUNKS` | 100 | Safety cap on array length |

### Implementation Notes

- Buffer is a `string[]` array (push chunks, join on flush) — avoids string concatenation overhead
- Timer is created on first data event, not on construction (no idle timers)
- Timer is reset on each data event that triggers immediate flush
- On `pty.onExit`: flush any remaining data, then fire exit event

### Comparison with References

| Aspect | VS Code | Reference Project | Our Design |
|--------|---------|-------------------|------------|
| Throttle interval | 5ms | 16ms | 8ms |
| Buffer type | string[] | string[] (50 max) | string[] (100 max) |
| Size limit | N/A (flow control handles it) | 1000 chars/chunk trigger | 64KB total |
| Immediate flush | N/A | >1000 char chunk | >64KB total buffer |

---

## 4. Flow Control

### Problem

Even with buffering, if the PTY produces output faster than xterm.js can render it, memory grows without bound. The buffer accumulates faster than it drains.

### Solution: Watermark-Based Flow Control

Adapted from VS Code's `TerminalProcess` flow control (`terminalProcess.ts:318-335`) and `AckDataBufferer` (`terminalProcessManager.ts:717`).

```mermaid
stateDiagram-v2
    [*] --> Flowing: PTY started
    
    Flowing --> Paused: unackedChars > HIGH_WATERMARK (100K)
    Paused --> Flowing: unackedChars < LOW_WATERMARK (5K)
    
    note right of Flowing
        pty is running normally.
        Data flows through buffer.
    end note
    
    note right of Paused
        pty.pause() called.
        No more data events.
        Waiting for acks from webview.
    end note
```

### Flow Control Constants

| Constant | Value | Source | Description |
|----------|-------|--------|-------------|
| `HIGH_WATERMARK_CHARS` | 100,000 | VS Code `FlowControlConstants.HighWatermarkChars` | Pause PTY when this many chars are unacknowledged |
| `LOW_WATERMARK_CHARS` | 5,000 | VS Code `FlowControlConstants.LowWatermarkChars` | Resume PTY when unacked drops below this |
| `ACK_BATCH_SIZE` | 5,000 | VS Code `FlowControlConstants.CharCountAckSize` | WebView sends ack after this many chars processed |

### Flow Control Sequence

```mermaid
sequenceDiagram
    participant PTY as PTY Process
    participant Buf as OutputBuffer
    participant WV as WebView (xterm.js)

    Note over PTY,WV: Normal flow

    PTY->>Buf: onData("output chunk 1") [500 chars]
    Note over Buf: unackedChars += 500 → 500
    Buf->>WV: postMessage({ output }) [on flush]
    WV->>WV: xterm.write(data, callback)
    Note over WV: callback fires after parse
    WV->>Buf: ack(500)
    Note over Buf: unackedChars -= 500 → 0

    Note over PTY,WV: Heavy output (e.g., find /)

    loop Rapid data events
        PTY->>Buf: onData(chunk) [many KB]
        Note over Buf: unackedChars climbing...
    end

    Note over Buf: unackedChars > 100,000<br/>HIGH WATERMARK reached!
    Buf->>PTY: pty.pause()
    Note over PTY: PTY stops sending data

    loop WebView catches up
        WV->>WV: xterm.write(data, callback)
        WV->>Buf: ack(5000)
        Note over Buf: unackedChars decreasing...
    end

    Note over Buf: unackedChars < 5,000<br/>LOW WATERMARK reached!
    Buf->>PTY: pty.resume()
    Note over PTY: PTY resumes sending data
```

### WebView-Side Ack Batching

To avoid excessive ack messages, the webview batches acknowledgments:

```typescript
class AckBatcher {
  private unsentCharCount = 0;

  ack(charCount: number): void {
    this.unsentCharCount += charCount;
    while (this.unsentCharCount >= ACK_BATCH_SIZE) {
      this.unsentCharCount -= ACK_BATCH_SIZE;
      vscode.postMessage({ type: 'ack', charCount: ACK_BATCH_SIZE });
    }
  }
}
```

This means acks are sent in fixed 5K-char batches, not per write call. The xterm.write() callback provides the trigger:

```typescript
terminal.write(data, () => {
  // Called after xterm has parsed the data
  ackBatcher.ack(data.length);
});
```

---

## 5. Layer 2: WebView-Side Write Strategy

### Decision: Direct Write (No Second Buffer)

The reference project has a webview-side `PerformanceManager` that buffers writes to xterm.js. However, analysis shows this is **largely bypassed** — routed messages (those with `terminalId`) call `terminal.write(data)` directly.

**Our design**: No webview-side buffer. The extension-side buffer already coalesces data. Adding a second buffer layer increases latency without meaningful benefit.

Exception: If profiling during Phase 2 reveals xterm.write() as a bottleneck, we can add webview-side batching as an optimization.

### xterm.write() is Non-Blocking

xterm.js's `write()` method is already internally buffered and uses `requestAnimationFrame` for rendering. Multiple rapid `write()` calls are efficiently batched by xterm itself.

---

## 6. Scrollback Cache (Separate from Output Buffer)

### Purpose

The scrollback cache stores recent terminal output for view restoration when `retainContextWhenHidden` fails or is disabled. It is **separate** from the output buffer.

### Design

```mermaid
flowchart TD
    A["pty.onData(chunk)"] --> B["OutputBuffer.append(chunk)<br/>(for immediate delivery)"]
    A --> C["ScrollbackCache.append(chunk)<br/>(for restore)"]
    
    C --> D{"totalSize > MAX_SIZE?"}
    D -->|Yes| E["Evict oldest chunks<br/>(FIFO ring buffer)"]
    D -->|No| F["Store chunk"]
```

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_SCROLLBACK_CACHE_SIZE` | 524,288 (512KB) | Maximum total cache size per session |
| `DEFAULT_SCROLLBACK_LINES` | 1,000 | Approximate line count (at ~50 chars/line) |

---

## 7. Complete Data Flow

### Full Pipeline: PTY Output → Screen

```mermaid
flowchart TD
    subgraph PTY["PTY (node-pty)"]
        A["Shell produces output"]
    end

    subgraph ExtHost["Extension Host"]
        B["pty.onData(chunk)"]
        C["OutputBuffer.append(chunk)"]
        D["ScrollbackCache.append(chunk)"]
        E{"Flow control:<br/>unacked > 100K?"}
        F["pty.pause()"]
        G["Wait for flush timer (8ms)<br/>or size limit (64KB)"]
        H["OutputBuffer.flush()"]
    end

    subgraph IPC["postMessage IPC"]
        I["{ type: 'output',<br/>tabId, data }"]
    end

    subgraph WV["WebView"]
        J["onDidReceiveMessage"]
        K["xterm.write(data, callback)"]
        L["xterm renders to DOM/WebGL"]
        M["callback: ackBatcher.ack(len)"]
        N{"unsentAck >= 5K?"}
        O["postMessage({ type: 'ack' })"]
    end

    subgraph ExtHost2["Extension Host (ack path)"]
        P["OutputBuffer.handleAck(charCount)"]
        Q{"unacked < 5K?"}
        R["pty.resume()"]
    end

    A --> B --> C
    B --> D
    C --> E
    E -->|Yes| F
    E -->|No| G
    G --> H --> I --> J --> K --> L
    K --> M --> N
    N -->|Yes| O --> P --> Q
    Q -->|Yes| R
    N -->|No| M
```

---

## 8. Edge Cases

### 1. Extremely Large Single Output

Scenario: `cat very-large-file` produces a single multi-MB chunk.

Handling:
- `pty.onData` may fire with chunks up to ~64KB (node-pty internal buffering)
- Our 64KB threshold triggers immediate flush per chunk
- Flow control pauses PTY if webview falls behind
- xterm.js handles large writes efficiently via internal batching

### 2. Rapid Small Outputs

Scenario: `while true; do echo x; done` — many tiny outputs per second.

Handling:
- Each `echo x` produces ~2 bytes
- Buffer accumulates for 8ms, then flushes many chunks as one string
- Without buffering: thousands of postMessage calls/sec → with buffering: ~125 calls/sec

### 3. PTY Exit During Buffered Output

Handling:
- `pty.onExit` triggers immediate buffer flush
- Remaining data is sent to webview before exit message
- Exit message `{ type: 'exit', tabId, code }` sent after flush
- Ordering: guaranteed because postMessage is ordered

### 4. WebView Disposed While Buffer Has Data

Handling:
- `webview.postMessage()` returns `false` or throws when webview is disposed
- OutputBuffer wraps postMessage in try/catch
- On failure: stop timer, dispose buffer, log warning
- SessionManager handles orphaned sessions cleanup

---

## 9. Interface Definition

```typescript
interface IOutputBuffer extends Disposable {
  /** Append data from PTY to the buffer */
  append(data: string): void;

  /** Force-flush all buffered data */
  flush(): void;

  /** Handle acknowledgment from webview (flow control) */
  handleAck(charCount: number): void;

  /** Check if PTY is currently paused */
  readonly isPaused: boolean;

  /** Get current unacknowledged char count */
  readonly unackedCharCount: number;
}

/** Flow control constants */
const enum FlowControlConstants {
  HighWatermarkChars = 100_000,
  LowWatermarkChars = 5_000,
  AckBatchSize = 5_000,
}

/** Buffer constants */
const enum BufferConstants {
  FlushIntervalMs = 8,
  MaxBufferSize = 65_536,
  MaxChunks = 100,
}
```

---

## 10. File Location

```
src/session/OutputBuffer.ts
```

### Dependencies
- `node-pty` `IPty` — for `pause()` / `resume()`
- `vscode.Webview` — for `postMessage()`

### Dependents
- `SessionManager` — creates one OutputBuffer per session
