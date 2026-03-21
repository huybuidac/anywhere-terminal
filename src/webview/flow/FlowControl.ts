// src/webview/flow/FlowControl.ts — Output ack batching per session
//
// Tracks characters written per terminal session and sends ack messages
// when the threshold is reached. Prevents flow control deadlock.
//
// See: docs/design/output-buffering.md#§4

// ─── Constants ──────────────────────────────────────────────────────

/** Flow control: send ack after this many chars are processed. */
const ACK_BATCH_SIZE = 5000;

// ─── FlowControl ────────────────────────────────────────────────────

/**
 * Manages output ack batching per terminal session.
 *
 * Owns:
 * - `unsentAckCharsMap` — accumulated chars since last ack, per session
 * - `ACK_BATCH_SIZE` threshold logic
 *
 * Sends an ack message to the extension host when the threshold is reached.
 */
export class FlowControl {
  /** Accumulated chars since last ack, tracked per session. */
  private readonly unsentAckCharsMap = new Map<string, number>();

  private readonly postMessage: (msg: unknown) => void;

  constructor(postMessage: (msg: unknown) => void) {
    this.postMessage = postMessage;
  }

  /**
   * Track characters written and send ack when threshold reached.
   * See: docs/design/output-buffering.md#§4
   */
  ackChars(count: number, tabId: string): void {
    const current = this.unsentAckCharsMap.get(tabId) ?? 0;
    const updated = current + count;
    if (updated >= ACK_BATCH_SIZE) {
      this.postMessage({ type: "ack", charCount: updated, tabId });
      this.unsentAckCharsMap.set(tabId, 0);
    } else {
      this.unsentAckCharsMap.set(tabId, updated);
    }
  }

  /** Clear the tracking entry for a session (on terminal removal). */
  delete(sessionId: string): void {
    this.unsentAckCharsMap.delete(sessionId);
  }
}
