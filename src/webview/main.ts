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

/** Terminal location — set from init message config. TODO: wire from init in Phase 2. */
const terminalLocation: TerminalLocation = "panel";

/** Current terminal config — set from init, updated by configUpdate. */
let currentConfig: TerminalConfig = {
  fontSize: 14,
  cursorBlink: true,
  scrollback: 10000,
};

/** Flow control: accumulated chars since last ack. */
let unsentAckChars = 0;

/** Whether a resize was deferred because the container was invisible. */
let pendingResize = false;

/** Debounce timer for resize events. */
let resizeTimeout: number | undefined;

/** IME composition tracking. */
let isComposing = false;

/** ResizeObserver instance — one per webview, observes #terminal-container. */
let resizeObserver: ResizeObserver | undefined;

/** MutationObserver for theme change detection. */
let themeObserver: MutationObserver | undefined;

// ─── Theme Manager ──────────────────────────────────────────────────

/**
 * Build an xterm.js ITheme object from VS Code's CSS variables.
 * See: docs/design/theme-integration.md#§6
 */
function getXtermTheme(location: TerminalLocation = "panel"): Record<string, string | undefined> {
  const style = getComputedStyle(document.documentElement);
  const get = (varName: string): string | undefined => {
    const value = style.getPropertyValue(varName).trim();
    return value || undefined;
  };

  const background = get("--vscode-terminal-background") ?? get(LOCATION_BACKGROUND_MAP[location]) ?? "#1e1e1e";

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
  };
}

/**
 * Apply the current theme to all terminal instances.
 */
function applyThemeToAll(): void {
  const theme = getXtermTheme(terminalLocation);
  for (const instance of terminals.values()) {
    instance.terminal.options.theme = theme;
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
 */
function debouncedFit(): void {
  clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(() => {
    const instance = activeTabId ? terminals.get(activeTabId) : undefined;
    if (instance) {
      instance.fitAddon.fit();
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
      const instance = activeTabId ? terminals.get(activeTabId) : undefined;
      if (instance) {
        instance.fitAddon.fit();
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
  containerEl.appendChild(container);

  // Create xterm.js Terminal with config
  const terminal = new Terminal({
    scrollback: config.scrollback || 10000,
    cursorBlink: config.cursorBlink ?? true,
    cursorStyle: "block",
    fontSize: config.fontSize || 14,
    fontFamily: getFontFamily(),
    macOptionIsMeta: false,
    macOptionClickForcesSelection: true,
    drawBoldTextInBrightColors: true,
    minimumContrastRatio: 4.5,
    rightClickSelectsWord: false,
    fastScrollSensitivity: 5,
    tabStopWidth: 8,
    theme: getXtermTheme(terminalLocation),
  });

  // Load Tier 1 addons
  const fitAddon = new FitAddon();
  const webLinksAddon = new WebLinksAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);

  // Open terminal in container
  terminal.open(container);

  // Try to enable WebGL renderer for better rendering on Retina displays
  // (eliminates horizontal line gaps between rows in canvas renderer)
  try {
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
      webglAddon.dispose();
    });
    terminal.loadAddon(webglAddon);
  } catch {
    console.warn("[AnyWhere Terminal] WebGL renderer not available, using canvas fallback");
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

  if (isActive) {
    activeTabId = id;
  }

  return instance;
}

/**
 * Switch the active terminal tab (CSS display toggle).
 * See: docs/design/xterm-integration.md#§7
 */
function switchTab(newTabId: string): void {
  // Validate target exists before hiding current
  const next = terminals.get(newTabId);
  if (!next) {
    return;
  }

  // Hide current
  if (activeTabId && activeTabId !== newTabId) {
    const current = terminals.get(activeTabId);
    if (current) {
      current.container.style.display = "none";
    }
  }

  // Show new
  next.container.style.display = "block";
  activeTabId = newTabId;

  // Fit after display change (container now has dimensions)
  requestAnimationFrame(() => {
    // Guard: terminal may have been disposed during async frame
    if (!terminals.has(newTabId)) {
      return;
    }
    next.fitAddon.fit();
    next.terminal.focus();
  });
}

/**
 * Remove and dispose a terminal instance.
 * See: docs/design/xterm-integration.md#§6 Disposal
 */
function removeTerminal(id: string): void {
  const instance = terminals.get(id);
  if (!instance) {
    return;
  }

  // 1. Dispose xterm.js (disposes loaded addons too)
  instance.terminal.dispose();

  // 2. Remove DOM element
  instance.container.remove();

  // 3. Remove from map
  terminals.delete(id);

  // 4. If this was active tab, switch to next
  if (activeTabId === id) {
    const remaining = Array.from(terminals.keys());
    if (remaining.length > 0) {
      switchTab(remaining[remaining.length - 1]);
    } else {
      activeTabId = null;
    }
  }
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

    // Refit after font size changes (affects cell dimensions)
    if (config.fontSize !== undefined) {
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
      break;
    }

    case "tabRemoved":
      removeTerminal(msg.tabId);
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

  // Create terminal instances for each tab
  for (const tab of msg.tabs) {
    createTerminal(tab.id, tab.name, msg.config, tab.isActive);
  }

  // Set up resize observer on the container
  const containerEl = document.getElementById("terminal-container");
  if (containerEl) {
    setupResizeObserver(containerEl);
  }
}

// ─── Bootstrap ──────────────────────────────────────────────────────

/**
 * Initialize the webview terminal application.
 * Acquires VS Code API, sets up listeners, sends ready handshake.
 * See: docs/design/message-protocol.md#§7
 */
function bootstrap(): void {
  // Set up IME composition tracking
  document.addEventListener("compositionstart", () => {
    isComposing = true;
  });
  document.addEventListener("compositionend", () => {
    isComposing = false;
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
