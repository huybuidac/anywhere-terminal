// src/webview/TabBarUtils.ts — Tab bar rendering utility
//
// Extracted for testability. Pure DOM rendering function with dependency injection.
// See: docs/design/flow-multi-tab.md#Data-Routing-Architecture

/** Minimal terminal info needed for tab bar rendering. */
export interface TabInfo {
  name: string;
  /** Whether the terminal process has exited. */
  exited?: boolean;
}

/** Dependencies for renderTabBar — injected for testability. */
export interface RenderTabBarDeps {
  tabBarEl: HTMLElement;
  terminals: Map<string, TabInfo>;
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onAddClick: () => void;
}

/**
 * Render the tab bar UI inside the given element.
 *
 * - Clears existing content
 * - Creates tab elements with name + close button
 * - Appends "+" add button
 * - Hides tab bar when <= 1 tab (clean single-tab UX)
 * - Shows tab bar when 2+ tabs
 */
export function renderTabBar(deps: RenderTabBarDeps): void {
  const { tabBarEl, terminals, activeTabId, onTabClick, onTabClose, onAddClick } = deps;

  // 1. Clear existing content
  tabBarEl.innerHTML = "";

  // 2. Create tab elements
  for (const [id, instance] of terminals) {
    const tab = document.createElement("div");
    tab.className = `tab-item${id === activeTabId ? " active" : ""}${instance.exited ? " tab-exited" : ""}`;
    tab.dataset.tabId = id;

    const nameSpan = document.createElement("span");
    nameSpan.className = "tab-name";
    nameSpan.textContent = instance.exited ? `${instance.name} (exited)` : instance.name;
    tab.appendChild(nameSpan);

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close";
    closeBtn.textContent = "\u00d7"; // ×
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onTabClose(id);
    });
    tab.appendChild(closeBtn);

    tab.addEventListener("click", () => {
      onTabClick(id);
    });

    tabBarEl.appendChild(tab);
  }

  // 3. Append "+" add button
  const addBtn = document.createElement("button");
  addBtn.className = "tab-add";
  addBtn.textContent = "+";
  addBtn.addEventListener("click", () => {
    onAddClick();
  });
  tabBarEl.appendChild(addBtn);

  // 4. Toggle visibility: hide when <= 1 tab, show when 2+
  if (terminals.size >= 2) {
    tabBarEl.classList.add("visible");
  } else {
    tabBarEl.classList.remove("visible");
  }
}

/** Dependencies for tab keyboard shortcut handler. */
export interface TabKeyboardDeps {
  terminals: Map<string, TabInfo>;
  activeTabId: string | null;
  switchTab: (tabId: string) => void;
}

/**
 * Handle Ctrl+Tab / Ctrl+Shift+Tab keyboard events for tab cycling.
 * Returns true if the event was handled (caller should preventDefault).
 *
 * See: docs/design/flow-multi-tab.md#Keyboard-Shortcut
 */
export function handleTabKeyboardShortcut(
  e: { ctrlKey: boolean; shiftKey: boolean; key: string },
  deps: TabKeyboardDeps,
): boolean {
  if (!e.ctrlKey || e.key !== "Tab") {
    return false;
  }

  const tabIds = Array.from(deps.terminals.keys());
  if (tabIds.length <= 1) {
    return true; // Handled but no-op (single tab)
  }

  const currentIndex = deps.activeTabId ? tabIds.indexOf(deps.activeTabId) : -1;
  if (currentIndex === -1) {
    return true;
  }

  let nextIndex: number;
  if (e.shiftKey) {
    // Ctrl+Shift+Tab: cycle backward with wrap-around
    nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
  } else {
    // Ctrl+Tab: cycle forward with wrap-around
    nextIndex = (currentIndex + 1) % tabIds.length;
  }

  deps.switchTab(tabIds[nextIndex]);
  return true;
}
