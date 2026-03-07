# buffer-overflow-protection Specification

## Purpose
TBD
## Requirements

### Requirement: Output Buffer Size Cap

> Original (output-buffer spec): The OutputBuffer SHALL collect PTY output chunks into a string array buffer (max MAX_CHUNKS = 100 entries).

The OutputBuffer SHALL enforce a hard cap of `MAX_TOTAL_BUFFER_CHARS` (1,048,576 chars / 1MB) on the total buffered data size. This cap operates independently of and in addition to the existing `MAX_BUFFER_SIZE` (64KB) flush trigger and `MAX_CHUNKS` (100) limit.

When `append(data)` would cause `_bufferSize` to exceed `MAX_TOTAL_BUFFER_CHARS`, the OutputBuffer SHALL evict the oldest chunks (FIFO, from the front of the `_chunks` array) until `_bufferSize + data.length <= MAX_TOTAL_BUFFER_CHARS`. The new chunk SHALL then be appended.

If a single chunk's `data.length` exceeds `MAX_TOTAL_BUFFER_CHARS`, the OutputBuffer SHALL truncate it to `MAX_TOTAL_BUFFER_CHARS` characters (keeping the tail, discarding the head) before appending.

The `_bufferSize` counter MUST be kept in sync with the actual total length of all chunks after eviction.

#### Scenario: Buffer evicts oldest chunks when cap exceeded
- **Given** the buffer contains 900KB of data across multiple chunks
- **When** a 200KB chunk is appended (total would be 1.1MB > 1MB cap)
- **Then** oldest chunks are evicted until the 200KB chunk fits within the 1MB cap

#### Scenario: Single oversized chunk is truncated
- **Given** the buffer is empty
- **When** a 2MB chunk is appended
- **Then** the chunk is truncated to 1MB (tail preserved) and appended

#### Scenario: Normal operation unaffected
- **Given** the buffer contains 10KB of data
- **When** a 5KB chunk is appended (total 15KB, well under 1MB)
- **Then** the chunk is appended normally with no eviction

