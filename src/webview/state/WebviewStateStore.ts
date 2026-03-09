// src/webview/state/WebviewStateStore.ts — Centralized webview state management
//
// Owns all mutable UI state previously scattered as module-level variables in main.ts.
// Exposes state through public properties and mutations through named methods.
//
// See: docs/PLAN.md#8.5

import type { Terminal } from "@xterm/xterm";
import type { TerminalConfig } from "../../types/messages";
import type { SplitNode } from "../SplitModel";
import { getAllSessionIds } from "../SplitModel";

// ─── Types ──────────────────────────────────────────────────────────

/** A single terminal instance with its addons and DOM container. */
export interface TerminalInstance {
  id: string;
  name: string;
  terminal: Terminal;
  container: HTMLDivElement;
  /** Whether the PTY process has exited (terminal becomes read-only). */
  exited: boolean;
}

/** Minimal VS Code API interface for state persistence. */
interface VsCodeStateApi {
  getState(): unknown;
  setState(state: unknown): void;
}

// ─── WebviewStateStore ──────────────────────────────────────────────

/**
 * Centralized store for webview mutable state.
 *
 * Owns:
 * - `terminals` — all terminal instances keyed by session/tab ID
 * - `tabLayouts` — split layout tree per tab
 * - `tabActivePaneIds` — active pane per tab
 * - `resizeCleanups` — resize handle cleanup functions per tab
 * - `activeTabId` — currently visible tab
 * - `currentConfig` — terminal config from settings
 *
 * Does NOT own business logic (e.g., removeTerminal, switchTab).
 * Orchestration stays in main.ts (future composition root).
 */
export class WebviewStateStore {
  /** All terminal instances keyed by session/tab ID. */
  readonly terminals = new Map<string, TerminalInstance>();

  /** Split layout tree per tab — maps tab ID to its root SplitNode. */
  readonly tabLayouts = new Map<string, SplitNode>();

  /** Active pane ID per tab — tracks which pane is focused in a split layout. */
  readonly tabActivePaneIds = new Map<string, string>();

  /** Cleanup functions for resize handles — keyed by tab ID. */
  readonly resizeCleanups = new Map<string, (() => void)[]>();

  /** Currently active (visible) terminal tab ID. */
  activeTabId: string | null = null;

  /** Current terminal config — set from init, updated by configUpdate. */
  currentConfig: TerminalConfig = {
    fontSize: 14,
    cursorBlink: true,
    scrollback: 10000,
    fontFamily: "",
  };

  private readonly vscodeApi: VsCodeStateApi;

  constructor(vscodeApi: VsCodeStateApi) {
    this.vscodeApi = vscodeApi;
  }

  /** Set the active tab ID. */
  setActiveTab(tabId: string | null): void {
    this.activeTabId = tabId;
  }

  /** Set the split layout for a tab. */
  setLayout(tabId: string, layout: SplitNode): void {
    this.tabLayouts.set(tabId, layout);
  }

  /** Delete the split layout for a tab. */
  deleteLayout(tabId: string): void {
    this.tabLayouts.delete(tabId);
  }

  /** Set the active pane ID for a tab. */
  setActivePaneId(tabId: string, paneId: string): void {
    this.tabActivePaneIds.set(tabId, paneId);
  }

  /** Get the active pane ID for a tab. Falls back to tabId if no active pane is set. */
  getActivePaneId(tabId: string): string {
    return this.tabActivePaneIds.get(tabId) ?? tabId;
  }

  /**
   * Persist layout state to vscode.setState().
   * Serializes tabLayouts and tabActivePaneIds into the VS Code state store.
   */
  persist(): void {
    const layouts: Record<string, SplitNode> = {};
    for (const [tabId, layout] of this.tabLayouts) {
      layouts[tabId] = layout;
    }
    const activePaneIds: Record<string, string> = {};
    for (const [tabId, paneId] of this.tabActivePaneIds) {
      activePaneIds[tabId] = paneId;
    }
    const currentState = (this.vscodeApi.getState() as Record<string, unknown>) ?? {};
    this.vscodeApi.setState({ ...currentState, tabLayouts: layouts, tabActivePaneIds: activePaneIds });
  }

  /**
   * Restore layout state from vscode.getState().
   * Returns a map of restored layouts. Also restores tabActivePaneIds.
   * Returns empty map if missing/malformed.
   */
  restore(): Map<string, SplitNode> {
    const restored = new Map<string, SplitNode>();
    try {
      const state = this.vscodeApi.getState() as Record<string, unknown> | null;
      if (state && typeof state.tabLayouts === "object" && state.tabLayouts !== null) {
        const layouts = state.tabLayouts as Record<string, SplitNode>;
        for (const [tabId, layout] of Object.entries(layouts)) {
          if (layout && typeof layout === "object" && "type" in layout) {
            restored.set(tabId, layout);
          }
        }
      }
      // Restore active pane IDs
      if (state && typeof state.tabActivePaneIds === "object" && state.tabActivePaneIds !== null) {
        const paneIds = state.tabActivePaneIds as Record<string, string>;
        for (const [tabId, paneId] of Object.entries(paneIds)) {
          if (typeof paneId === "string") {
            // Validate that the pane still exists in the layout
            const layout = restored.get(tabId);
            if (layout) {
              const allIds = getAllSessionIds(layout);
              if (allIds.includes(paneId)) {
                this.tabActivePaneIds.set(tabId, paneId);
              }
              // If pane no longer exists, fallback to first leaf (handled by getActivePaneId)
            }
          }
        }
      }
    } catch {
      // Fallback: return empty map
    }
    return restored;
  }
}
