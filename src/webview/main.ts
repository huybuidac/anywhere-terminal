// src/webview/main.ts — AnyWhere Terminal WebView Entry Point (Composition Root)
//
// Wires together extracted modules and provides thin orchestration.
// All business logic lives in dedicated modules.
//
// See: docs/design/xterm-integration.md, docs/design/message-protocol.md

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

import type { ExtensionToWebViewMessage, InitMessage } from "../types/messages";
import { FlowControl } from "./flow/FlowControl";
import { createMessageRouter } from "./messaging/MessageRouter";
import { ResizeCoordinator } from "./resize/ResizeCoordinator";
import { SplitTreeRenderer } from "./split/SplitTreeRenderer";
import { WebviewStateStore } from "./state/WebviewStateStore";
import { buildTabBarData, handleTabKeyboardShortcut, renderTabBar } from "./TabBarUtils";
import { TerminalFactory } from "./terminal/TerminalFactory";
import { type TerminalLocation, ThemeManager } from "./theme/ThemeManager";
import { showBanner } from "./ui/BannerService";

// ─── State & Services ───────────────────────────────────────────────

const vscode = acquireVsCodeApi();
const store = new WebviewStateStore(vscode);
const themeManager = new ThemeManager("sidebar");
let isComposing = false;

const flowControl = new FlowControl((msg) => vscode.postMessage(msg));
const factory = new TerminalFactory({
  themeManager,
  store,
  postMessage: (msg) => vscode.postMessage(msg),
  onTabBarUpdate: () => updateTabBar(),
  getIsComposing: () => isComposing,
});

function updateLocation(location: TerminalLocation): void {
  if (themeManager.updateLocation(location)) {
    themeManager.applyToAll(store.terminals.values());
  }
}

const resizeCoordinator = new ResizeCoordinator(
  (instance) => factory.fitTerminal(instance),
  () => ({ activeTabId: store.activeTabId, terminals: store.terminals, tabLayouts: store.tabLayouts }),
  (location) => updateLocation(location),
);

const splitRenderer = new SplitTreeRenderer({
  store,
  resizeCoordinator,
  flowControl,
  postMessage: (msg) => vscode.postMessage(msg),
  onTabBarUpdate: () => updateTabBar(),
});

// ─── Orchestration ──────────────────────────────────────────────────

function updateTabBar(): void {
  const tabBarEl = document.getElementById("tab-bar");
  if (!tabBarEl) {
    return;
  }
  renderTabBar({
    tabBarEl,
    terminals: buildTabBarData(store),
    activeTabId: store.activeTabId,
    onTabClick: (tabId) => switchTab(tabId),
    onTabClose: (tabId) => vscode.postMessage({ type: "closeTab", tabId }),
    onAddClick: () => vscode.postMessage({ type: "createTab" }),
  });
}

function switchTab(newTabId: string): void {
  const next = store.terminals.get(newTabId);
  if (!next) {
    return;
  }

  // Hide current tab
  if (store.activeTabId && store.activeTabId !== newTabId) {
    splitRenderer.hideTabContainer(store.activeTabId);
    const current = store.terminals.get(store.activeTabId);
    if (current) {
      current.container.style.display = "none";
    }
  }

  // Show new tab
  store.activeTabId = newTabId;
  splitRenderer.showTabContainer(newTabId);
  next.container.style.display = "block";

  // Fit after display change
  requestAnimationFrame(() => {
    if (!store.terminals.has(newTabId)) {
      return;
    }
    factory.fitAllAndFocus(newTabId, next);
  });

  splitRenderer.updateActivePaneVisual(newTabId);
  updateTabBar();
  vscode.postMessage({ type: "switchTab", tabId: newTabId });
}

function removeTerminal(id: string): void {
  const instance = store.terminals.get(id);
  if (!instance) {
    return;
  }

  // Dispose root terminal
  instance.terminal.dispose();
  instance.container.remove();
  store.terminals.delete(id);
  flowControl.delete(id);

  // Delegate split cleanup to renderer
  splitRenderer.removeTab(id);
  store.persist();

  // Switch to next available tab or request new one
  if (store.activeTabId === id) {
    const remaining = Array.from(store.tabLayouts.keys());
    if (remaining.length > 0) {
      switchTab(remaining[remaining.length - 1]);
    } else {
      store.activeTabId = null;
      vscode.postMessage({ type: "createTab" });
    }
  }
  updateTabBar();
}

