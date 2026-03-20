// @vitest-environment jsdom
// src/webview/DragDropHandler.test.ts — Unit tests for DragDropHandler
//
// Tests path escaping, DataTransfer extraction, and drag-drop handler lifecycle.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DragDropHandler, escapePathForShell, extractPathsFromDrop } from "./DragDropHandler";

// ─── 1. Path Escaping ───────────────────────────────────────────────
// Port of VS Code's escapeNonWindowsPath() — default POSIX shell (bash/zsh)

describe("escapePathForShell", () => {
  it("wraps a simple path in single quotes", () => {
    expect(escapePathForShell("/Users/me/project/file.txt")).toBe("'/Users/me/project/file.txt'");
  });

  it("wraps a path with spaces in single quotes", () => {
    expect(escapePathForShell("/Users/me/My Documents/file.txt")).toBe("'/Users/me/My Documents/file.txt'");
  });

  it("escapes single quotes using POSIX break-and-escape pattern", () => {
    // POSIX correct: end quote, escaped quote, restart quote: '\''
    // '/Users/me/it' + \' + 's a file.txt' → '/Users/me/it'\''s a file.txt'
    expect(escapePathForShell("/Users/me/it's a file.txt")).toBe("'/Users/me/it'\\''s a file.txt'");
  });

  it("strips dangerous shell metacharacters before quoting", () => {
    // $ is stripped, then result is single-quoted
    expect(escapePathForShell("/Users/me/file$(echo evil).txt")).toBe("'/Users/me/file(echo evil).txt'");
  });

  it("uses ANSI-C quoting for paths with both single and double quotes", () => {
    // Both ' and " present → $'...' with \' for single quotes
    expect(escapePathForShell('/Users/me/it\'s a "file".txt')).toBe("$'/Users/me/it\\'s a \"file\".txt'");
  });

  it("escapes backslashes", () => {
    expect(escapePathForShell("/Users/me/path\\with\\backslashes")).toBe("'/Users/me/path\\\\with\\\\backslashes'");
  });

  it("handles path with only double quotes (no single quotes)", () => {
    // No single quotes → noSingleQuotes branch → simple single-quote wrap
    expect(escapePathForShell('/Users/me/a "file".txt')).toBe("'/Users/me/a \"file\".txt'");
  });

  it("strips multiple dangerous characters", () => {
    expect(escapePathForShell("/tmp/file`cmd`$VAR|pipe&bg>out~home#comment!not^caret*glob;semi<in")).toBe(
      "'/tmp/filecmdVARpipebgouthomecommentnotcaretglobsemiin'",
    );
  });
});

// ─── 2. Path Extraction ─────────────────────────────────────────────
// Multi-strategy extraction from DataTransfer, matching VS Code priority order

/** Helper: create a mock DataTransfer with specified data and files. */
function mockDataTransfer(
  data: Record<string, string> = {},
  files: Array<{ name: string; path?: string }> = [],
): DataTransfer {
  return {
    getData: (type: string) => data[type] ?? "",
    files: files as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: Object.keys(data),
    dropEffect: "none",
    effectAllowed: "all",
    setData: vi.fn(),
    setDragImage: vi.fn(),
    clearData: vi.fn(),
  } as unknown as DataTransfer;
}

