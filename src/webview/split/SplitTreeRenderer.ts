// src/webview/split/SplitTreeRenderer.ts — Split tree rendering and pane orchestration
//
// Encapsulates split tree DOM rendering, active pane visuals,
// pane close/create orchestration, and tab container visibility.
//
// See: docs/design/xterm-integration.md, specs/split-layout-data-model/spec.md

import type { SplitPaneCreatedMessage } from "../../types/messages";
import type { FlowControl } from "../flow/FlowControl";
import type { ResizeCoordinator } from "../resize/ResizeCoordinator";
import { renderSplitTree } from "../SplitContainer";
import { createBranch, createLeaf, getAllSessionIds, removeLeaf, replaceNode, updateBranchRatio } from "../SplitModel";
import { attachResizeHandle } from "../SplitResizeHandle";
import type { WebviewStateStore } from "../state/WebviewStateStore";
import type { TerminalFactory } from "../terminal/TerminalFactory";

// ─── SplitTreeRenderer ──────────────────────────────────────────────

/** Dependencies injected into SplitTreeRenderer. */
export interface SplitTreeRendererDeps {
  store: WebviewStateStore;
  resizeCoordinator: ResizeCoordinator;
  flowControl: FlowControl;
  postMessage: (msg: unknown) => void;
  onTabBarUpdate: () => void;
}

/**
 * Manages split tree DOM rendering, active pane visuals, and pane lifecycle.
 *
 * Owns:
 * - `renderTabSplitTree()` — DOM rendering of the split layout tree
 * - `showTabContainer()` — tab container visibility
 * - `updateActivePaneVisual()` — active pane CSS class management
 * - `closeSplitPaneById()` — split pane close + cleanup orchestration
 * - `handleSplitPaneCreated()` — split pane creation orchestration
 */
export class SplitTreeRenderer {
  private readonly store: WebviewStateStore;
  private readonly resizeCoordinator: ResizeCoordinator;
  private readonly flowControl: FlowControl;
  private readonly postMessage: (msg: unknown) => void;
  private readonly onTabBarUpdate: () => void;

  constructor(deps: SplitTreeRendererDeps) {
    this.store = deps.store;
    this.resizeCoordinator = deps.resizeCoordinator;
    this.flowControl = deps.flowControl;
    this.postMessage = deps.postMessage;
    this.onTabBarUpdate = deps.onTabBarUpdate;
  }

  /**
   * Render the split tree for a tab and attach terminals to leaf containers.
   * Also attaches resize handles to branch nodes.
   */
  renderTabSplitTree(tabId: string): void {
    const layout = this.store.tabLayouts.get(tabId);
    if (!layout) {
      return;
    }

    const containerEl = document.getElementById("terminal-container");
    if (!containerEl) {
      return;
    }

    // Find or create the tab's root container
    let tabContainer = containerEl.querySelector(`[data-tab-id="${tabId}"]`) as HTMLDivElement | null;
    if (!tabContainer) {
      tabContainer = document.createElement("div");
      tabContainer.dataset.tabId = tabId;
      tabContainer.style.width = "100%";
      tabContainer.style.height = "100%";
      tabContainer.style.display = "none";
      containerEl.appendChild(tabContainer);
    }

    // Clean up existing resize handles for this tab
    const cleanups = this.store.resizeCleanups.get(tabId);
    if (cleanups) {
      for (const cleanup of cleanups) {
        cleanup();
      }
    }
    this.store.resizeCleanups.set(tabId, []);

    // Clear existing content
    tabContainer.innerHTML = "";

    // Render the split tree
    renderSplitTree(layout, tabContainer, {
      onLeafMounted: (sessionId: string, leafContainer: HTMLDivElement) => {
        const instance = this.store.terminals.get(sessionId);
        if (instance) {
          // Move the terminal's container div into the leaf
          leafContainer.appendChild(instance.container);
          instance.container.style.display = "block";
          instance.container.style.width = "100%";
          instance.container.style.height = "100%";
        }

        // Click-to-focus: update activePaneId and focus terminal
        leafContainer.addEventListener("mousedown", () => {
          if (!this.store.activeTabId) {
            return;
          }
          const currentActive = this.store.tabActivePaneIds.get(this.store.activeTabId);
          if (currentActive === sessionId) {
            return; // Already active
          }
          this.store.tabActivePaneIds.set(this.store.activeTabId, sessionId);
          this.updateActivePaneVisual(this.store.activeTabId);
          this.store.persist();

          const inst = this.store.terminals.get(sessionId);
          if (inst) {
            inst.terminal.focus();
          }

          // Update tab bar to reflect active pane name
          this.onTabBarUpdate();
        });
      },
    });

    // Attach resize handles to all branch nodes
    const handles = Array.from(tabContainer.querySelectorAll(".split-handle"));
    for (const handle of handles) {
      const handleEl = handle as HTMLDivElement;
      const branchEl = handleEl.parentElement as HTMLDivElement;
      const direction = handleEl.dataset.direction as "horizontal" | "vertical";
      const branchIndex = Number.parseInt(handleEl.dataset.branchIndex ?? "0", 10);

      const cleanup = attachResizeHandle(handleEl, branchEl, direction, {
        onRatioChange: (newRatio: number) => {
          // Update the layout tree model with the new ratio
          const currentLayout = this.store.tabLayouts.get(tabId);
          if (currentLayout) {
            const updatedLayout = updateBranchRatio(currentLayout, branchIndex, newRatio);
            this.store.tabLayouts.set(tabId, updatedLayout);
          }
          this.store.persist();
        },
        onResizeComplete: () => {
          // Fit all leaf terminals in this tab
          this.resizeCoordinator.debouncedFitAllLeaves(tabId);
        },
      });

      this.store.resizeCleanups.get(tabId)?.push(cleanup);
    }

    // Apply active pane visual indicator after rendering
    this.updateActivePaneVisual(tabId);
  }

