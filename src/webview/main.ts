// src/webview/main.ts — AnyWhere Terminal WebView Entry Point
//
// Initializes xterm.js terminals inside VS Code webviews.
// Handles bidirectional communication with the Extension Host via postMessage.
//
// See: docs/design/xterm-integration.md, docs/design/message-protocol.md

// VS Code webview global — injected by the webview runtime
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import type { ExtensionToWebViewMessage, InitMessage, TerminalConfig } from "../types/messages";
import { type ClipboardProvider, createKeyEventHandler } from "./InputHandler";
import { createMessageRouter } from "./messaging/MessageRouter";
import { ResizeCoordinator } from "./resize/ResizeCoordinator";
import { fitTerminal as fitTerminalCore } from "./resize/XtermFitService";
import { renderSplitTree } from "./SplitContainer";
import { createBranch, createLeaf, getAllSessionIds, removeLeaf, replaceNode, updateBranchRatio } from "./SplitModel";
import { attachResizeHandle } from "./SplitResizeHandle";
import { type TerminalInstance, WebviewStateStore } from "./state/WebviewStateStore";
import { handleTabKeyboardShortcut, renderTabBar } from "./TabBarUtils";
import { type TerminalLocation, ThemeManager } from "./theme/ThemeManager";
import { showBanner } from "./ui/BannerService";

// ─── Constants ──────────────────────────────────────────────────────

/** Flow control: send ack after this many chars are processed. */
const ACK_BATCH_SIZE = 5000;

// ─── State ──────────────────────────────────────────────────────────

/** VS Code API handle — acquired once, reused for all postMessage calls. */
const vscode = acquireVsCodeApi();

/** Centralized state store — owns all mutable UI state. */
const store = new WebviewStateStore(vscode);

/** ThemeManager — owns theme resolution, location state, and theme watching. */
const themeManager = new ThemeManager("sidebar");

/** Flow control: accumulated chars since last ack, tracked per session. */
const unsentAckCharsMap = new Map<string, number>();

/** IME composition tracking. */
let isComposing = false;

/** Whether WebGL initialization has failed — prevents retrying on subsequent terminals. */
let webglFailed = false;

/**
 * Fit a single terminal to its container.
 * Delegates to XtermFitService for dimension calculation (which owns all xterm private API access),
 * then performs the resize if needed.
 */
function fitTerminal(instance: { terminal: Terminal; container: HTMLDivElement }): void {
  const parentElement = instance.terminal.element?.parentElement;
  if (!parentElement) {
    return;
  }

  const result = fitTerminalCore(instance.terminal, parentElement);
  if (result) {
    instance.terminal.resize(result.cols, result.rows);
  }
}

/** Update location and re-apply terminal theme/background when it changes. */
function updateLocation(location: TerminalLocation): void {
  if (themeManager.updateLocation(location)) {
    themeManager.applyToAll(store.terminals.values());
  }
}

/** ResizeCoordinator — owns resize observation, debouncing, and fit delegation. */
const resizeCoordinator = new ResizeCoordinator(
  fitTerminal,
  () => ({
    activeTabId: store.activeTabId,
    terminals: store.terminals,
    tabLayouts: store.tabLayouts,
  }),
  (location) => updateLocation(location),
);

// ─── Close Split Pane by ID ─────────────────────────────────────────

/**
 * Close a specific split pane by session ID within the active tab.
 * If the pane is the only one in the tab, closes the entire tab.
 * Extracted from the closeSplitPane message handler for reuse by context menu.
 */