describe("extractPathsFromDrop", () => {
  it("extracts path from ResourceURLs (strategy 1)", () => {
    const dt = mockDataTransfer({
      ResourceURLs: JSON.stringify(["file:///Users/me/project/src/index.ts"]),
    });
    expect(extractPathsFromDrop(dt)).toEqual(["/Users/me/project/src/index.ts"]);
  });

  it("decodes percent-encoded URIs (e.g., %20 → space)", () => {
    const dt = mockDataTransfer({
      ResourceURLs: JSON.stringify(["file:///Users/me/My%20Documents/file.txt"]),
    });
    expect(extractPathsFromDrop(dt)).toEqual(["/Users/me/My Documents/file.txt"]);
  });

  it("extracts paths from CodeFiles (strategy 2)", () => {
    const dt = mockDataTransfer({
      CodeFiles: JSON.stringify(["/Users/me/Downloads/report.pdf"]),
    });
    expect(extractPathsFromDrop(dt)).toEqual(["/Users/me/Downloads/report.pdf"]);
  });

  it("extracts paths from text/uri-list (strategy 3)", () => {
    const dt = mockDataTransfer({
      "text/uri-list": "file:///Users/me/file.txt\nfile:///Users/me/other.txt",
    });
    expect(extractPathsFromDrop(dt)).toEqual(["/Users/me/file.txt", "/Users/me/other.txt"]);
  });

  it("extracts path from File.path (strategy 4, Electron non-standard)", () => {
    const dt = mockDataTransfer({}, [{ name: "report.pdf", path: "/Users/me/Downloads/report.pdf" }]);
    expect(extractPathsFromDrop(dt)).toEqual(["/Users/me/Downloads/report.pdf"]);
  });

  it("extracts path from text/plain if starts with / (strategy 5)", () => {
    const dt = mockDataTransfer({ "text/plain": "/Users/me/file.txt" });
    expect(extractPathsFromDrop(dt)).toEqual(["/Users/me/file.txt"]);
  });

  it("ignores text/plain that does not start with /", () => {
    const dt = mockDataTransfer({ "text/plain": "not a path" });
    expect(extractPathsFromDrop(dt)).toEqual([]);
  });

  it("falls through on malformed JSON in ResourceURLs", () => {
    const dt = mockDataTransfer({
      ResourceURLs: "{invalid json",
      "text/plain": "/fallback/path.txt",
    });
    expect(extractPathsFromDrop(dt)).toEqual(["/fallback/path.txt"]);
  });

  it("respects strategy precedence — first success wins", () => {
    const dt = mockDataTransfer({
      ResourceURLs: JSON.stringify(["file:///Users/me/from-resources.txt"]),
      "text/plain": "/Users/me/from-plain.txt",
    });
    expect(extractPathsFromDrop(dt)).toEqual(["/Users/me/from-resources.txt"]);
  });

  it("returns empty array when no path data available", () => {
    const dt = mockDataTransfer();
    expect(extractPathsFromDrop(dt)).toEqual([]);
  });

  it("handles multiple files from ResourceURLs", () => {
    const dt = mockDataTransfer({
      ResourceURLs: JSON.stringify([
        "file:///Users/me/file1.txt",
        "file:///Users/me/file2.txt",
        "file:///Users/me/file3.txt",
      ]),
    });
    expect(extractPathsFromDrop(dt)).toEqual(["/Users/me/file1.txt", "/Users/me/file2.txt", "/Users/me/file3.txt"]);
  });

  it("skips non-file URIs in text/uri-list", () => {
    const dt = mockDataTransfer({
      "text/uri-list": "https://example.com\nfile:///Users/me/file.txt",
    });
    expect(extractPathsFromDrop(dt)).toEqual(["/Users/me/file.txt"]);
  });

  it("falls through when ResourceURLs is valid JSON but not an array", () => {
    const dt = mockDataTransfer({
      ResourceURLs: '"not-an-array"',
      "text/plain": "/fallback.txt",
    });
    expect(extractPathsFromDrop(dt)).toEqual(["/fallback.txt"]);
  });

  it("falls through when CodeFiles is valid JSON but not an array", () => {
    const dt = mockDataTransfer({
      CodeFiles: '{"not": "an-array"}',
      "text/plain": "/fallback.txt",
    });
    expect(extractPathsFromDrop(dt)).toEqual(["/fallback.txt"]);
  });
});

// ─── 3. DragDropHandler Class ───────────────────────────────────────
// Integration tests for event listener wiring, overlay lifecycle, and drop→postMessage flow

/** Helper: create a DragEvent with mock dataTransfer. */
function makeDragEvent(
  type: string,
  opts: {
    dataTransfer?: DataTransfer;
    relatedTarget?: EventTarget | null;
    shiftKey?: boolean;
  } = {},
): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: opts.dataTransfer ?? mockDataTransfer() });
  Object.defineProperty(event, "shiftKey", { value: opts.shiftKey ?? false });
  if (opts.relatedTarget !== undefined) {
    Object.defineProperty(event, "relatedTarget", { value: opts.relatedTarget });
  }
  return event;
}

