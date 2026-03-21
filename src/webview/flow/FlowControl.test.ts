// src/webview/flow/FlowControl.test.ts — Unit tests for FlowControl

import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowControl } from "./FlowControl";

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────

describe("FlowControl", () => {
  it("does not send ack when accumulated chars are below threshold (5000)", () => {
    const postMessage = vi.fn();
    const fc = new FlowControl(postMessage);

    fc.ackChars(4999, "tab-1");

    expect(postMessage).not.toHaveBeenCalled();
  });

  it("sends ack when accumulated chars reach the threshold", () => {
    const postMessage = vi.fn();
    const fc = new FlowControl(postMessage);

    fc.ackChars(4999, "tab-1");
    expect(postMessage).not.toHaveBeenCalled();

    fc.ackChars(1, "tab-1");
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      type: "ack",
      charCount: 5000,
      tabId: "tab-1",
    });
  });

  it("sends ack immediately when a single call exceeds the threshold", () => {
    const postMessage = vi.fn();
    const fc = new FlowControl(postMessage);

    fc.ackChars(7000, "tab-1");

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      type: "ack",
      charCount: 7000,
      tabId: "tab-1",
    });
  });

  it("resets accumulator after ack and starts counting again", () => {
    const postMessage = vi.fn();
    const fc = new FlowControl(postMessage);

    fc.ackChars(5000, "tab-1");
    expect(postMessage).toHaveBeenCalledTimes(1);

    // After ack, accumulator resets to 0
    fc.ackChars(3000, "tab-1");
    expect(postMessage).toHaveBeenCalledTimes(1); // no second ack yet

    fc.ackChars(2000, "tab-1");
    expect(postMessage).toHaveBeenCalledTimes(2); // second ack
  });

  it("delete removes session tracking", () => {
    const postMessage = vi.fn();
    const fc = new FlowControl(postMessage);

    fc.ackChars(4000, "tab-1");
    fc.delete("tab-1");

    // After delete, accumulation should restart from zero
    fc.ackChars(4000, "tab-1");
    expect(postMessage).not.toHaveBeenCalled();

    fc.ackChars(1000, "tab-1");
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      type: "ack",
      charCount: 5000,
      tabId: "tab-1",
    });
  });

  it("tracks sessions independently (multi-session)", () => {
    const postMessage = vi.fn();
    const fc = new FlowControl(postMessage);

    fc.ackChars(3000, "tab-1");
    fc.ackChars(4000, "tab-2");

    expect(postMessage).not.toHaveBeenCalled();

    // tab-1 crosses threshold
    fc.ackChars(2000, "tab-1");
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      type: "ack",
      charCount: 5000,
      tabId: "tab-1",
    });

    // tab-2 should still be at 4000
    fc.ackChars(999, "tab-2");
    expect(postMessage).toHaveBeenCalledTimes(1);

    fc.ackChars(1, "tab-2");
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenLastCalledWith({
      type: "ack",
      charCount: 5000,
      tabId: "tab-2",
    });
  });
});
