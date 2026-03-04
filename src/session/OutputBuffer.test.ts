// src/session/OutputBuffer.test.ts — Unit tests for OutputBuffer
// See: specs/output-buffer/spec.md

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowControllable, MessageSender } from "./OutputBuffer";
import { OutputBuffer } from "./OutputBuffer";

// ─── Test Helpers ───────────────────────────────────────────────────

function createMockSender(): MessageSender & { messages: unknown[] } {
  const sender = {
    messages: [] as unknown[],
    postMessage(message: unknown): Thenable<boolean> {
      sender.messages.push(message);
      return Promise.resolve(true);
    },
  };
  return sender;
}

function createMockPty(): FlowControllable & { pauseCalls: number; resumeCalls: number } {
  return {
    pauseCalls: 0,
    resumeCalls: 0,
    pause() {
      this.pauseCalls++;
    },
    resume() {
      this.resumeCalls++;
    },
  };
}

// ─── Test Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Output Buffer Coalescing ───────────────────────────────────────

describe("OutputBuffer coalescing", () => {
  it("flushes buffered chunks after 8ms timer fires", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("tab-1", sender, pty);

    buffer.append("a");
    buffer.append("b");
    buffer.append("c");

    // Not flushed yet
    expect(sender.messages).toHaveLength(0);

    // Advance 8ms → timer fires
    vi.advanceTimersByTime(8);

    expect(sender.messages).toHaveLength(1);
    expect(sender.messages[0]).toEqual({ type: "output", tabId: "tab-1", data: "abc" });

    buffer.dispose();
  });

  it("flushes immediately when buffer exceeds 64KB", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("tab-2", sender, pty);

    // Add 60KB of data
    const chunk60k = "x".repeat(60_000);
    buffer.append(chunk60k);
    expect(sender.messages).toHaveLength(0); // Not yet

    // Add 6KB more → total > 64KB
    const chunk6k = "y".repeat(6_000);
    buffer.append(chunk6k);

    // Should flush immediately
    expect(sender.messages).toHaveLength(1);
    expect((sender.messages[0] as { data: string }).data.length).toBe(66_000);

    buffer.dispose();
  });

  it("flushes immediately when buffer reaches MAX_CHUNKS (100)", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("tab-3", sender, pty);

    // Add 100 small chunks
    for (let i = 0; i < 100; i++) {
      buffer.append("x");
    }

    // Should flush on the 100th chunk
    expect(sender.messages).toHaveLength(1);
    expect((sender.messages[0] as { data: string }).data).toBe("x".repeat(100));

    buffer.dispose();
  });

  it("flushes remaining data on flush() call (PTY exit)", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("tab-4", sender, pty);

    buffer.append("remaining output");

    // Manual flush (simulating PTY exit)
    buffer.flush();

    expect(sender.messages).toHaveLength(1);
    expect(sender.messages[0]).toEqual({ type: "output", tabId: "tab-4", data: "remaining output" });

    buffer.dispose();
  });

  it("does not flush when buffer is empty", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("tab-5", sender, pty);

    buffer.flush();
    expect(sender.messages).toHaveLength(0);

    vi.advanceTimersByTime(8);
    expect(sender.messages).toHaveLength(0);

    buffer.dispose();
  });

  it("coalesces multiple flushes over time", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("tab-6", sender, pty);

    buffer.append("batch1");
    vi.advanceTimersByTime(8);

    buffer.append("batch2");
    vi.advanceTimersByTime(8);

    expect(sender.messages).toHaveLength(2);
    expect((sender.messages[0] as { data: string }).data).toBe("batch1");
    expect((sender.messages[1] as { data: string }).data).toBe("batch2");

    buffer.dispose();
  });
});

// ─── Flow Control via Watermarks ────────────────────────────────────

