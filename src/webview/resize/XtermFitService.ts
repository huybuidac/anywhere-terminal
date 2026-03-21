// src/webview/resize/XtermFitService.ts — Terminal fit calculation
//
// Isolates all xterm private API access (_core._renderService) into a single module.
// Returns computed dimensions without performing the resize — the caller decides.
//
// See: docs/design/resize-handling.md

import type { Terminal } from "@xterm/xterm";

/**
 * Calculate the optimal cols/rows for a terminal based on its parent container size.
 *
 * Uses getBoundingClientRect() for actual rendered pixel dimensions instead of
 * getComputedStyle(), which can return stale values during CSS flex layout transitions
 * (e.g., sidebar expand). Matches VS Code's own approach in xtermTerminal.ts.
 *
 * All xterm private API access (_core._renderService) is isolated here.
 *
 * @returns `{ cols, rows }` if a resize is needed, or `null` if no resize is necessary.
 */
export function fitTerminal(terminal: Terminal, parentElement: HTMLElement): { cols: number; rows: number } | null {
  const element = terminal.element;
  if (!element) {
    return null;
  }

  const core = (terminal as any)._core; // xterm private API — intentional
  const dims = core?._renderService?.dimensions;
  if (!dims || dims.css.cell.width === 0 || dims.css.cell.height === 0) {
    return null;
  }

  // Use getBoundingClientRect for actual rendered dimensions (not stale getComputedStyle)
  const parentRect = parentElement.getBoundingClientRect();
  if (parentRect.width === 0 || parentRect.height === 0) {
    return null;
  }

  // Account for xterm element padding
  const xtermStyle = window.getComputedStyle(element);
  const paddingTop = Number.parseInt(xtermStyle.getPropertyValue("padding-top"), 10) || 0;
  const paddingBottom = Number.parseInt(xtermStyle.getPropertyValue("padding-bottom"), 10) || 0;
  const paddingLeft = Number.parseInt(xtermStyle.getPropertyValue("padding-left"), 10) || 0;
  const paddingRight = Number.parseInt(xtermStyle.getPropertyValue("padding-right"), 10) || 0;

  // Scrollbar width: same logic as FitAddon — scrollback=0 -> 0, else overviewRuler.width || 14
  const scrollbarWidth = terminal.options.scrollback === 0 ? 0 : terminal.options.overviewRuler?.width || 14;

  const availableHeight = parentRect.height - paddingTop - paddingBottom;
  const availableWidth = parentRect.width - paddingLeft - paddingRight - scrollbarWidth;

  const cols = Math.max(2, Math.floor(availableWidth / dims.css.cell.width));
  const rows = Math.max(1, Math.floor(availableHeight / dims.css.cell.height));

  // Only resize if dimensions actually changed
  if (terminal.rows === rows && terminal.cols === cols) {
    return null;
  }

  core?._renderService?.clear();
  return { cols, rows };
}