  /**
   * Show the tab container for a given tab ID (make it visible in the DOM).
   */
  showTabContainer(tabId: string): void {
    const containerEl = document.getElementById("terminal-container");
    if (!containerEl) {
      return;
    }
    const tabContainer = containerEl.querySelector(`[data-tab-id="${tabId}"]`) as HTMLDivElement | null;
    if (tabContainer) {
      tabContainer.style.display = "flex";
    }
  }

  /**
   * Update the visual active pane indicator for a tab.
   * Adds `.active-pane` class to the active leaf, removes from all others.
   * Only applies when the tab has 2+ panes (no indicator for single-pane tabs).
   */
  updateActivePaneVisual(tabId: string): void {
    const containerEl = document.getElementById("terminal-container");
    if (!containerEl) {
      return;
    }
    const tabContainer = containerEl.querySelector(`[data-tab-id="${tabId}"]`);
    if (!tabContainer) {
      return;
    }

    const layout = this.store.tabLayouts.get(tabId);
    const hasSplits = layout && layout.type === "branch";
    const activePaneId = this.store.tabActivePaneIds.get(tabId) ?? tabId;

    // Remove active-pane from all leaves in this tab
    const leaves = Array.from(tabContainer.querySelectorAll(".split-leaf"));
    for (const leaf of leaves) {
      leaf.classList.remove("active-pane");
    }

    // Only add indicator when there are 2+ panes
    if (hasSplits) {
      const activeLeaf = tabContainer.querySelector(`.split-leaf[data-session-id="${activePaneId}"]`);
      if (activeLeaf) {
        activeLeaf.classList.add("active-pane");
      }
    }
  }

  /**
   * Hide the tab container for a given tab ID.
   */
  hideTabContainer(tabId: string): void {
    const containerEl = document.getElementById("terminal-container");
    if (!containerEl) {
      return;
    }
    const tabContainer = containerEl.querySelector(`[data-tab-id="${tabId}"]`) as HTMLDivElement | null;
    if (tabContainer) {
      tabContainer.style.display = "none";
    }
  }

  /**
   * Remove a tab's DOM container and clean up split layout state.
   * Disposes all split pane terminals (not the root terminal — caller handles that).
   * Returns the list of split session IDs that were disposed.
   */
  removeTab(tabId: string): string[] {
    // Get all session IDs in this tab's split tree before cleanup
    const layout = this.store.tabLayouts.get(tabId);
    const splitSessionIds = layout ? getAllSessionIds(layout).filter((sid) => sid !== tabId) : [];

    // Dispose all split pane terminals belonging to this tab
    for (const splitId of splitSessionIds) {
      const splitInstance = this.store.terminals.get(splitId);
      if (splitInstance) {
        splitInstance.terminal.dispose();
        splitInstance.container.remove();
        this.store.terminals.delete(splitId);
      }
      this.flowControl.delete(splitId);
      this.postMessage({ type: "requestCloseSplitPane", sessionId: splitId });
    }

    // Remove the tab container from DOM
    const containerEl = document.getElementById("terminal-container");
    if (containerEl) {
      const tabContainer = containerEl.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabContainer) {
        tabContainer.remove();
      }
    }