describe("DragDropHandler", () => {
  let container: HTMLDivElement;
  let postMessage: (msg: unknown) => void;
  let handler: DragDropHandler;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    postMessage = vi.fn();
    handler = new DragDropHandler({
      postMessage,
      getActiveSessionId: () => "session-1",
      getTerminalExited: () => false,
    });
    handler.setup(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("shows overlay on dragenter", () => {
    container.dispatchEvent(makeDragEvent("dragenter"));
    const overlay = container.querySelector(".terminal-drop-overlay");
    expect(overlay).not.toBeNull();
  });

  it("removes overlay on dragleave when target leaves container", () => {
    container.dispatchEvent(makeDragEvent("dragenter"));
    expect(container.querySelector(".terminal-drop-overlay")).not.toBeNull();

    // Simulate dragleave where relatedTarget is outside container
    container.dispatchEvent(makeDragEvent("dragleave", { relatedTarget: document.body }));
    expect(container.querySelector(".terminal-drop-overlay")).toBeNull();
  });

  it("keeps overlay when dragleave target is a child element", () => {
    const child = document.createElement("div");
    container.appendChild(child);
    container.dispatchEvent(makeDragEvent("dragenter"));
    expect(container.querySelector(".terminal-drop-overlay")).not.toBeNull();

    // relatedTarget is still inside the container → should NOT remove overlay
    container.dispatchEvent(makeDragEvent("dragleave", { relatedTarget: child }));
    expect(container.querySelector(".terminal-drop-overlay")).not.toBeNull();
  });

  it("removes overlay and posts input message on Shift+drop with file path", () => {
    container.dispatchEvent(makeDragEvent("dragenter"));
    expect(container.querySelector(".terminal-drop-overlay")).not.toBeNull();

    const dt = mockDataTransfer({ "text/plain": "/Users/me/file.txt" });
    container.dispatchEvent(makeDragEvent("drop", { dataTransfer: dt, shiftKey: true }));

    // Overlay removed
    expect(container.querySelector(".terminal-drop-overlay")).toBeNull();
    // postMessage called with escaped path + trailing space, using session ID
    expect(postMessage).toHaveBeenCalledWith({
      type: "input",
      tabId: "session-1",
      data: "'/Users/me/file.txt' ",
    });
  });

  it("does not post message on drop without Shift key", () => {
    const dt = mockDataTransfer({ "text/plain": "/Users/me/file.txt" });
    container.dispatchEvent(makeDragEvent("drop", { dataTransfer: dt, shiftKey: false }));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("does not post message when terminal is exited", () => {
    // Use a separate container to avoid the beforeEach handler also firing
    const exitedContainer = document.createElement("div");
    document.body.appendChild(exitedContainer);
    const exitedPostMessage = vi.fn() as unknown as (msg: unknown) => void;
    const exitedHandler = new DragDropHandler({
      postMessage: exitedPostMessage,
      getActiveSessionId: () => "session-1",
      getTerminalExited: () => true,
    });
    exitedHandler.setup(exitedContainer);

    const dt = mockDataTransfer({ "text/plain": "/Users/me/file.txt" });
    exitedContainer.dispatchEvent(makeDragEvent("drop", { dataTransfer: dt }));
    expect(exitedPostMessage).not.toHaveBeenCalled();
    exitedContainer.remove();
  });

  it("does not post message when no paths extracted", () => {
    const dt = mockDataTransfer({ "text/plain": "not a path" });
    container.dispatchEvent(makeDragEvent("drop", { dataTransfer: dt }));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("joins multiple paths with spaces and adds trailing space", () => {
    const dt = mockDataTransfer({
      ResourceURLs: JSON.stringify(["file:///Users/me/a.txt", "file:///Users/me/b.txt"]),
    });
    container.dispatchEvent(makeDragEvent("drop", { dataTransfer: dt, shiftKey: true }));
    expect(postMessage).toHaveBeenCalledWith({
      type: "input",
      tabId: "session-1",
      data: "'/Users/me/a.txt' '/Users/me/b.txt' ",
    });
  });

  it("does not double-register listeners when setup() called twice", () => {
    // Call setup again on the same container
    handler.setup(container);

    // Shift+drop a file — should only fire ONE postMessage, not two
    const dt = mockDataTransfer({ "text/plain": "/Users/me/file.txt" });
    container.dispatchEvent(makeDragEvent("drop", { dataTransfer: dt, shiftKey: true }));
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("prevents default on dragover to allow drops", () => {
    const event = makeDragEvent("dragover");
    const spy = vi.spyOn(event, "preventDefault");
    container.dispatchEvent(event);
    expect(spy).toHaveBeenCalled();
  });
});
