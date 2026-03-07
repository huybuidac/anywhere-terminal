# Discovery: optimize-performance

## Workstreams

| # | Workstream | Used? | Justification |
|---|---|---|---|
| 1 | Memory Recall | ✅ | Prior output-buffer and flow-control specs/decisions |
| 2 | Architecture Snapshot | ✅ | Need to understand OutputBuffer, SessionManager, webview main.ts |
| 3 | Internal Patterns | ✅ | Existing scrollback cache eviction pattern reusable for buffer overflow |
| 4 | External Research | ⏭️ Skipped | WebGL addon already imported; no novel external deps |
| 5 | Documentation | ⏭️ Skipped | Existing design docs (output-buffering.md) are comprehensive |
| 6 | Constraint Check | ✅ | Verified package.json — @xterm/addon-webgl already a dependency |

## Key Findings

### Current Output Buffering (OutputBuffer.ts)
- Fixed 8ms flush interval via `setTimeout` (one-shot, re-armed on data)
- 64KB max buffer size, 100 max chunks — triggers immediate flush
- Flow control: 100K high watermark, 5K low watermark, 5K ack batch
- No adaptive interval — always 8ms regardless of throughput
- No buffer size cap — buffer can grow unbounded between flushes if data arrives faster than flush interval

### Current WebGL Usage (webview/main.ts)
- WebGL addon already imported and loaded in `createTerminal()`
- Simple try/catch — if WebGL fails, falls back silently to canvas
- No tracking of WebGL failure across instances — each new terminal retries WebGL
- `onContextLoss` handler disposes the addon but doesn't prevent re-attempts
- No DOM renderer fallback — xterm.js defaults to canvas (not DOM) when WebGL fails

### Memory Patterns (SessionManager.ts)
- Scrollback cache per session: 512KB max with FIFO eviction
- No tracking of total memory across sessions
- No per-session memory metrics exposed
- OutputBuffer has no size cap — only flush triggers (timer/size/chunks)

### Existing Specs
- `output-buffer` spec: 3 requirements (coalescing, flow control, disposal)
- `flow-control` spec: 1 requirement (ack batching)
- Both well-tested with comprehensive unit tests

## Gap Analysis

| Have | Need |
|---|---|
| Fixed 8ms flush interval | Adaptive interval based on throughput |
| WebGL try/catch per instance | Static failure tracking, graceful degradation |
| No buffer overflow protection | Hard cap with eviction |
| No memory tracking | Per-session memory metrics |
| Scrollback cache eviction | Consistent pattern for output buffer overflow |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Adaptive buffering strategy | Throughput-based interval (4ms-16ms range) | Simple, low overhead, matches VS Code (5ms) and reference (16ms) range |
| WebGL failure tracking | Static class variable on webview side | Prevents repeated WebGL init failures across terminal instances |
| Buffer overflow handling | Hard cap (1MB) with oldest-chunk eviction | Consistent with scrollback cache FIFO pattern |
| Memory profiling approach | Accessor methods on OutputBuffer + SessionManager | Non-invasive, testable, no runtime overhead when not queried |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| Adaptive interval may cause visible latency changes | MEDIUM | Bound range to 4-16ms; default to 8ms; unit test edge cases |
| WebGL may not work in VS Code webview at all | LOW | Already works (imported and loaded); just need failure hardening |
| Buffer overflow eviction may lose important output | LOW | 1MB cap is generous; flow control already prevents most overflow scenarios |
| Memory tracking overhead | LOW | Read-only accessors, no continuous monitoring |

## Open Questions

None — all resolved via codebase analysis. Fastlane: auto-proceeding.