    // Clean up split layout and active pane tracking
    this.store.tabLayouts.delete(tabId);
    this.store.tabActivePaneIds.delete(tabId);
    const cleanups = this.store.resizeCleanups.get(tabId);
    if (cleanups) {
      for (const cleanup of cleanups) {
        cleanup();
      }
      this.store.resizeCleanups.delete(tabId);
    }

    return splitSessionIds;
  }

  /**
   * Close a specific split pane by session ID within the active tab.
   * If the pane is the only one in the tab, closes the entire tab.
   */
  closeSplitPaneById(paneSessionId: string): void {
    if (!this.store.activeTabId) {
      return;
    }
    const layout = this.store.tabLayouts.get(this.store.activeTabId);
    if (!layout) {
      return;
    }

    // If the layout is a single leaf, fall back to tab close
    if (layout.type === "leaf") {
      this.postMessage({ type: "closeTab", tabId: this.store.activeTabId });
      return;
    }

    // Remove the pane from the split tree
    const updatedLayout = removeLeaf(layout, paneSessionId);

    if (updatedLayout === null) {
      this.postMessage({ type: "closeTab", tabId: this.store.activeTabId });
      return;
    }

    // Find the sibling to focus (first leaf in the remaining tree)
    const remainingIds = getAllSessionIds(updatedLayout);
    const newActivePaneId = remainingIds[0] ?? this.store.activeTabId;

    // Update state
    this.store.tabLayouts.set(this.store.activeTabId, updatedLayout);
    this.store.tabActivePaneIds.set(this.store.activeTabId, newActivePaneId);

    // Destroy the terminal instance for the closed pane
    const closedInstance = this.store.terminals.get(paneSessionId);
    if (closedInstance) {
      closedInstance.terminal.dispose();
      closedInstance.container.remove();
      this.store.terminals.delete(paneSessionId);
    }
    this.flowControl.delete(paneSessionId);

    // Request the extension host to destroy the session
    this.postMessage({ type: "requestCloseSplitPane", sessionId: paneSessionId });

    // Re-render the split tree
    this.renderTabSplitTree(this.store.activeTabId);
    this.showTabContainer(this.store.activeTabId);
    this.store.persist();

    // Fit and focus
    const currentActiveTabId = this.store.activeTabId;
    requestAnimationFrame(() => {
      this.resizeCoordinator.debouncedFitAllLeaves(currentActiveTabId!);
      const siblingInstance = this.store.terminals.get(newActivePaneId);
      if (siblingInstance) {
        siblingInstance.terminal.focus();
      }
    });

    this.onTabBarUpdate();
  }

  /**
   * Handle a splitPaneCreated message — create the terminal, update the layout tree,
   * re-render, and focus the new pane.
   */
  handleSplitPaneCreated(msg: SplitPaneCreatedMessage, factory: TerminalFactory): void {
    if (!this.store.activeTabId) {
      return;
    }
    const layout = this.store.tabLayouts.get(this.store.activeTabId);
    if (!layout) {
      return;
    }

    // Create a new terminal for the split pane (not active tab-level, just a terminal instance)
    const newInstance = factory.createTerminal(msg.newSessionId, msg.newSessionName, this.store.currentConfig, false);
    // Don't create a new tab layout for this terminal — it's part of the existing tab's split tree
    this.store.tabLayouts.delete(msg.newSessionId);
    this.store.tabActivePaneIds.delete(msg.newSessionId);

    // Update the split tree: replace the source leaf with a branch containing source + new
    const newBranch = createBranch(msg.direction, createLeaf(msg.sourcePaneId), createLeaf(msg.newSessionId));
    const updatedLayout = replaceNode(layout, msg.sourcePaneId, newBranch);
    this.store.tabLayouts.set(this.store.activeTabId, updatedLayout);

    // Set the new pane as active
    this.store.tabActivePaneIds.set(this.store.activeTabId, msg.newSessionId);

    // Re-render the split tree
    this.renderTabSplitTree(this.store.activeTabId);
    this.showTabContainer(this.store.activeTabId);
    this.store.persist();

    // Fit all terminals after layout change
    const activeTabId = this.store.activeTabId;
    requestAnimationFrame(() => {
      this.resizeCoordinator.debouncedFitAllLeaves(activeTabId!);
      // Focus the new terminal
      newInstance.terminal.focus();
    });

    // Update tab bar to reflect active pane name
    this.onTabBarUpdate();
  }
}