function closeSplitPaneById(paneSessionId: string): void {
  if (!store.activeTabId) {
    return;
  }
  const layout = store.tabLayouts.get(store.activeTabId);
  if (!layout) {
    return;
  }

  // If the layout is a single leaf, fall back to tab close
  if (layout.type === "leaf") {
    vscode.postMessage({ type: "closeTab", tabId: store.activeTabId });
    return;
  }

  // Remove the pane from the split tree
  const updatedLayout = removeLeaf(layout, paneSessionId);

  if (updatedLayout === null) {
    vscode.postMessage({ type: "closeTab", tabId: store.activeTabId });
    return;
  }

  // Find the sibling to focus (first leaf in the remaining tree)
  const remainingIds = getAllSessionIds(updatedLayout);
  const newActivePaneId = remainingIds[0] ?? store.activeTabId;

  // Update state
  store.tabLayouts.set(store.activeTabId, updatedLayout);
  store.tabActivePaneIds.set(store.activeTabId, newActivePaneId);

  // Destroy the terminal instance for the closed pane
  const closedInstance = store.terminals.get(paneSessionId);
  if (closedInstance) {
    closedInstance.terminal.dispose();
    closedInstance.container.remove();
    store.terminals.delete(paneSessionId);
  }
  unsentAckCharsMap.delete(paneSessionId);

  // Request the extension host to destroy the session
  vscode.postMessage({ type: "requestCloseSplitPane", sessionId: paneSessionId });

  // Re-render the split tree
  _renderTabSplitTree(store.activeTabId);
  showTabContainer(store.activeTabId);
  store.persist();

  // Fit and focus
  const currentActiveTabId = store.activeTabId;
  requestAnimationFrame(() => {
    resizeCoordinator.debouncedFitAllLeaves(currentActiveTabId!);
    const siblingInstance = store.terminals.get(newActivePaneId);
    if (siblingInstance) {
      siblingInstance.terminal.focus();
    }
  });

  updateTabBar();
}

/**
 * Render the split tree for a tab and attach terminals to leaf containers.
 * Also attaches resize handles to branch nodes.
 */
function _renderTabSplitTree(tabId: string): void {
  const layout = store.tabLayouts.get(tabId);
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
  const cleanups = store.resizeCleanups.get(tabId);
  if (cleanups) {
    for (const cleanup of cleanups) {
      cleanup();
    }
  }
  store.resizeCleanups.set(tabId, []);

  // Clear existing content
  tabContainer.innerHTML = "";

  // Render the split tree
  renderSplitTree(layout, tabContainer, {
    onLeafMounted: (sessionId: string, leafContainer: HTMLDivElement) => {
      const instance = store.terminals.get(sessionId);
      if (instance) {
        // Move the terminal's container div into the leaf
        leafContainer.appendChild(instance.container);
        instance.container.style.display = "block";
        instance.container.style.width = "100%";
        instance.container.style.height = "100%";
      }

      // Click-to-focus: update activePaneId and focus terminal
      leafContainer.addEventListener("mousedown", () => {
        if (!store.activeTabId) {
          return;
        }
        const currentActive = store.tabActivePaneIds.get(store.activeTabId);
        if (currentActive === sessionId) {
          return; // Already active
        }
        store.tabActivePaneIds.set(store.activeTabId, sessionId);
        updateActivePaneVisual(store.activeTabId);
        store.persist();

        const inst = store.terminals.get(sessionId);
        if (inst) {
          inst.terminal.focus();
        }

        // Update tab bar to reflect active pane name
        updateTabBar();
      });
    },
  });

  // Attach resize handles to all branch nodes
  // Each handle has data-branch-index stamped by renderSplitTree (pre-order index)
  const handles = Array.from(tabContainer.querySelectorAll(".split-handle"));
  for (const handle of handles) {
    const handleEl = handle as HTMLDivElement;
    const branchEl = handleEl.parentElement as HTMLDivElement;
    const direction = handleEl.dataset.direction as "horizontal" | "vertical";
    const branchIndex = Number.parseInt(handleEl.dataset.branchIndex ?? "0", 10);

    const cleanup = attachResizeHandle(handleEl, branchEl, direction, {
      onRatioChange: (newRatio: number) => {
        // Update the layout tree model with the new ratio
        const currentLayout = store.tabLayouts.get(tabId);
        if (currentLayout) {
          const updatedLayout = updateBranchRatio(currentLayout, branchIndex, newRatio);
          store.tabLayouts.set(tabId, updatedLayout);
        }
        store.persist();
      },
      onResizeComplete: () => {
        // Fit all leaf terminals in this tab
        resizeCoordinator.debouncedFitAllLeaves(tabId);
      },
    });

    store.resizeCleanups.get(tabId)?.push(cleanup);
  }

  // Apply active pane visual indicator after rendering
  updateActivePaneVisual(tabId);
}

