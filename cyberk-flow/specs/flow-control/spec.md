# flow-control Specification

## Purpose
TBD
## Requirements

### Requirement: Ack Batching

The webview SHALL track the number of characters written via `terminal.write(data, callback)`. In the write callback, the character count MUST be accumulated. When the accumulated count reaches or exceeds the `ACK_BATCH_SIZE` (5000 characters), an `ack` message SHALL be sent: `vscode.postMessage({ type: 'ack', charCount })`, and the accumulator reset.

#### Scenario: Ack sent after 5000 chars
- **Given** ack accumulator is at 4500 chars
- **When** a write callback reports 600 chars written
- **Then** `vscode.postMessage({ type: 'ack', charCount: 5100 })` is sent and the accumulator resets to 0

#### Scenario: Small outputs do not trigger ack
- **Given** ack accumulator is at 100 chars
- **When** a write callback reports 50 chars
- **Then** no ack message is sent; accumulator is now 150