// ─── Message Router ─────────────────────────────────────────────────

const routeMessage = createMessageRouter({
  onOutput(msg) {
    const dataLen = msg.data.length;
    const instance = store.terminals.get(msg.tabId);
    if (instance) {
      instance.terminal.write(msg.data, () => flowControl.ackChars(dataLen, msg.tabId));
    } else {
      flowControl.ackChars(dataLen, msg.tabId);
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
    factory.createTerminal(msg.tabId, msg.name, store.currentConfig, false);
    switchTab(msg.tabId);
  },
  onTabRemoved(msg) {
    removeTerminal(msg.tabId);
  },
  onRestore(msg) {
    const instance = store.terminals.get(msg.tabId);
    if (instance) {
      instance.terminal.write(msg.data);
    }
  },
  onConfigUpdate(msg) {
    factory.applyConfig(msg.config);
  },
  onViewShow() {
    resizeCoordinator.onViewShow();
  },
  onSplitPane(msg) {
    if (!store.activeTabId) {
      return;
    }
    const activePaneId = store.tabActivePaneIds.get(store.activeTabId) ?? store.activeTabId;
    vscode.postMessage({ type: "requestSplitSession", direction: msg.direction, sourcePaneId: activePaneId });
  },
  onSplitPaneCreated(msg) {
    splitRenderer.handleSplitPaneCreated(msg, factory);
  },
  onCloseSplitPane() {
    if (!store.activeTabId) {
      return;
    }
    splitRenderer.closeSplitPaneById(store.tabActivePaneIds.get(store.activeTabId) ?? store.activeTabId);
  },
  onCloseSplitPaneById(msg) {
    if (msg.sessionId) {
      splitRenderer.closeSplitPaneById(msg.sessionId);
    }
  },
  onSplitPaneAt(msg) {
    if (store.activeTabId && msg.direction && msg.sourcePaneId) {
      store.tabActivePaneIds.set(store.activeTabId, msg.sourcePaneId);
      splitRenderer.updateActivePaneVisual(store.activeTabId);
      vscode.postMessage({ type: "requestSplitSession", direction: msg.direction, sourcePaneId: msg.sourcePaneId });
    }
  },
  onCtxClear(msg) {
    const instance = msg.sessionId ? store.terminals.get(msg.sessionId) : factory.getActivePaneTerminal();
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

// ─── Init & Bootstrap ───────────────────────────────────────────────

function handleInit(msg: InitMessage): void {
  store.currentConfig = { ...msg.config };
  const validTabIds = new Set(msg.tabs.map((t) => t.id));

  const restoredLayouts = store.restore();
  for (const [tabId, layout] of restoredLayouts) {
    if (validTabIds.has(tabId)) {
      store.tabLayouts.set(tabId, layout);
    }
  }
  for (const tabId of store.tabActivePaneIds.keys()) {
    if (!validTabIds.has(tabId)) {
      store.tabActivePaneIds.delete(tabId);
    }
  }
  for (const tab of msg.tabs) {
    factory.createTerminal(tab.id, tab.name, msg.config, tab.isActive);
  }
  const containerEl = document.getElementById("terminal-container");
  if (containerEl) {
    resizeCoordinator.setup(containerEl);
  }
  store.persist();
  updateTabBar();
}

function bootstrap(): void {
  const locationAttr = document.body.getAttribute("data-terminal-location");
  if (locationAttr === "sidebar" || locationAttr === "panel" || locationAttr === "editor") {
    themeManager.updateLocation(locationAttr);
  }
  themeManager.applyBodyBackground();

  document.addEventListener("compositionstart", () => {
    isComposing = true;
  });
  document.addEventListener("compositionend", () => {
    isComposing = false;
  });
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (handleTabKeyboardShortcut(e, { terminals: store.terminals, activeTabId: store.activeTabId, switchTab })) {
      e.preventDefault();
    }
  });
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
  window.addEventListener("resize", () => {
    resizeCoordinator.debouncedFit();
  });
  themeManager.startWatching(() => {
    themeManager.applyToAll(store.terminals.values());
  });
  vscode.postMessage({ type: "ready" });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
