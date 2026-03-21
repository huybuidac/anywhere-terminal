// src/webview/resize/ResizeCoordinator.ts — Resize coordination and policy
//
// Coordinates ResizeObserver events, debounce timers, visibility state,
// location inference, and fit delegation. Owns resize policy — when to fit,
// when to defer, when to skip.
//
// See: docs/design/resize-handling.md

import type { Terminal } from "@xterm/xterm";
import type { SplitNode } from "../SplitModel";
import { getAllSessionIds } from "../SplitModel";

// ─── Types ──────────────────────────────────────────────────────────

/** Terminal location for resize-based inference. */
type TerminalLocation = "panel" | "sidebar";

/** Minimal terminal instance interface for fit operations. */
interface FittableInstance {
  terminal: Terminal;
  container: HTMLDivElement;
}

/** State accessor callback — provides current state without direct dependency on the store. */
interface ResizeState {
  activeTabId: string | null;
  terminals: Map<string, FittableInstance>;
  tabLayouts: Map<string, SplitNode>;
}

// ─── Constants ──────────────────────────────────────────────────────

/** Resize debounce interval in milliseconds. */
const RESIZE_DEBOUNCE_MS = 100;

// ─── ResizeCoordinator ──────────────────────────────────────────────

/**
 * Coordinates resize observation, debouncing, visibility state, and fit delegation.
 *
 * Owns:
 * - `pendingResize` — whether a resize was deferred because the container was invisible
 * - `fitTimeout` — debounce timer for window resize events
 * - `splitFitTimeout` — debounce timer for split-pane resize events
 * - `observer` — ResizeObserver instance
 *
 * Does NOT own: ThemeManager or terminal instances. Communicates location changes
 * via the injected `onLocationChange` callback.
 */
export class ResizeCoordinator {
  private pendingResize = false;
  private fitTimeout: number | undefined;
  private splitFitTimeout: number | undefined;
  private observer: ResizeObserver | undefined;

  private readonly fitTerminal: (instance: FittableInstance) => void;
  private readonly getState: () => ResizeState;
  private readonly onLocationChange: (location: TerminalLocation) => void;

  constructor(
    fitTerminal: (instance: FittableInstance) => void,
    getState: () => ResizeState,
    onLocationChange: (location: TerminalLocation) => void,
  ) {
    this.fitTerminal = fitTerminal;
    this.getState = getState;
    this.onLocationChange = onLocationChange;
  }

  /**
   * Set up ResizeObserver on the terminal container element.
   * See: docs/design/resize-handling.md#§3
   */
  setup(container: HTMLElement): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;

        // Skip if container is not visible (collapsed)
        if (width === 0 || height === 0) {
          this.pendingResize = true;
          return;
        }

        this.onLocationChange(ResizeCoordinator.inferLocationFromSize(width, height));

        this.debouncedFit();
      }
    });

    this.observer.observe(container);
  }

  /**
   * Debounced fit: resets timer on each call, fits after RESIZE_DEBOUNCE_MS quiet period.
   * Fits all leaf terminals in the active tab's split tree.
   * Uses requestAnimationFrame to ensure the browser has computed new layout dimensions.
   */
  debouncedFit(): void {
    clearTimeout(this.fitTimeout);
    this.fitTimeout = window.setTimeout(() => {
      requestAnimationFrame(() => {
        this.fitAllTerminals();
      });
    }, RESIZE_DEBOUNCE_MS);
  }

  /**
   * Debounced fit for all leaf terminals in a tab.
   */
  debouncedFitAllLeaves(tabId: string): void {
    clearTimeout(this.splitFitTimeout);
    this.splitFitTimeout = window.setTimeout(() => {
      const { tabLayouts, terminals } = this.getState();
      const layout = tabLayouts.get(tabId);
      if (!layout) {
        return;
      }
      const sessionIds = getAllSessionIds(layout);
      for (const sessionId of sessionIds) {
        const instance = terminals.get(sessionId);
        if (instance) {
          this.fitTerminal(instance);
        }
      }
    }, RESIZE_DEBOUNCE_MS);
  }

  /**
   * Handle view becoming visible — flush deferred resize.
   * See: docs/design/resize-handling.md#§5
   */
  onViewShow(): void {
    if (this.pendingResize) {
      this.pendingResize = false;
      requestAnimationFrame(() => {
        const { activeTabId, tabLayouts, terminals } = this.getState();
        if (!activeTabId) {
          return;
        }
        const layout = tabLayouts.get(activeTabId);
        if (layout) {
          const sessionIds = getAllSessionIds(layout);
          for (const sessionId of sessionIds) {
            const instance = terminals.get(sessionId);
            if (instance) {
              this.fitTerminal(instance);
            }
          }
        } else {
          const instance = terminals.get(activeTabId);
          if (instance) {
            this.fitTerminal(instance);
          }
        }
      });
    }
  }

  /** Disconnect the ResizeObserver and clear timers. */
  dispose(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
    }
    clearTimeout(this.fitTimeout);
    clearTimeout(this.splitFitTimeout);
  }

  /**
   * Immediately fit all visible terminals in the active tab.
   */
  private fitAllTerminals(): void {
    const { activeTabId, tabLayouts, terminals } = this.getState();
    if (!activeTabId) {
      return;
    }
    const layout = tabLayouts.get(activeTabId);
    if (layout) {
      // Fit all leaves in the split tree
      const sessionIds = getAllSessionIds(layout);
      for (const sessionId of sessionIds) {
        const instance = terminals.get(sessionId);
        if (instance) {
          this.fitTerminal(instance);
        }
      }
    } else {
      // Fallback: fit single terminal
      const instance = terminals.get(activeTabId);
      if (instance) {
        this.fitTerminal(instance);
      }
    }
  }

  /** Choose location by container aspect ratio when views are moved. */
  private static inferLocationFromSize(width: number, height: number): TerminalLocation {
    return width > height * 1.2 ? "panel" : "sidebar";
  }
}
