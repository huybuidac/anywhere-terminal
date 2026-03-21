# Proposal: optimize-performance

## Why

Phase 3.3 of the AnyWhere Terminal extension focuses on performance optimization. While the base 8ms buffering and flow control are already implemented (Phase 1), there are opportunities to improve throughput handling, renderer resilience, memory safety, and observability. These changes reduce the risk of performance degradation under heavy terminal output and improve the extension's robustness across different hardware configurations.

## Appetite

**M ≤3d** — 4 focused capabilities, all modifying existing code with well-understood patterns.

## Scope Boundaries

### In Scope
1. **Adaptive output buffering** — dynamic flush interval based on output throughput
2. **WebGL renderer hardening** — static failure tracking, graceful degradation with context loss recovery
3. **Output buffer overflow protection** — hard cap with FIFO eviction
4. **Per-session memory tracking** — accessor methods for buffer and scrollback sizes

### Explicitly Cut
- Webview-side output buffering (design doc explicitly decided against this)
- Custom WebGL shader optimizations
- Real-time performance dashboard/UI
- Changing flow control watermark values (already tuned to VS Code's values)
- DOM renderer (xterm.js uses canvas by default, not DOM — the task description's "DOM renderer first" is actually "canvas renderer first" which is already the behavior)

## Capabilities

1. **Adaptive Output Buffering**: OutputBuffer dynamically adjusts flush interval between 4ms and 16ms based on recent throughput. High throughput → longer interval (more coalescing). Low throughput → shorter interval (more responsive). Default remains 8ms.

2. **WebGL Renderer Hardening**: Static flag tracks WebGL failure across terminal instances. After one failure, subsequent terminals skip WebGL initialization. Context loss triggers addon disposal and marks WebGL as failed. Logging for renderer selection.

3. **Output Buffer Overflow Protection**: Hard cap (1MB) on total buffered data. When exceeded, oldest chunks are evicted (FIFO) until under limit. Prevents unbounded memory growth if flush is blocked or slow.

4. **Per-Session Memory Tracking**: Expose `bufferSize` and `unackedCharCount` on OutputBuffer. Expose aggregate memory metrics on SessionManager (total buffer size, total scrollback size, session count).

## Impact

- **Users**: More responsive terminal under varying workloads; no visible UI changes
- **Developers**: Memory metrics available for debugging; clearer WebGL failure logging
- **Systems**: Bounded memory usage per terminal; reduced WebGL initialization overhead

## Risk Rating

**MEDIUM** — Performance changes can regress responsiveness. Adaptive interval needs careful bounds. WebGL changes affect rendering pipeline.

## UI Impact & E2E

User-visible UI behavior affected? NO

All changes are internal (buffering logic, renderer initialization, memory tracking). No new UI elements, pages, or user-visible behavior changes.

E2E = NOT REQUIRED
