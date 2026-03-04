---
labels: [output-buffer, performance, timer]
source: cyberk-flow/changes/implement-ipc-messaging
summary: Use one-shot setTimeout (not setInterval) for output coalescing timers. setInterval at 8ms runs 125x/sec even when idle. setTimeout starts on first data, self-clears after flush, restarts on next append. Cancel pending timer in _flush() when triggered early by size/chunk limits.
---
# --title OutputBuffer: setTimeout over setInterval for idle efficiency
**Date**: 2026-03-04

Use one-shot setTimeout (not setInterval) for output coalescing timers. setInterval at 8ms runs 125x/sec even when idle. setTimeout starts on first data, self-clears after flush, restarts on next append. Cancel pending timer in _flush() when triggered early by size/chunk limits.