/**
 * Show the tab container for a given tab ID (make it visible in the DOM).
 */
function showTabContainer(tabId: string): void {
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
function updateActivePaneVisual(tabId: string): void {
  const containerEl = document.getElementById("terminal-container");
  if (!containerEl) {
    return;
  }
  const tabContainer = containerEl.querySelector(`[data-tab-id="${tabId}"]`);
  if (!tabContainer) {
    return;
  }

  const layout = store.tabLayouts.get(tabId);
  const hasSplits = layout && layout.type === "branch";
  const activePaneId = store.tabActivePaneIds.get(tabId) ?? tabId;

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

// ─── Input Handler ──────────────────────────────────────────────────

/** Build a ClipboardProvider from the browser's navigator.clipboard API. */
function getClipboardProvider(): ClipboardProvider | undefined {
  if (!navigator.clipboard) {
    return undefined;
  }
  return {
    readText: () => navigator.clipboard.readText(),
    writeText: (text: string) => navigator.clipboard.writeText(text),
  };
}

/**
 * Attach the custom key event handler and input wiring to a terminal.
 * Uses the extracted InputHandler module for testability.
 * See: docs/design/keyboard-input.md#§2
 */
function attachInputHandler(terminal: Terminal, tabId: string): void {
  const handler = createKeyEventHandler({
    terminal,
    clipboard: getClipboardProvider(),
    postMessage: (msg: unknown) => vscode.postMessage(msg),
    getActiveTabId: () => store.activeTabId,
    getIsComposing: () => isComposing,
    isMac: navigator.platform.includes("Mac"),
  });

  terminal.attachCustomKeyEventHandler(handler);

  // Wire terminal.onData -> send input to extension
  terminal.onData((data: string) => {
    // Check if this terminal has exited — don't forward input
    const instance = store.terminals.get(tabId);
    if (instance?.exited) {
      return;
    }

    vscode.postMessage({ type: "input", tabId, data });
  });
}

// ─── Flow Control ───────────────────────────────────────────────────

/**
 * Track characters written per session and send ack when threshold reached.
 * See: docs/design/output-buffering.md#§4
 */
function ackChars(count: number, tabId: string): void {
  const current = unsentAckCharsMap.get(tabId) ?? 0;
  const updated = current + count;
  if (updated >= ACK_BATCH_SIZE) {
    vscode.postMessage({ type: "ack", charCount: updated, tabId });
    unsentAckCharsMap.set(tabId, 0);
  } else {
    unsentAckCharsMap.set(tabId, updated);
  }
}

// ─── Terminal Instance Management ───────────────────────────────────

/**
 * Get the font family from CSS variables or use default.
 */
function getFontFamily(): string {
  const style = getComputedStyle(document.documentElement);
  const fontFamily = style.getPropertyValue("--vscode-editor-font-family").trim();
  return fontFamily || "monospace";
}

/**
 * Create a new terminal instance with addons.
 * See: docs/design/xterm-integration.md#§3-§6
 */
function createTerminal(id: string, name: string, config: TerminalConfig, isActive: boolean): TerminalInstance {
  const containerEl = document.getElementById("terminal-container");
  if (!containerEl) {
    throw new Error("[AnyWhere Terminal] #terminal-container not found");
  }

  // Create dedicated container div for this terminal
  const container = document.createElement("div");
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.display = isActive ? "block" : "none";
  // VS Code native context menu support — always set on terminal container
  container.dataset.vscodeContext = JSON.stringify({
    webviewSection: "splitPane",
    paneSessionId: id,
  });
  containerEl.appendChild(container);

  // Create xterm.js Terminal with config
  // overviewRuler.width=1 makes FitAddon deduct only 1px instead of the default 14px
  // for the scrollbar. FitAddon calculates: scrollbarWidth = scrollback === 0 ? 0 : (overviewRuler?.width || 14).
  // Setting width=0 doesn't work because 0 is falsy (0||14=14). Width=1 is truthy and
  // makes the Viewport's scrollbar element only 1px wide — effectively invisible.
  const resolvedFontFamily = config.fontFamily || getFontFamily();
  const terminal = new Terminal({
    scrollback: config.scrollback || 10000,
    cursorBlink: config.cursorBlink ?? true,
    cursorStyle: "block",
    fontSize: config.fontSize || 14,
    fontFamily: resolvedFontFamily,
    macOptionIsMeta: false,
    macOptionClickForcesSelection: true,
    drawBoldTextInBrightColors: true,
    minimumContrastRatio: themeManager.getMinimumContrastRatio(),
    rightClickSelectsWord: false,
    fastScrollSensitivity: 5,
    tabStopWidth: 8,
    theme: themeManager.getTheme(),
    overviewRuler: { width: 1 },
  });

  // Load addons
  const fitAddon = new FitAddon();
  const webLinksAddon = new WebLinksAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);

  // Open terminal in container
  terminal.open(container);

  // Try to enable WebGL renderer for better rendering on Retina displays
  // (eliminates horizontal line gaps between rows in canvas renderer)
  if (!webglFailed) {
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
        webglFailed = true;
        console.warn("[AnyWhere Terminal] WebGL context lost, falling back to canvas renderer");
      });
      terminal.loadAddon(webglAddon);
    } catch {
      webglFailed = true;
      console.warn("[AnyWhere Terminal] WebGL renderer failed, using canvas fallback for all future terminals");
    }
  }

  // Wire resize event -> send resize message to extension
  terminal.onResize(({ cols, rows }) => {
    vscode.postMessage({ type: "resize", tabId: id, cols, rows });
  });

  // Attach input handler (keyboard + clipboard + onData)
  attachInputHandler(terminal, id);

  const instance: TerminalInstance = {
    id,
    name,
    terminal,
    container,
    exited: false,
  };

  store.terminals.set(id, instance);

  // Listen for OSC title change events (e.g., shell sets window title via \e]0;title\a)
  // Updates the tab name dynamically to reflect the current process name.
  terminal.onTitleChange((newTitle: string) => {
    if (newTitle) {
      instance.name = newTitle;
      updateTabBar();
    }
  });

  // Initialize split layout for this tab (single leaf)
  if (!store.tabLayouts.has(id)) {
    store.tabLayouts.set(id, createLeaf(id));
    store.tabActivePaneIds.set(id, id);
    store.persist();
  }

  if (isActive) {
    store.activeTabId = id;
  }

  // Fit after opening (deferred to allow layout to settle)
  setTimeout(() => {
    // Guard: terminal may have been disposed during async delay
    if (!store.terminals.has(id)) {
      return;
    }
    fitTerminal(instance);
    if (isActive) {
      terminal.focus();
    }
  }, 0);

  return instance;
}

