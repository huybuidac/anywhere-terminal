# Spec: adaptive-buffering

**Parent change**: optimize-performance
**Design ref**: docs/design/output-buffering.md

## ADDED Requirements

### Requirement: Adaptive Flush Interval

> Original (output-buffer spec): The OutputBuffer SHALL flush the buffer to the webview via postMessage when a setInterval timer fires at FLUSH_INTERVAL_MS (8ms).

The OutputBuffer SHALL dynamically adjust its flush interval between `MIN_FLUSH_INTERVAL_MS` (4ms) and `MAX_FLUSH_INTERVAL_MS` (16ms) based on recent output throughput. The default interval SHALL be `DEFAULT_FLUSH_INTERVAL_MS` (8ms).

**Throughput tracking**: On each flush, the OutputBuffer SHALL record the flushed data size. It SHALL maintain a rolling window of the last `THROUGHPUT_WINDOW_SIZE` (5) flush sizes to compute average throughput.

**Interval adjustment logic**:
- If average flush size exceeds `HIGH_THROUGHPUT_THRESHOLD` (32,768 chars / 32KB): interval SHALL increase to `MAX_FLUSH_INTERVAL_MS` (16ms) to coalesce more data per flush
- If average flush size is below `LOW_THROUGHPUT_THRESHOLD` (1,024 chars / 1KB): interval SHALL decrease to `MIN_FLUSH_INTERVAL_MS` (4ms) for lower latency
- Otherwise: interval SHALL remain at `DEFAULT_FLUSH_INTERVAL_MS` (8ms)

The interval adjustment SHALL only take effect on the next timer creation (not mid-timer). The one-shot timer pattern SHALL be preserved — timer is created on first data event after a flush.

All existing flush triggers (size limit 64KB, chunk limit 100, PTY exit) SHALL continue to work unchanged alongside the adaptive interval.

#### Scenario: High throughput increases interval to 16ms
- **Given** the last 5 flushes averaged 40KB each
- **When** new data arrives and a flush timer is created
- **Then** the timer interval is 16ms (not 8ms)

#### Scenario: Low throughput decreases interval to 4ms
- **Given** the last 5 flushes averaged 500 bytes each
- **When** new data arrives and a flush timer is created
- **Then** the timer interval is 4ms (not 8ms)

#### Scenario: Medium throughput uses default 8ms
- **Given** the last 5 flushes averaged 10KB each
- **When** new data arrives and a flush timer is created
- **Then** the timer interval is 8ms

#### Scenario: Cold start uses default interval
- **Given** the OutputBuffer was just created (no flush history)
- **When** first data arrives
- **Then** the timer interval is 8ms (default)

#### Scenario: Existing flush triggers still work
- **Given** adaptive interval is 16ms
- **When** buffer exceeds 64KB before timer fires
- **Then** immediate flush occurs (size-based trigger unchanged)
