// @vitest-environment jsdom
// src/webview/theme/ThemeManager.test.ts — Unit tests for ThemeManager

import type { Terminal } from "@xterm/xterm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockTerminal } from "../test-utils/mockTerminal";
import { ThemeManager } from "./ThemeManager";

// ─── Helpers ────────────────────────────────────────────────────────

/** Map of CSS variable names to values for mocking getComputedStyle. */
const cssVars: Record<string, string> = {};

function setCssVar(name: string, value: string): void {
  cssVars[name] = value;
}

function clearCssVars(): void {
  for (const key of Object.keys(cssVars)) {
    delete cssVars[key];
  }
}

beforeEach(() => {
  clearCssVars();
  // Mock getComputedStyle to return controlled CSS variable values
  vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
    return {
      getPropertyValue(prop: string): string {
        return cssVars[prop] ?? "";
      },
    } as CSSStyleDeclaration;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.className = "";
  document.body.style.backgroundColor = "";
});

// ─── Tests ──────────────────────────────────────────────────────────

describe("ThemeManager", () => {
  it("resolves theme from CSS variables", () => {
    setCssVar("--vscode-sideBar-background", "#252526");
    setCssVar("--vscode-terminal-foreground", "#d4d4d4");
    setCssVar("--vscode-terminal-ansiRed", "#f44747");
    setCssVar("--vscode-terminalCursor-foreground", "#aeafad");

    const tm = new ThemeManager("sidebar");
    const theme = tm.getTheme();

    expect(theme.background).toBe("#252526");
    expect(theme.foreground).toBe("#d4d4d4");
    expect(theme.red).toBe("#f44747");
    expect(theme.cursor).toBe("#aeafad");
  });

  it("uses location-specific background CSS variable", () => {
    setCssVar("--vscode-panel-background", "#1e1e1e");
    setCssVar("--vscode-sideBar-background", "#252526");
    setCssVar("--vscode-editor-background", "#1d1d1d");

    const panelTm = new ThemeManager("panel");
    expect(panelTm.getTheme().background).toBe("#1e1e1e");

    const sidebarTm = new ThemeManager("sidebar");
    expect(sidebarTm.getTheme().background).toBe("#252526");

    const editorTm = new ThemeManager("editor");
    expect(editorTm.getTheme().background).toBe("#1d1d1d");
  });

  it("falls back to terminal-background then hardcoded default", () => {
    // No location-specific var set, but terminal-background is set
    setCssVar("--vscode-terminal-background", "#111111");
    const tm = new ThemeManager("sidebar");
    expect(tm.getTheme().background).toBe("#111111");

    // No vars at all — hardcoded default
    clearCssVars();
    expect(tm.getTheme().background).toBe("#1e1e1e");
  });

  it("returns 7 for high-contrast themes and 4.5 for normal", () => {
    const tm = new ThemeManager();

    // Normal theme
    expect(tm.getMinimumContrastRatio()).toBe(4.5);

    // High contrast dark
    document.body.classList.add("vscode-high-contrast");
    expect(tm.getMinimumContrastRatio()).toBe(7);

    // Reset and try high contrast light
    document.body.classList.remove("vscode-high-contrast");
    document.body.classList.add("vscode-high-contrast-light");
    expect(tm.getMinimumContrastRatio()).toBe(7);
  });

  it("applyToAll sets theme and contrastRatio on all terminals", () => {
    setCssVar("--vscode-sideBar-background", "#252526");
    setCssVar("--vscode-terminal-foreground", "#cccccc");

    const tm = new ThemeManager("sidebar");
    const t1 = createMockTerminal();
    const t2 = createMockTerminal();

    tm.applyToAll([{ terminal: t1 as unknown as Terminal }, { terminal: t2 as unknown as Terminal }]);

    const expectedTheme = tm.getTheme();
    expect(t1.options.theme).toEqual(expectedTheme);
    expect(t2.options.theme).toEqual(expectedTheme);
    expect(t1.options.minimumContrastRatio).toBe(4.5);
    expect(t2.options.minimumContrastRatio).toBe(4.5);
  });

  it("updateLocation returns true when location changes, false when same", () => {
    const tm = new ThemeManager("sidebar");

    expect(tm.updateLocation("panel")).toBe(true);
    expect(tm.updateLocation("panel")).toBe(false);
    expect(tm.updateLocation("editor")).toBe(true);
    expect(tm.updateLocation("sidebar")).toBe(true);
    expect(tm.updateLocation("sidebar")).toBe(false);
  });

  it("startWatching triggers callback on body class mutation", async () => {
    const tm = new ThemeManager();
    const callback = vi.fn();
    tm.startWatching(callback);

    // Mutate body class to simulate theme change
    document.body.className = "vscode-dark";

    // MutationObserver is async; wait for it to fire
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledTimes(1);
    });

    tm.dispose();
  });

  it("dispose disconnects the MutationObserver", async () => {
    const tm = new ThemeManager();
    const callback = vi.fn();
    tm.startWatching(callback);
    tm.dispose();

    // Mutations after dispose should NOT trigger callback
    document.body.className = "vscode-light";

    // Give mutation observer a chance to fire (it shouldn't)
    await new Promise((r) => setTimeout(r, 50));
    expect(callback).not.toHaveBeenCalled();
  });
});