/**
 * Switch the active terminal tab (CSS display toggle).
 * Handles both single-pane and split-pane tabs.
 * See: docs/design/xterm-integration.md#§7
 */
function switchTab(newTabId: string): void {
  // Validate target exists before hiding current
  const next = store.terminals.get(newTabId);
  if (!next) {
    return;
  }

  const containerEl = document.getElementById("terminal-container");

  // Hide current tab's container
  if (store.activeTabId && store.activeTabId !== newTabId && containerEl) {
    const currentTabContainer = containerEl.querySelector(
      `[data-tab-id="${store.activeTabId}"]`,
    ) as HTMLDivElement | null;
    if (currentTabContainer) {
      currentTabContainer.style.display = "none";
    } else {
      // Fallback for non-split tabs
      const current = store.terminals.get(store.activeTabId);
      if (current) {
        current.container.style.display = "none";
      }
    }
  }

  // Show new tab's container
  store.activeTabId = newTabId;
  if (containerEl) {
    const newTabContainer = containerEl.querySelector(`[data-tab-id="${newTabId}"]`) as HTMLDivElement | null;
    if (newTabContainer) {
      newTabContainer.style.display = "flex";
    } else {
      next.container.style.display = "block";
    }
  } else {
    next.container.style.display = "block";
  }

  // Fit after display change (container now has dimensions)
  requestAnimationFrame(() => {
    // Guard: terminal may have been disposed during async frame
    if (!store.terminals.has(newTabId)) {
      return;
    }
    // Fit all leaves in the split tree
    const layout = store.tabLayouts.get(newTabId);
    if (layout) {
      const sessionIds = getAllSessionIds(layout);
      for (const sessionId of sessionIds) {
        const instance = store.terminals.get(sessionId);
        if (instance) {
          fitTerminal(instance);
        }
      }
    } else {
      fitTerminal(next);
    }
    // Focus the active pane's terminal
    const activePaneId = store.tabActivePaneIds.get(newTabId) ?? newTabId;
    const activeInstance = store.terminals.get(activePaneId);
    if (activeInstance) {
      activeInstance.terminal.focus();
    } else {
      next.terminal.focus();
    }
  });

  // Update active pane visual
  updateActivePaneVisual(newTabId);

  // Update tab bar active state
  updateTabBar();

  // Notify extension
  vscode.postMessage({ type: "switchTab", tabId: newTabId });
}

