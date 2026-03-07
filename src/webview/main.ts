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
import { renderSplitTree } from "./SplitContainer";
import {
  createBranch,
  createLeaf,
  getAllSessionIds,
  removeLeaf,
  replaceNode,
  type SplitNode,
  updateBranchRatio,
} from "./SplitModel";
import { attachResizeHandle } from "./SplitResizeHandle";
import { handleTabKeyboardShortcut, renderTabBar } from "./TabBarUtils";

// ─── Types ──────────────────────────────────────────────────────────

/** A single terminal instance with its addons and DOM container. */
interface TerminalInstance {
  id: string;
  name: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  webLinksAddon: WebLinksAddon;
  container: HTMLDivElement;
  /** Whether the PTY process has exited (terminal becomes read-only). */
  exited: boolean;
}

/** Terminal location for theme background fallback. */
type TerminalLocation = "panel" | "sidebar" | "editor";

// ─── Constants ──────────────────────────────────────────────────────

/** Flow control: send ack after this many chars are processed. */
const ACK_BATCH_SIZE = 5000;

/** Resize debounce interval in milliseconds. */
const RESIZE_DEBOUNCE_MS = 100;

/** Location-specific background CSS variable fallback map. */
const LOCATION_BACKGROUND_MAP: Record<TerminalLocation, string> = {
  panel: "--vscode-panel-background",
  sidebar: "--vscode-sideBar-background",
  editor: "--vscode-editor-background",
};

// ─── State ──────────────────────────────────────────────────────────

/** VS Code API handle — acquired once, reused for all postMessage calls. */
const vscode = acquireVsCodeApi();

/** All terminal instances keyed by session/tab ID. */
const terminals = new Map<string, TerminalInstance>();

/** Currently active (visible) terminal tab ID. */
let activeTabId: string | null = null;

/** Terminal location (sidebar/panel/editor), inferred from body data attribute. */
let terminalLocation: TerminalLocation = "sidebar";

/** Current terminal config — set from init, updated by configUpdate. */
let currentConfig: TerminalConfig = {
  fontSize: 14,
  cursorBlink: true,
  scrollback: 10000,
  fontFamily: "",
};

/** Flow control: accumulated chars since last ack. */
let unsentAckChars = 0;

/** Whether a resize was deferred because the container was invisible. */
let pendingResize = false;

/** Debounce timer for resize events. */
let resizeTimeout: number | undefined;

/** IME composition tracking. */
let isComposing = false;

/** Whether WebGL initialization has failed — prevents retrying on subsequent terminals. */
let webglFailed = false;

/** ResizeObserver instance — one per webview, observes #terminal-container. */
let resizeObserver: ResizeObserver | undefined;

/** MutationObserver for theme change detection. */
let themeObserver: MutationObserver | undefined;

/** Split layout tree per tab — maps tab ID to its root SplitNode. */
const tabLayouts = new Map<string, SplitNode>();

/** Active pane ID per tab — tracks which pane is focused in a split layout. */
const tabActivePaneIds = new Map<string, string>();

/** Cleanup functions for resize handles — keyed by tab ID. */
const resizeCleanups = new Map<string, (() => void)[]>();

/** Choose location by container aspect ratio when views are moved. */
function inferLocationFromSize(width: number, height: number): TerminalLocation {
  return width > height * 1.2 ? "panel" : "sidebar";
}

// ─── Split Layout State Persistence ─────────────────────────────────

/** Persist layout state to vscode.setState(). */
function persistLayoutState(): void {
  const layouts: Record<string, SplitNode> = {};
  for (const [tabId, layout] of tabLayouts) {
    layouts[tabId] = layout;
  }
  const activePaneIds: Record<string, string> = {};
  for (const [tabId, paneId] of tabActivePaneIds) {
    activePaneIds[tabId] = paneId;
  }
  const currentState = (vscode.getState() as Record<string, unknown>) ?? {};
  vscode.setState({ ...currentState, tabLayouts: layouts, tabActivePaneIds: activePaneIds });
}

