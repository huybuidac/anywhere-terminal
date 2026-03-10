// src/webview/test-utils/mockTerminal.ts — Shared xterm Terminal mock for webview tests
//
// Provides a lightweight mock matching the Terminal interface subset used by
// BannerService, ThemeManager, XtermFitService, ResizeCoordinator, FlowControl,
// and WebviewStateStore.

import { vi } from "vitest";

/** Subset of xterm Terminal used across webview modules. */
export interface MockTerminal {
  element: HTMLDivElement | undefined;
  options: {
    theme?: Record<string, string | undefined>;
    minimumContrastRatio?: number;
    fontSize?: number;
    scrollback?: number;
    fontFamily?: string;
    overviewRuler?: { width: number };
  };
  rows: number;
  cols: number;
  _core: {
    _renderService: {
      dimensions: {
        css: {
          cell: { width: number; height: number };
        };
      };
      clear: ReturnType<typeof vi.fn>;
    };
  };
  write: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock Terminal object satisfying the interface subset used by all webview modules.
 *
 * Default cell dimensions: 10x20 (width x height).
 * Default terminal size: 80 cols x 24 rows.
 * `write` calls its callback synchronously if provided.
 */
export function createMockTerminal(
  overrides: Partial<{
    rows: number;
    cols: number;
    cellWidth: number;
    cellHeight: number;
    scrollback: number;
  }> = {},
): MockTerminal {
  const { rows = 24, cols = 80, cellWidth = 10, cellHeight = 20, scrollback = 10000 } = overrides;
  const element = document.createElement("div");

  return {
    element,
    options: {
      theme: undefined,
      minimumContrastRatio: undefined,
      fontSize: 14,
      scrollback,
      fontFamily: "",
      overviewRuler: undefined,
    },
    rows,
    cols,
    _core: {
      _renderService: {
        dimensions: {
          css: {
            cell: { width: cellWidth, height: cellHeight },
          },
        },
        clear: vi.fn(),
      },
    },
    write: vi.fn((_data: string, callback?: () => void) => {
      if (callback) {
        callback();
      }
    }),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
}
