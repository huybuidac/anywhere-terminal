# Spec: memory-tracking

**Parent change**: optimize-performance
**Design ref**: docs/design/output-buffering.md, docs/design/session-manager.md

## ADDED Requirements

### Requirement: OutputBuffer Memory Accessors

The OutputBuffer SHALL expose a read-only `bufferSize` accessor that returns the current total character count of all buffered (unflushed) chunks. This accessor SHALL return `_bufferSize` directly with no computation overhead.

#### Scenario: bufferSize reflects current buffer state
- **Given** the OutputBuffer has received 3 chunks totaling 1500 chars (unflushed)
- **When** `bufferSize` is read
- **Then** it returns 1500

#### Scenario: bufferSize resets after flush
- **Given** the OutputBuffer has 1000 chars buffered
- **When** the flush timer fires
- **Then** `bufferSize` returns 0

### Requirement: SessionManager Memory Metrics

The SessionManager SHALL expose a `getMemoryMetrics()` method that returns an aggregate snapshot of memory usage across all sessions:

```typescript
interface MemoryMetrics {
  /** Number of active sessions */
  sessionCount: number;
  /** Total characters in all output buffers (unflushed) */
  totalBufferSize: number;
  /** Total characters in all scrollback caches */
  totalScrollbackSize: number;
  /** Per-session breakdown */
  sessions: Array<{
    id: string;
    name: string;
    bufferSize: number;
    scrollbackSize: number;
    unackedCharCount: number;
  }>;
}
```

The method SHALL iterate over all sessions and sum their `outputBuffer.bufferSize`, `outputBuffer.unackedCharCount`, and `scrollbackSize` values.

#### Scenario: Metrics reflect current state
- **Given** 3 active sessions with varying buffer and scrollback sizes
- **When** `getMemoryMetrics()` is called
- **Then** it returns correct aggregate totals and per-session breakdowns

#### Scenario: Empty state returns zeros
- **Given** no active sessions
- **When** `getMemoryMetrics()` is called
- **Then** it returns `{ sessionCount: 0, totalBufferSize: 0, totalScrollbackSize: 0, sessions: [] }`