/** Restore layout state from vscode.getState(). Returns empty map if missing/malformed. */
function restoreLayoutState(): Map<string, SplitNode> {
  const restored = new Map<string, SplitNode>();
  try {
    const state = vscode.getState() as Record<string, unknown> | null;
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
              tabActivePaneIds.set(tabId, paneId);
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

// ─── Close Split Pane by ID ─────────────────────────────────────────

/**
 * Close a specific split pane by session ID within the active tab.
 * If the pane is the only one in the tab, closes the entire tab.
 * Extracted from the closeSplitPane message handler for reuse by context menu.
 */
function closeSplitPaneById(paneSessionId: string): void {
  if (!activeTabId) {
    return;
  }
  const layout = tabLayouts.get(activeTabId);
  if (!layout) {
    return;
  }

  // If the layout is a single leaf, fall back to tab close
  if (layout.type === "leaf") {
    vscode.postMessage({ type: "closeTab", tabId: activeTabId });
    return;
  }

  // Remove the pane from the split tree
  const updatedLayout = removeLeaf(layout, paneSessionId);

  if (updatedLayout === null) {
    vscode.postMessage({ type: "closeTab", tabId: activeTabId });
    return;
  }

  // Find the sibling to focus (first leaf in the remaining tree)
  const remainingIds = getAllSessionIds(updatedLayout);
  const newActivePaneId = remainingIds[0] ?? activeTabId;

  // Update state
  tabLayouts.set(activeTabId, updatedLayout);
  tabActivePaneIds.set(activeTabId, newActivePaneId);

  // Destroy the terminal instance for the closed pane
  const closedInstance = terminals.get(paneSessionId);
  if (closedInstance) {
    closedInstance.terminal.dispose();
    closedInstance.container.remove();
    terminals.delete(paneSessionId);
  }

  // Request the extension host to destroy the session
  vscode.postMessage({ type: "requestCloseSplitPane", sessionId: paneSessionId });

  // Re-render the split tree
  _renderTabSplitTree(activeTabId);
  showTabContainer(activeTabId);
  persistLayoutState();

  // Fit and focus
  const currentActiveTabId = activeTabId;
  requestAnimationFrame(() => {
    debouncedFitAllLeaves(currentActiveTabId!);
    const siblingInstance = terminals.get(newActivePaneId);
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
  const layout = tabLayouts.get(tabId);
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
  const cleanups = resizeCleanups.get(tabId);
  if (cleanups) {
    for (const cleanup of cleanups) {
      cleanup();
    }
  }
  resizeCleanups.set(tabId, []);

  // Clear existing content
  tabContainer.innerHTML = "";

  // Render the split tree
  renderSplitTree(layout, tabContainer, {
    onLeafMounted: (sessionId: string, leafContainer: HTMLDivElement) => {
      const instance = terminals.get(sessionId);
      if (instance) {
        // Move the terminal's container div into the leaf
        leafContainer.appendChild(instance.container);
        instance.container.style.display = "block";
        instance.container.style.width = "100%";
        instance.container.style.height = "100%";
      }

      // Click-to-focus: update activePaneId and focus terminal
      leafContainer.addEventListener("mousedown", () => {
        if (!activeTabId) {
          return;
        }
        const currentActive = tabActivePaneIds.get(activeTabId);
        if (currentActive === sessionId) {
          return; // Already active
        }
        tabActivePaneIds.set(activeTabId, sessionId);
        updateActivePaneVisual(activeTabId);
        persistLayoutState();

        const inst = terminals.get(sessionId);
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
        const currentLayout = tabLayouts.get(tabId);
        if (currentLayout) {
          const updatedLayout = updateBranchRatio(currentLayout, branchIndex, newRatio);
          tabLayouts.set(tabId, updatedLayout);
        }
        persistLayoutState();
      },
      onResizeComplete: () => {
        // Fit all leaf terminals in this tab
        debouncedFitAllLeaves(tabId);
      },
    });

    resizeCleanups.get(tabId)?.push(cleanup);
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
    tabContainer.style.display = "block";
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

  const layout = tabLayouts.get(tabId);
  const hasSplits = layout && layout.type === "branch";
  const activePaneId = tabActivePaneIds.get(tabId) ?? tabId;

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
 * Debounced fit for all leaf terminals in a tab.
 */
function debouncedFitAllLeaves(tabId: string): void {
  clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(() => {
    const layout = tabLayouts.get(tabId);
    if (!layout) {
      return;
    }
    const sessionIds = getAllSessionIds(layout);
    for (const sessionId of sessionIds) {
      const instance = terminals.get(sessionId);
      if (instance) {
        instance.fitAddon.fit();
      }
    }
  }, RESIZE_DEBOUNCE_MS);
}

/** Apply background color for the inferred location to the webview body. */
function applyBodyBackground(location: TerminalLocation): void {
  const style = getComputedStyle(document.documentElement);
  const varName = LOCATION_BACKGROUND_MAP[location];
  const color = style.getPropertyValue(varName).trim();
  if (color) {
    document.body.style.backgroundColor = color;
  }
}

/** Update location and re-apply terminal theme/background when it changes. */
function updateLocation(location: TerminalLocation): void {
  if (terminalLocation === location) {
    return;
  }
  terminalLocation = location;
  applyBodyBackground(location);
  applyThemeToAll();
}

// ─── Theme Manager ──────────────────────────────────────────────────

/**
 * Build an xterm.js ITheme object from VS Code's CSS variables.
 * See: docs/design/theme-integration.md#§6
 */
function getXtermTheme(location: TerminalLocation = "sidebar"): Record<string, string | undefined> {
  const style = getComputedStyle(document.documentElement);
  const get = (varName: string): string | undefined => {
    const value = style.getPropertyValue(varName).trim();
    return value || undefined;
  };

  const background = get(LOCATION_BACKGROUND_MAP[location]) ?? get("--vscode-terminal-background") ?? "#1e1e1e";

  const foreground = get("--vscode-terminal-foreground") ?? get("--vscode-editor-foreground") ?? "#cccccc";

  return {
    background,
    foreground,
    cursor: get("--vscode-terminalCursor-foreground"),
    cursorAccent: get("--vscode-terminalCursor-background"),
    selectionBackground: get("--vscode-terminal-selectionBackground"),
    selectionForeground: get("--vscode-terminal-selectionForeground"),
    selectionInactiveBackground: get("--vscode-terminal-inactiveSelectionBackground"),

    // Standard ANSI colors (0-7)
    black: get("--vscode-terminal-ansiBlack"),
    red: get("--vscode-terminal-ansiRed"),
    green: get("--vscode-terminal-ansiGreen"),
    yellow: get("--vscode-terminal-ansiYellow"),
    blue: get("--vscode-terminal-ansiBlue"),
    magenta: get("--vscode-terminal-ansiMagenta"),
    cyan: get("--vscode-terminal-ansiCyan"),
    white: get("--vscode-terminal-ansiWhite"),

    // Bright ANSI colors (8-15)
    brightBlack: get("--vscode-terminal-ansiBrightBlack"),
    brightRed: get("--vscode-terminal-ansiBrightRed"),
    brightGreen: get("--vscode-terminal-ansiBrightGreen"),
    brightYellow: get("--vscode-terminal-ansiBrightYellow"),
    brightBlue: get("--vscode-terminal-ansiBrightBlue"),
    brightMagenta: get("--vscode-terminal-ansiBrightMagenta"),
    brightCyan: get("--vscode-terminal-ansiBrightCyan"),
    brightWhite: get("--vscode-terminal-ansiBrightWhite"),

    // Keep the overview ruler lane visually invisible.
    overviewRulerBorder: "transparent",

    // Hide xterm's scrollbar slider visuals (we only keep a 1px lane for FitAddon math).
    scrollbarSliderBackground: "transparent",
    scrollbarSliderHoverBackground: "transparent",
    scrollbarSliderActiveBackground: "transparent",
  };
}

/**
 * Detect whether the current VS Code theme is a high-contrast theme.
 * High-contrast themes add `vscode-high-contrast` or `vscode-high-contrast-light` class to body.
 */
function isHighContrastTheme(): boolean {
  return (
    document.body.classList.contains("vscode-high-contrast") ||
    document.body.classList.contains("vscode-high-contrast-light")
  );
}

/**
 * Get the appropriate minimum contrast ratio based on the current theme.
 * High-contrast themes use 7 (WCAG AAA), normal themes use 4.5 (WCAG AA).
 */
function getMinimumContrastRatio(): number {
  return isHighContrastTheme() ? 7 : 4.5;
}

/**
 * Apply the current theme to all terminal instances.
 */
function applyThemeToAll(): void {
  const theme = getXtermTheme(terminalLocation);
  const contrastRatio = getMinimumContrastRatio();
  for (const instance of terminals.values()) {
    instance.terminal.options.theme = theme;
    instance.terminal.options.minimumContrastRatio = contrastRatio;
  }
}

/**
 * Start watching for VS Code theme changes via MutationObserver on body class.
 * See: docs/design/theme-integration.md#§4
 */
function startThemeWatcher(): void {
  if (themeObserver) {
    return;
  }

  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "class") {
        applyBodyBackground(terminalLocation);
        applyThemeToAll();
        break;
      }
    }
  });

  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
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
    getActiveTabId: () => activeTabId,
    getIsComposing: () => isComposing,
    isMac: navigator.platform.includes("Mac"),
  });

  terminal.attachCustomKeyEventHandler(handler);

  // Wire terminal.onData -> send input to extension
  terminal.onData((data: string) => {
    // Check if this terminal has exited — don't forward input
    const instance = terminals.get(tabId);
    if (instance?.exited) {
      return;
    }

    vscode.postMessage({ type: "input", tabId, data });
  });
}

// ─── Flow Control ───────────────────────────────────────────────────

/**
 * Track characters written and send ack when threshold reached.
 * See: docs/design/output-buffering.md#§4
 */
function ackChars(count: number): void {
  unsentAckChars += count;
  if (unsentAckChars >= ACK_BATCH_SIZE) {
    vscode.postMessage({ type: "ack", charCount: unsentAckChars });
    unsentAckChars = 0;
  }
}

// ─── Resize Handler ─────────────────────────────────────────────────

/**
 * Debounced fit: resets timer on each call, fits after RESIZE_DEBOUNCE_MS quiet period.
 * Fits all leaf terminals in the active tab's split tree.
 */
function debouncedFit(): void {
  clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(() => {
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
          instance.fitAddon.fit();
        }
      }
    } else {
      // Fallback: fit single terminal
      const instance = terminals.get(activeTabId);
      if (instance) {
        instance.fitAddon.fit();
      }
    }
  }, RESIZE_DEBOUNCE_MS);
}

