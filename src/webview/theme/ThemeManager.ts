// src/webview/theme/ThemeManager.ts — Terminal theme resolution and watching
//
// Encapsulates VS Code CSS variable -> xterm ITheme resolution, location-aware
// background color, high-contrast detection, and MutationObserver-based theme watching.
//
// See: docs/design/theme-integration.md

import type { Terminal } from "@xterm/xterm";

// ─── Types ──────────────────────────────────────────────────────────

/** Terminal location for theme background fallback. */
export type TerminalLocation = "panel" | "sidebar" | "editor";

// ─── Constants ──────────────────────────────────────────────────────

/** Location-specific background CSS variable fallback map. */
const LOCATION_BACKGROUND_MAP: Record<TerminalLocation, string> = {
  panel: "--vscode-panel-background",
  sidebar: "--vscode-sideBar-background",
  editor: "--vscode-editor-background",
};

// ─── ThemeManager ───────────────────────────────────────────────────

/**
 * Manages terminal theme resolution, application, and watching.
 *
 * Owns:
 * - `location` state (TerminalLocation)
 * - MutationObserver for VS Code theme changes
 * - Theme resolution from CSS variables
 * - Location-aware background color
 */
export class ThemeManager {
  private location: TerminalLocation;
  private observer: MutationObserver | undefined;

  constructor(initialLocation: TerminalLocation = "sidebar") {
    this.location = initialLocation;
  }

  /**
   * Build an xterm.js ITheme object from VS Code's CSS variables.
   * See: docs/design/theme-integration.md#section-6
   */
  getTheme(): Record<string, string | undefined> {
    const style = getComputedStyle(document.documentElement);
    const get = (varName: string): string | undefined => {
      const value = style.getPropertyValue(varName).trim();
      return value || undefined;
    };

    const background = get(LOCATION_BACKGROUND_MAP[this.location]) ?? get("--vscode-terminal-background") ?? "#1e1e1e";

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
   * Get the appropriate minimum contrast ratio based on the current theme.
   * High-contrast themes use 7 (WCAG AAA), normal themes use 4.5 (WCAG AA).
   */
  getMinimumContrastRatio(): number {
    return this.isHighContrastTheme() ? 7 : 4.5;
  }

  /**
   * Apply the current theme to all terminal instances.
   * Accepts an iterable of objects with a `terminal` property to stay decoupled from TerminalInstance.
   */
  applyToAll(terminals: Iterable<{ terminal: Terminal }>): void {
    const theme = this.getTheme();
    const contrastRatio = this.getMinimumContrastRatio();
    for (const entry of terminals) {
      entry.terminal.options.theme = theme;
      entry.terminal.options.minimumContrastRatio = contrastRatio;
    }
  }

  /** Apply background color for the current location to the webview body. */
  applyBodyBackground(): void {
    const style = getComputedStyle(document.documentElement);
    const varName = LOCATION_BACKGROUND_MAP[this.location];
    const color = style.getPropertyValue(varName).trim();
    if (color) {
      document.body.style.backgroundColor = color;
    }
  }

  /**
   * Update location and re-apply body background if it changed.
   * Returns true if the location actually changed.
   */
  updateLocation(location: TerminalLocation): boolean {
    if (this.location === location) {
      return false;
    }
    this.location = location;
    this.applyBodyBackground();
    return true;
  }

  /**
   * Start watching for VS Code theme changes via MutationObserver on body class.
   * Calls the provided callback when a theme change is detected.
   * See: docs/design/theme-integration.md#section-4
   */
  startWatching(onThemeChange: () => void): void {
    if (this.observer) {
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "class") {
          this.applyBodyBackground();
          onThemeChange();
          break;
        }
      }
    });

    this.observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  /** Stop watching for theme changes and release the MutationObserver. */
  dispose(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
    }
  }

  /**
   * Detect whether the current VS Code theme is a high-contrast theme.
   * High-contrast themes add `vscode-high-contrast` or `vscode-high-contrast-light` class to body.
   */
  private isHighContrastTheme(): boolean {
    return (
      document.body.classList.contains("vscode-high-contrast") ||
      document.body.classList.contains("vscode-high-contrast-light")
    );
  }
}
