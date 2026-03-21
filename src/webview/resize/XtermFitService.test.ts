// @vitest-environment jsdom
// src/webview/resize/XtermFitService.test.ts — Unit tests for XtermFitService

import type { Terminal } from "@xterm/xterm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockTerminal } from "../test-utils/mockTerminal";
import { fitTerminal } from "./XtermFitService";

// ─── Helpers ────────────────────────────────────────────────────────

let parent: HTMLDivElement;

function mockParentRect(width: number, height: number): void {
  vi.spyOn(parent, "getBoundingClientRect").mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
}

beforeEach(() => {
  parent = document.createElement("div");
  document.body.appendChild(parent);

  // Default: mock getComputedStyle to return 0 padding
  vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
    return {
      getPropertyValue(_prop: string): string {
        return "0";
      },
    } as CSSStyleDeclaration;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// ─── Tests ──────────────────────────────────────────────────────────

describe("fitTerminal", () => {
  it("calculates correct cols and rows from parent size and cell dimensions", () => {
    // Cell: 10x20, parent: 200x400, scrollbar 14 (default scrollback > 0)
    const term = createMockTerminal({ cellWidth: 10, cellHeight: 20, cols: 0, rows: 0 });
    mockParentRect(200, 400);

    const result = fitTerminal(term as unknown as Terminal, parent);

    // availableWidth = 200 - 0 - 0 - 14 = 186, cols = floor(186/10) = 18
    // availableHeight = 400, rows = floor(400/20) = 20
    expect(result).toEqual({ cols: 18, rows: 20 });
  });

  it("returns null when terminal element is undefined", () => {
    const term = createMockTerminal();
    term.element = undefined;
    mockParentRect(200, 400);

    expect(fitTerminal(term as unknown as Terminal, parent)).toBeNull();
  });

  it("returns null when render service dimensions are missing", () => {
    const term = createMockTerminal();
    (term as any)._core._renderService = undefined;
    mockParentRect(200, 400);

    expect(fitTerminal(term as unknown as Terminal, parent)).toBeNull();
  });

  it("returns null when cell dimensions are zero", () => {
    const term = createMockTerminal({ cellWidth: 0, cellHeight: 0 });
    mockParentRect(200, 400);

    expect(fitTerminal(term as unknown as Terminal, parent)).toBeNull();
  });

  it("returns null when parent rect dimensions are zero", () => {
    const term = createMockTerminal({ cols: 0, rows: 0 });
    mockParentRect(0, 0);

    expect(fitTerminal(term as unknown as Terminal, parent)).toBeNull();
  });

  it("returns null when calculated dims match current terminal dims (no-op)", () => {
    // Cell: 10x20, parent: 200x400, scrollbar 14
    // cols = floor(186/10) = 18, rows = floor(400/20) = 20
    const term = createMockTerminal({ cellWidth: 10, cellHeight: 20, cols: 18, rows: 20 });
    mockParentRect(200, 400);

    expect(fitTerminal(term as unknown as Terminal, parent)).toBeNull();
  });

  it("enforces minimum dimensions (cols >= 2, rows >= 1)", () => {
    // Tiny parent: 5x5 with cell 10x20 => floor(5-14/10) < 2, floor(5/20) < 1
    const term = createMockTerminal({ cellWidth: 10, cellHeight: 20, cols: 0, rows: 0, scrollback: 0 });
    mockParentRect(5, 5);

    const result = fitTerminal(term as unknown as Terminal, parent);

    // scrollback=0 so scrollbar=0, availableWidth=5, floor(5/10)=0, max(2,0)=2
    // availableHeight=5, floor(5/20)=0, max(1,0)=1
    expect(result).toEqual({ cols: 2, rows: 1 });
  });

  it("calls _renderService.clear() when resize is needed", () => {
    const term = createMockTerminal({ cellWidth: 10, cellHeight: 20, cols: 0, rows: 0 });
    mockParentRect(200, 400);

    fitTerminal(term as unknown as Terminal, parent);

    expect(term._core._renderService.clear).toHaveBeenCalledTimes(1);
  });

  it("uses scrollbarWidth=0 when scrollback is 0", () => {
    // scrollback=0 removes scrollbar (14px savings)
    const term = createMockTerminal({ cellWidth: 10, cellHeight: 20, cols: 0, rows: 0, scrollback: 0 });
    mockParentRect(200, 400);

    const result = fitTerminal(term as unknown as Terminal, parent);

    // availableWidth = 200 - 0 - 0 - 0 = 200, cols = floor(200/10) = 20
    // availableHeight = 400, rows = floor(400/20) = 20
    expect(result).toEqual({ cols: 20, rows: 20 });
  });
});