/**
 * Set up ResizeObserver on the terminal container element.
 * See: docs/design/resize-handling.md#§3
 */
function setupResizeObserver(container: HTMLElement): void {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;

      // Skip if container is not visible (collapsed)
      if (width === 0 || height === 0) {
        pendingResize = true;
        return;
      }

      updateLocation(inferLocationFromSize(width, height));

      debouncedFit();
    }
  });

  resizeObserver.observe(container);
}

/**
 * Handle view becoming visible — flush deferred resize.
 * See: docs/design/resize-handling.md#§5
 */
function onViewShow(): void {
  if (pendingResize) {
    pendingResize = false;
    requestAnimationFrame(() => {
      if (!activeTabId) {
        return;
      }
      const layout = tabLayouts.get(activeTabId);
      if (layout) {
        const sessionIds = getAllSessionIds(layout);
        for (const sessionId of sessionIds) {
          const instance = terminals.get(sessionId);
          if (instance) {
            instance.fitAddon.fit();
          }
        }
      } else {
        const instance = terminals.get(activeTabId);
        if (instance) {
          instance.fitAddon.fit();
        }
      }
    });
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
    minimumContrastRatio: getMinimumContrastRatio(),
    rightClickSelectsWord: false,
    fastScrollSensitivity: 5,
    tabStopWidth: 8,
    theme: getXtermTheme(terminalLocation),
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
    fitAddon,
    webLinksAddon,
    container,
    exited: false,
  };

  terminals.set(id, instance);

  // Initialize split layout for this tab (single leaf)
  if (!tabLayouts.has(id)) {
    tabLayouts.set(id, createLeaf(id));
    tabActivePaneIds.set(id, id);
    persistLayoutState();
  }

  if (isActive) {
    activeTabId = id;
  }

  // Fit after opening (deferred to allow layout to settle)
  setTimeout(() => {
    // Guard: terminal may have been disposed during async delay
    if (!terminals.has(id)) {
      return;
    }
    fitAddon.fit();
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
  const next = terminals.get(newTabId);
  if (!next) {
    return;
  }

  const containerEl = document.getElementById("terminal-container");

  // Hide current tab's container
  if (activeTabId && activeTabId !== newTabId && containerEl) {
    const currentTabContainer = containerEl.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLDivElement | null;
    if (currentTabContainer) {
      currentTabContainer.style.display = "none";
    } else {
      // Fallback for non-split tabs
      const current = terminals.get(activeTabId);
      if (current) {
        current.container.style.display = "none";
      }
    }
  }

  // Show new tab's container
  activeTabId = newTabId;
  if (containerEl) {
    const newTabContainer = containerEl.querySelector(`[data-tab-id="${newTabId}"]`) as HTMLDivElement | null;
    if (newTabContainer) {
      newTabContainer.style.display = "block";
    } else {
      next.container.style.display = "block";
    }
  } else {
    next.container.style.display = "block";
  }

  // Fit after display change (container now has dimensions)
  requestAnimationFrame(() => {
    // Guard: terminal may have been disposed during async frame
    if (!terminals.has(newTabId)) {
      return;
    }
    // Fit all leaves in the split tree
    const layout = tabLayouts.get(newTabId);
    if (layout) {
      const sessionIds = getAllSessionIds(layout);
      for (const sessionId of sessionIds) {
        const instance = terminals.get(sessionId);
        if (instance) {
          instance.fitAddon.fit();
        }
      }
    } else {
      next.fitAddon.fit();
    }
    // Focus the active pane's terminal
    const activePaneId = tabActivePaneIds.get(newTabId) ?? newTabId;
    const activeInstance = terminals.get(activePaneId);
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
  const instance = terminals.get(id);
  if (!instance) {
    return;
  }

  // Get all session IDs in this tab's split tree (if any) before cleanup
  const layout = tabLayouts.get(id);
  const splitSessionIds = layout ? getAllSessionIds(layout).filter((sid) => sid !== id) : [];

  // 1. Dispose the root terminal
  instance.terminal.dispose();
  instance.container.remove();
  terminals.delete(id);

  // 1b. Dispose all split pane terminals belonging to this tab
  for (const splitId of splitSessionIds) {
    const splitInstance = terminals.get(splitId);
    if (splitInstance) {
      splitInstance.terminal.dispose();
      splitInstance.container.remove();
      terminals.delete(splitId);
    }
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
  tabLayouts.delete(id);
  tabActivePaneIds.delete(id);
  const cleanups = resizeCleanups.get(id);
  if (cleanups) {
    for (const cleanup of cleanups) {
      cleanup();
    }
    resizeCleanups.delete(id);
  }
  persistLayoutState();

  // 4. If this was active tab, switch to next available tab
  if (activeTabId === id) {
    // Find remaining root tabs (those with tabLayouts entries)
    const remainingTabs = Array.from(tabLayouts.keys());
    if (remainingTabs.length > 0) {
      switchTab(remainingTabs[remainingTabs.length - 1]);
    } else {
      activeTabId = null;
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
  const tabTerminals = new Map<string, { name: string }>();
  for (const [tabId, layout] of tabLayouts) {
    if (layout.type === "branch") {
      // Split tab — show active pane's name
      const activePaneId = tabActivePaneIds.get(tabId) ?? tabId;
      const activeInstance = terminals.get(activePaneId);
      const rootInstance = terminals.get(tabId);
      tabTerminals.set(tabId, { name: activeInstance?.name ?? rootInstance?.name ?? tabId });
    } else {
      // Single pane tab
      const instance = terminals.get(tabId);
      if (instance) {
        tabTerminals.set(tabId, { name: instance.name });
      }
    }
  }

  renderTabBar({
    tabBarEl,
    terminals: tabTerminals,
    activeTabId,
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
    currentConfig.fontSize = config.fontSize;
  }
  if (config.cursorBlink !== undefined) {
    currentConfig.cursorBlink = config.cursorBlink;
  }
  if (config.scrollback !== undefined) {
    currentConfig.scrollback = config.scrollback;
  }
  if (config.fontFamily !== undefined) {
    currentConfig.fontFamily = config.fontFamily;
  }

  const needsRefit = config.fontSize !== undefined || config.fontFamily !== undefined;

  for (const instance of terminals.values()) {
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
      instance.fitAddon.fit();
    }
  }
}

// ─── Message Router ─────────────────────────────────────────────────

/**
 * Handle messages from the Extension Host.
 * See: docs/design/message-protocol.md#§4
 */
function handleMessage(msg: ExtensionToWebViewMessage): void {
  switch (msg.type) {
    case "init":
      handleInit(msg);
      break;

    case "output": {
      const dataLen = msg.data.length;
      const instance = terminals.get(msg.tabId);
      if (instance) {
        instance.terminal.write(msg.data, () => {
          ackChars(dataLen);
        });
      } else {
        // Tab not found — still ack to prevent flow control deadlock
        ackChars(dataLen);
      }
      break;
    }

    case "exit": {
      const instance = terminals.get(msg.tabId);
      if (instance) {
        instance.exited = true;
        instance.terminal.write(`\r\n\x1b[90m[Process exited with code ${msg.code}]\x1b[0m\r\n`);
      }
      break;
    }

    case "tabCreated": {
      // Create new terminal (inactive initially) and switch to it
      createTerminal(msg.tabId, msg.name, currentConfig, false);
      switchTab(msg.tabId);
      // Note: switchTab already calls updateTabBar()
      break;
    }

    case "tabRemoved":
      removeTerminal(msg.tabId);
      // Note: removeTerminal already calls updateTabBar()
      break;

    case "restore": {
      const instance = terminals.get(msg.tabId);
      if (instance) {
        instance.terminal.write(msg.data);
      }
      break;
    }

    case "configUpdate":
      applyConfig(msg.config);
      break;

    case "viewShow":
      onViewShow();
      break;

    case "splitPane": {
      // Extension host requests a split — forward to extension to create a new session
      if (!activeTabId) {
        break;
      }
      const activePaneId = tabActivePaneIds.get(activeTabId) ?? activeTabId;
      vscode.postMessage({
        type: "requestSplitSession",
        direction: msg.direction,
        sourcePaneId: activePaneId,
      });
      break;
    }

    case "splitPaneCreated": {
      // Extension host created a new session for a split pane
      if (!activeTabId) {
        break;
      }
      const layout = tabLayouts.get(activeTabId);
      if (!layout) {
        break;
      }

      // Create a new terminal for the split pane (not active tab-level, just a terminal instance)
      const newInstance = createTerminal(msg.newSessionId, msg.newSessionName, currentConfig, false);
      // Don't create a new tab layout for this terminal — it's part of the existing tab's split tree
      tabLayouts.delete(msg.newSessionId);
      tabActivePaneIds.delete(msg.newSessionId);

      // Update the split tree: replace the source leaf with a branch containing source + new
      const newBranch = createBranch(msg.direction, createLeaf(msg.sourcePaneId), createLeaf(msg.newSessionId));
      const updatedLayout = replaceNode(layout, msg.sourcePaneId, newBranch);
      tabLayouts.set(activeTabId, updatedLayout);

      // Set the new pane as active
      tabActivePaneIds.set(activeTabId, msg.newSessionId);

      // Re-render the split tree
      _renderTabSplitTree(activeTabId);
      showTabContainer(activeTabId);
      persistLayoutState();

      // Fit all terminals after layout change
      requestAnimationFrame(() => {
        debouncedFitAllLeaves(activeTabId!);
        // Focus the new terminal
        newInstance.terminal.focus();
      });

      // Update tab bar to reflect active pane name
      updateTabBar();
      break;
    }

    case "closeSplitPane": {
      // Close the active pane in the current tab's split layout
      if (!activeTabId) {
        break;
      }
      const activePaneId = tabActivePaneIds.get(activeTabId) ?? activeTabId;
      closeSplitPaneById(activePaneId);
      break;
    }

    case "closeSplitPaneById": {
      // Close a specific pane by session ID (from context menu)
      if (msg.sessionId) {
        closeSplitPaneById(msg.sessionId);
      }
      break;
    }

    case "splitPaneAt": {
      // Split a specific pane (from context menu) — set it as active, then request split
      if (activeTabId && msg.direction && msg.sourcePaneId) {
        tabActivePaneIds.set(activeTabId, msg.sourcePaneId);
        updateActivePaneVisual(activeTabId);
        vscode.postMessage({
          type: "requestSplitSession",
          direction: msg.direction,
          sourcePaneId: msg.sourcePaneId,
        });
      }
      break;
    }

    case "error":
      console.error(`[AnyWhere Terminal] ${msg.severity}: ${msg.message}`);
      break;

    default:
      // Silently ignore unknown message types
      break;
  }
}

/**
 * Handle the init message — create initial terminal instances.
 * See: docs/design/message-protocol.md#§7
 */
function handleInit(msg: InitMessage): void {
  // Store config for future tab creation
  currentConfig = { ...msg.config };

  // Build set of valid tab IDs from the extension's SessionManager
  const validTabIds = new Set(msg.tabs.map((t) => t.id));

  // Restore layout state from previous session (if available)
  const restoredLayouts = restoreLayoutState();
  for (const [tabId, layout] of restoredLayouts) {
    // Only restore layouts for tabs that still exist in SessionManager
    if (validTabIds.has(tabId)) {
      tabLayouts.set(tabId, layout);
    }
  }

  // Prune active pane IDs for tabs that no longer exist
  for (const tabId of tabActivePaneIds.keys()) {
    if (!validTabIds.has(tabId)) {
      tabActivePaneIds.delete(tabId);
    }
  }

  // Create terminal instances for each tab
  for (const tab of msg.tabs) {
    createTerminal(tab.id, tab.name, msg.config, tab.isActive);
  }

  // Set up resize observer on the container
  const containerEl = document.getElementById("terminal-container");
  if (containerEl) {
    setupResizeObserver(containerEl);
  }

  // Persist cleaned-up state
  persistLayoutState();

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
    terminalLocation = locationAttr;
  }
  applyBodyBackground(terminalLocation);

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
      terminals,
      activeTabId,
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
    handleMessage(msg as ExtensionToWebViewMessage);
  });

  // Start theme change watcher
  startThemeWatcher();

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