/**
 * Remove and dispose a terminal instance (and all its split pane terminals).
 * See: docs/design/xterm-integration.md#§6 Disposal
 */
function removeTerminal(id: string): void {
  const instance = store.terminals.get(id);
  if (!instance) {
    return;
  }

  // Get all session IDs in this tab's split tree (if any) before cleanup
  const layout = store.tabLayouts.get(id);
  const splitSessionIds = layout ? getAllSessionIds(layout).filter((sid) => sid !== id) : [];

  // 1. Dispose the root terminal
  instance.terminal.dispose();
  instance.container.remove();
  store.terminals.delete(id);
  unsentAckCharsMap.delete(id);

  // 1b. Dispose all split pane terminals belonging to this tab
  for (const splitId of splitSessionIds) {
    const splitInstance = store.terminals.get(splitId);
    if (splitInstance) {
      splitInstance.terminal.dispose();
      splitInstance.container.remove();
      store.terminals.delete(splitId);
    }
    unsentAckCharsMap.delete(splitId);
    // Notify extension host to destroy the PTY session
    vscode.postMessage({ type: "requestCloseSplitPane", sessionId: splitId });
  }

  // 2. Remove the tab container from DOM
  const containerEl = document.getElementById("terminal-container");
  if (containerEl) {
    const tabContainer = containerEl.querySelector(`[data-tab-id="${id}"]`);
    if (tabContainer) {
      tabContainer.remove();
    }
  }

  // 3. Clean up split layout and active pane tracking for this tab
  store.tabLayouts.delete(id);
  store.tabActivePaneIds.delete(id);
  const cleanups = store.resizeCleanups.get(id);
  if (cleanups) {
    for (const cleanup of cleanups) {
      cleanup();
    }
    store.resizeCleanups.delete(id);
  }
  store.persist();

  // 4. If this was active tab, switch to next available tab
  if (store.activeTabId === id) {
    // Find remaining root tabs (those with tabLayouts entries)
    const remainingTabs = Array.from(store.tabLayouts.keys());
    if (remainingTabs.length > 0) {
      switchTab(remainingTabs[remainingTabs.length - 1]);
    } else {
      store.activeTabId = null;
      // Last tab removed — request a new default terminal
      vscode.postMessage({ type: "createTab" });
    }
  }

  // 5. Update tab bar
  updateTabBar();
}