describe("OutputBuffer flow control", () => {
  it("pauses PTY when unacked chars exceed high watermark (100K)", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("fc-1", sender, pty);

    // Send > 100K chars in one flush
    const bigChunk = "x".repeat(101_000);
    buffer.append(bigChunk);
    // Immediate flush due to size > 64KB
    // unackedCharCount = 101,000 > 100,000 → pause

    expect(pty.pauseCalls).toBe(1);
    expect(buffer.isPaused).toBe(true);

    buffer.dispose();
  });

  it("resumes PTY when ack brings unacked below low watermark (5K)", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("fc-2", sender, pty);

    // Build up past high watermark
    const bigChunk = "x".repeat(101_000);
    buffer.append(bigChunk);
    expect(buffer.isPaused).toBe(true);

    // Ack most of it: 101K - 97K = 4K < 5K → resume
    buffer.handleAck(97_000);

    expect(pty.resumeCalls).toBe(1);
    expect(buffer.isPaused).toBe(false);
    expect(buffer.unackedCharCount).toBe(4_000);

    buffer.dispose();
  });

  it("does NOT resume when unacked is still above low watermark", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("fc-3", sender, pty);

    // Build up past high watermark
    const bigChunk = "x".repeat(101_000);
    buffer.append(bigChunk);
    expect(buffer.isPaused).toBe(true);

    // Partial ack: 101K - 90K = 11K, still > 5K → stay paused
    buffer.handleAck(90_000);

    expect(pty.resumeCalls).toBe(0);
    expect(buffer.isPaused).toBe(true);
    expect(buffer.unackedCharCount).toBe(11_000);

    buffer.dispose();
  });

  it("does NOT call resume when PTY is already flowing", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("fc-4", sender, pty);

    // Small data, not paused
    buffer.append("small");
    vi.advanceTimersByTime(8);

    // Ack — should NOT call resume because we're already flowing
    buffer.handleAck(5);
    expect(pty.resumeCalls).toBe(0);
    expect(buffer.isPaused).toBe(false);

    buffer.dispose();
  });

  it("clamps unackedCharCount to 0 on over-ack", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("fc-5", sender, pty);

    buffer.append("hello");
    vi.advanceTimersByTime(8);
    expect(buffer.unackedCharCount).toBe(5);

    // Ack more than what was sent
    buffer.handleAck(100);
    expect(buffer.unackedCharCount).toBe(0);

    buffer.dispose();
  });

  it("ignores negative charCount in handleAck", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("fc-7", sender, pty);

    buffer.append("hello");
    vi.advanceTimersByTime(8);
    expect(buffer.unackedCharCount).toBe(5);

    buffer.handleAck(-10);
    expect(buffer.unackedCharCount).toBe(5); // Unchanged

    buffer.dispose();
  });

  it("ignores NaN charCount in handleAck", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("fc-8", sender, pty);

    buffer.append("hello");
    vi.advanceTimersByTime(8);
    expect(buffer.unackedCharCount).toBe(5);

    buffer.handleAck(Number.NaN);
    expect(buffer.unackedCharCount).toBe(5); // Unchanged

    buffer.dispose();
  });

  it("ignores Infinity charCount in handleAck", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("fc-9", sender, pty);

    buffer.append("hello");
    vi.advanceTimersByTime(8);
    expect(buffer.unackedCharCount).toBe(5);

    buffer.handleAck(Number.POSITIVE_INFINITY);
    expect(buffer.unackedCharCount).toBe(5); // Unchanged

    buffer.dispose();
  });

  it("tracks unacked across multiple flushes", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("fc-6", sender, pty);

    buffer.append("aaa"); // 3 chars
    vi.advanceTimersByTime(8);
    expect(buffer.unackedCharCount).toBe(3);

    buffer.append("bbbbb"); // 5 chars
    vi.advanceTimersByTime(8);
    expect(buffer.unackedCharCount).toBe(8);

    buffer.handleAck(3);
    expect(buffer.unackedCharCount).toBe(5);

    buffer.dispose();
  });
});

// ─── Disposal ───────────────────────────────────────────────────────

describe("OutputBuffer disposal", () => {
  it("clears flush timer on dispose", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("d-1", sender, pty);

    buffer.append("data");
    buffer.dispose();

    // Advance time — no flush should occur after dispose
    const messageCountAfterDispose = sender.messages.length;
    vi.advanceTimersByTime(100);
    // The dispose flush may have sent one message, but no further ones
    expect(sender.messages.length).toBe(messageCountAfterDispose);
  });

  it("flushes remaining data on dispose (best-effort)", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("d-2", sender, pty);

    buffer.append("final data");
    buffer.dispose();

    // Should have flushed the remaining data
    expect(sender.messages).toHaveLength(1);
    expect(sender.messages[0]).toEqual({ type: "output", tabId: "d-2", data: "final data" });
  });

  it("resets all state on dispose", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("d-3", sender, pty);

    buffer.append("data");
    vi.advanceTimersByTime(8);
    buffer.dispose();

    expect(buffer.unackedCharCount).toBe(0);
    expect(buffer.isPaused).toBe(false);
  });

  it("ignores append after dispose", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("d-4", sender, pty);

    buffer.dispose();
    buffer.append("should be ignored");

    vi.advanceTimersByTime(100);
    expect(sender.messages).toHaveLength(0);
  });

  it("ignores handleAck after dispose", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("d-5", sender, pty);

    buffer.dispose();
    buffer.handleAck(1000); // Should not throw
    expect(buffer.unackedCharCount).toBe(0);
  });

  it("is idempotent (second dispose is no-op)", () => {
    const sender = createMockSender();
    const pty = createMockPty();
    const buffer = new OutputBuffer("d-6", sender, pty);

    buffer.append("data");
    buffer.dispose();
    buffer.dispose(); // Should not throw or double-flush

    expect(sender.messages).toHaveLength(1); // Only one flush from first dispose
  });
});

// ─── postMessage error handling ─────────────────────────────────────

describe("OutputBuffer postMessage error handling", () => {
  it("does not throw when postMessage throws (webview disposed)", () => {
    const sender: MessageSender = {
      postMessage(): Thenable<boolean> {
        throw new Error("Webview disposed");
      },
    };
    const pty = createMockPty();
    const buffer = new OutputBuffer("err-1", sender, pty);

    buffer.append("data");

    // Should not throw
    expect(() => {
      vi.advanceTimersByTime(8);
    }).not.toThrow();

    buffer.dispose();
  });

  it("does not throw when postMessage throws during dispose", () => {
    const sender: MessageSender = {
      postMessage(): Thenable<boolean> {
        throw new Error("Webview disposed");
      },
    };
    const pty = createMockPty();
    const buffer = new OutputBuffer("err-2", sender, pty);

    buffer.append("data");

    // Dispose should not throw even though postMessage fails
    expect(() => {
      buffer.dispose();
    }).not.toThrow();
  });
});
