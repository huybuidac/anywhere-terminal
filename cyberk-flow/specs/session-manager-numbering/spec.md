# session-manager-numbering Specification

## Purpose
TBD
## Requirements

### Requirement: Terminal Number Recycling

The SessionManager SHALL assign terminal numbers using a gap-filling algorithm. The `findAvailableNumber()` method MUST find the lowest available number starting from 1 by iterating through `usedNumbers`.

Numbers MUST be:
- Added to `usedNumbers` on session creation
- Removed from `usedNumbers` on session destruction
- Used to generate display names: `"Terminal {number}"`

#### Scenario: Sequential number assignment

- **Given**: No sessions exist (usedNumbers is empty)
- **When**: Three sessions are created
- **Then**: They receive numbers 1, 2, 3 respectively
- **And**: Display names are "Terminal 1", "Terminal 2", "Terminal 3"

#### Scenario: Gap-filling after deletion

- **Given**: Sessions with numbers 1, 2, 3 exist
- **When**: Session with number 2 is destroyed, then a new session is created
- **Then**: The new session receives number 2 (filling the gap)
- **And**: usedNumbers is {1, 2, 3}

#### Scenario: Numbers always start from 1

- **Given**: usedNumbers is empty
- **When**: A session is created
- **Then**: It receives number 1 (not 0)

### Requirement: Scrollback Cache

Each session SHALL maintain a scrollback cache as a ring buffer of output chunks. The cache MUST:
- Append every `pty.onData` chunk to the cache
- Evict oldest chunks (FIFO) when total size exceeds `maxSize` (default 512KB)
- Be cleared on `clearScrollback(sessionId)`
- Be used for view restore: on `resolveWebviewView` re-call, send `{ type: 'restore', tabId, data: cache.join('') }` for each session

#### Scenario: Scrollback cache evicts old data

- **Given**: A session's scrollback cache has 500KB of data (maxSize = 512KB)
- **When**: 20KB of new data arrives
- **Then**: Oldest chunks are evicted until total size is under 512KB
- **And**: The newest data is preserved