/**
 * Update the tab bar UI to reflect current terminal state.
 * Delegates to the extracted renderTabBar utility for testability.
 * For split tabs, shows the active pane's session name.
 */
function updateTabBar(): void {
  const tabBarEl = document.getElementById("tab-bar");
  if (!tabBarEl) {
    return;
  }

  // Build a filtered terminals map: only include "root" tabs (those with a tabLayout entry)
  // For split tabs, use the active pane's name
  const tabTerminals = new Map<string, { name: string; exited?: boolean }>();
  for (const [tabId, layout] of store.tabLayouts) {
    if (layout.type === "branch") {
      // Split tab — show active pane's name and exited state
      const activePaneId = store.tabActivePaneIds.get(tabId) ?? tabId;
      const activeInstance = store.terminals.get(activePaneId);
      const rootInstance = store.terminals.get(tabId);
      tabTerminals.set(tabId, {
        name: activeInstance?.name ?? rootInstance?.name ?? tabId,
        exited: (activeInstance ?? rootInstance)?.exited,
      });
    } else {
      // Single pane tab
      const instance = store.terminals.get(tabId);
      if (instance) {
        tabTerminals.set(tabId, { name: instance.name, exited: instance.exited });
      }
    }
  }

  renderTabBar({
    tabBarEl,
    terminals: tabTerminals,
    activeTabId: store.activeTabId,
    onTabClick: (tabId: string) => {
      switchTab(tabId);
    },
    onTabClose: (tabId: string) => {
      vscode.postMessage({ type: "closeTab", tabId });
    },
    onAddClick: () => {
      vscode.postMessage({ type: "createTab" });
    },
  });
}

/**
 * Apply a partial config update to all terminal instances.
 * See: docs/design/xterm-integration.md#§8
 */
function applyConfig(config: Partial<TerminalConfig>): void {
  // Persist config changes for future tab creation
  if (config.fontSize !== undefined) {
    store.currentConfig.fontSize = config.fontSize;
  }
  if (config.cursorBlink !== undefined) {
    store.currentConfig.cursorBlink = config.cursorBlink;
  }
  if (config.scrollback !== undefined) {
    store.currentConfig.scrollback = config.scrollback;
  }
  if (config.fontFamily !== undefined) {
    store.currentConfig.fontFamily = config.fontFamily;
  }

  const needsRefit = config.fontSize !== undefined || config.fontFamily !== undefined;

  for (const instance of store.terminals.values()) {
    const term = instance.terminal;

    if (config.fontSize !== undefined) {
      // fontSize 0 means "inherit from editor" — use fallback
      term.options.fontSize = config.fontSize || 14;
    }
    if (config.cursorBlink !== undefined) {
      term.options.cursorBlink = config.cursorBlink;
    }
    if (config.scrollback !== undefined) {
      term.options.scrollback = config.scrollback;
    }
    if (config.fontFamily !== undefined) {
      // Empty fontFamily falls back to CSS variable → 'monospace'
      term.options.fontFamily = config.fontFamily || getFontFamily();
    }

    // Refit after font changes (affects cell dimensions)
    if (needsRefit) {
      fitTerminal(instance);
    }
  }
}

/** Get the terminal instance for the active pane in the current tab. */
function getActivePaneTerminal(): TerminalInstance | undefined {
  if (!store.activeTabId) {
    return undefined;
  }
  const activePaneId = store.tabActivePaneIds.get(store.activeTabId) ?? store.activeTabId;
  return store.terminals.get(activePaneId);
}

// ─── Message Router ─────────────────────────────────────────────────

/**
 * Typed message dispatch — delegates to handler closures via createMessageRouter.
 * The `init` message is handled separately in bootstrap(); see handleInit().
 * See: docs/design/message-protocol.md#§4
 */
const routeMessage = createMessageRouter({
  onOutput(msg) {
    const dataLen = msg.data.length;
    const instance = store.terminals.get(msg.tabId);
    if (instance) {
      instance.terminal.write(msg.data, () => {
        ackChars(dataLen, msg.tabId);
      });
    } else {
      // Tab not found — still ack to prevent flow control deadlock
      ackChars(dataLen, msg.tabId);
    }
  },

  onExit(msg) {
    const instance = store.terminals.get(msg.tabId);
    if (instance) {
      instance.exited = true;
      instance.terminal.write(`\r\n\x1b[90m[Process exited with code ${msg.code}]\x1b[0m\r\n`);
      updateTabBar();
    }
  },

  onTabCreated(msg) {
    // Create new terminal (inactive initially) and switch to it
    createTerminal(msg.tabId, msg.name, store.currentConfig, false);
    switchTab(msg.tabId);
    // Note: switchTab already calls updateTabBar()
  },

  onTabRemoved(msg) {
    removeTerminal(msg.tabId);
    // Note: removeTerminal already calls updateTabBar()
  },

  onRestore(msg) {
    const instance = store.terminals.get(msg.tabId);
    if (instance) {
      instance.terminal.write(msg.data);
    }
  },

  onConfigUpdate(msg) {
    applyConfig(msg.config);
  },

  onViewShow() {
    resizeCoordinator.onViewShow();
  },

  onSplitPane(msg) {
    // Extension host requests a split — forward to extension to create a new session
    if (!store.activeTabId) {
      return;
    }
    const activePaneId = store.tabActivePaneIds.get(store.activeTabId) ?? store.activeTabId;
    vscode.postMessage({
      type: "requestSplitSession",
      direction: msg.direction,
      sourcePaneId: activePaneId,
    });
  },

  onSplitPaneCreated(msg) {
    // Extension host created a new session for a split pane
    if (!store.activeTabId) {
      return;
    }
    const layout = store.tabLayouts.get(store.activeTabId);
    if (!layout) {
      return;
    }

    // Create a new terminal for the split pane (not active tab-level, just a terminal instance)
    const newInstance = createTerminal(msg.newSessionId, msg.newSessionName, store.currentConfig, false);
    // Don't create a new tab layout for this terminal — it's part of the existing tab's split tree
    store.tabLayouts.delete(msg.newSessionId);
    store.tabActivePaneIds.delete(msg.newSessionId);

    // Update the split tree: replace the source leaf with a branch containing source + new
    const newBranch = createBranch(msg.direction, createLeaf(msg.sourcePaneId), createLeaf(msg.newSessionId));
    const updatedLayout = replaceNode(layout, msg.sourcePaneId, newBranch);
    store.tabLayouts.set(store.activeTabId, updatedLayout);

    // Set the new pane as active
    store.tabActivePaneIds.set(store.activeTabId, msg.newSessionId);

    // Re-render the split tree
    _renderTabSplitTree(store.activeTabId);
    showTabContainer(store.activeTabId);
    store.persist();

    // Fit all terminals after layout change
    requestAnimationFrame(() => {
      resizeCoordinator.debouncedFitAllLeaves(store.activeTabId!);
      // Focus the new terminal
      newInstance.terminal.focus();
    });

    // Update tab bar to reflect active pane name
    updateTabBar();
  },

  onCloseSplitPane() {
    // Close the active pane in the current tab's split layout
    if (!store.activeTabId) {
      return;
    }
    const activePaneId = store.tabActivePaneIds.get(store.activeTabId) ?? store.activeTabId;
    closeSplitPaneById(activePaneId);
  },

  onCloseSplitPaneById(msg) {
    // Close a specific pane by session ID (from context menu)
    if (msg.sessionId) {
      closeSplitPaneById(msg.sessionId);
    }
  },

  onSplitPaneAt(msg) {
    // Split a specific pane (from context menu) — set it as active, then request split
    if (store.activeTabId && msg.direction && msg.sourcePaneId) {
      store.tabActivePaneIds.set(store.activeTabId, msg.sourcePaneId);
      updateActivePaneVisual(store.activeTabId);
      vscode.postMessage({
        type: "requestSplitSession",
        direction: msg.direction,
        sourcePaneId: msg.sourcePaneId,
      });
    }
  },

  onCtxClear(msg) {
    // Use the specific session ID if provided (from context menu), otherwise fall back to active pane
    const targetId = msg.sessionId;
    const instance = targetId ? store.terminals.get(targetId) : getActivePaneTerminal();
    if (instance) {
      instance.terminal.clear();
    }
  },

  onError(msg) {
    console.error(`[AnyWhere Terminal] ${msg.severity}: ${msg.message}`);
    const containerEl = document.getElementById("terminal-container");
    if (containerEl) {
      showBanner(containerEl, msg.message, msg.severity);
    }
  },
});

/**
 * Handle the init message — create initial terminal instances.
 * See: docs/design/message-protocol.md#§7
 */
function handleInit(msg: InitMessage): void {
  // Store config for future tab creation
  store.currentConfig = { ...msg.config };

  // Build set of valid tab IDs from the extension's SessionManager
  const validTabIds = new Set(msg.tabs.map((t) => t.id));

  // Restore layout state from previous session (if available)
  const restoredLayouts = store.restore();
  for (const [tabId, layout] of restoredLayouts) {
    // Only restore layouts for tabs that still exist in SessionManager
    if (validTabIds.has(tabId)) {
      store.tabLayouts.set(tabId, layout);
    }
  }

  // Prune active pane IDs for tabs that no longer exist
  for (const tabId of store.tabActivePaneIds.keys()) {
    if (!validTabIds.has(tabId)) {
      store.tabActivePaneIds.delete(tabId);
    }
  }

  // Create terminal instances for each tab
  for (const tab of msg.tabs) {
    createTerminal(tab.id, tab.name, msg.config, tab.isActive);
  }

  // Set up resize observer on the container
  const containerEl = document.getElementById("terminal-container");
  if (containerEl) {
    resizeCoordinator.setup(containerEl);
  }

  // Persist cleaned-up state
  store.persist();

  // Render tab bar after all tabs are created
  updateTabBar();
}

// ─── Bootstrap ──────────────────────────────────────────────────────

/**
 * Initialize the webview terminal application.
 * Acquires VS Code API, sets up listeners, sends ready handshake.
 * See: docs/design/message-protocol.md#§7
 */
function bootstrap(): void {
  const locationAttr = document.body.getAttribute("data-terminal-location");
  if (locationAttr === "sidebar" || locationAttr === "panel" || locationAttr === "editor") {
    themeManager.updateLocation(locationAttr);
  }
  themeManager.applyBodyBackground();

  // Set up IME composition tracking
  document.addEventListener("compositionstart", () => {
    isComposing = true;
  });
  document.addEventListener("compositionend", () => {
    isComposing = false;
  });

  // Set up Ctrl+Tab / Ctrl+Shift+Tab keyboard shortcuts for tab cycling
  // See: docs/design/flow-multi-tab.md#Keyboard-Shortcut
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    const handled = handleTabKeyboardShortcut(e, {
      terminals: store.terminals,
      activeTabId: store.activeTabId,
      switchTab,
    });
    if (handled) {
      e.preventDefault();
    }
  });

  // Set up message listener for Extension -> WebView messages
  window.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data;
    if (!msg || typeof msg.type !== "string") {
      return;
    }
    const typed = msg as ExtensionToWebViewMessage;
    if (typed.type === "init") {
      handleInit(typed);
    } else {
      routeMessage(typed);
    }
  });

  // Backup resize listener — ResizeObserver may not fire reliably in all VS Code
  // webview scenarios (e.g., sidebar expand). The window resize event catches these.
  window.addEventListener("resize", () => {
    resizeCoordinator.debouncedFit();
  });

  // Start theme change watcher
  themeManager.startWatching(() => {
    themeManager.applyToAll(store.terminals.values());
  });

  // Signal readiness to the extension host
  vscode.postMessage({ type: "ready" });
}

// Run bootstrap when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  // DOM already loaded (e.g., script is at end of body)
  bootstrap();
}
