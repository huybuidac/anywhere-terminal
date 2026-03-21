// src/settings/SettingsReader.ts — Reads and resolves extension settings from VS Code configuration
// See: specs/extension-settings/spec.md#settings-reader

import * as fs from "node:fs";
import * as os from "node:os";
import * as vscode from "vscode";
import * as PtyManager from "../pty/PtyManager";
import type { TerminalConfig } from "../types/messages";

// ─── Constants ──────────────────────────────────────────────────────

/** Minimum allowed font size in pixels. */
const FONT_SIZE_MIN = 6;

/** Maximum allowed font size in pixels. */
const FONT_SIZE_MAX = 100;

/** Default font size when no setting is configured. */
const DEFAULT_FONT_SIZE = 14;

/** Default scrollback buffer size. */
const DEFAULT_SCROLLBACK = 10000;

/** Default font family. */
const DEFAULT_FONT_FAMILY = "monospace";

// ─── Resolved Settings Type ─────────────────────────────────────────

/** Fully resolved terminal settings including shell/cwd. */
export interface ResolvedTerminalSettings extends TerminalConfig {
  /** Resolved shell path */
  shell: string;
  /** Resolved shell arguments */
  shellArgs: string[];
  /** Resolved working directory */
  cwd: string;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Read all `anywhereTerminal.*` settings and resolve them with fallback chains.
 *
 * Font size resolution: anywhereTerminal.fontSize (if >0) → terminal.integrated.fontSize (if >0) → editor.fontSize (if >0) → 14
 * Font family resolution: anywhereTerminal.fontFamily (if non-empty) → terminal.integrated.fontFamily (if non-empty) → editor.fontFamily (if non-empty) → 'monospace'
 * Shell resolution: anywhereTerminal.shell.macOS (if non-empty) → auto-detect via PtyManager.detectShell()
 * CWD resolution: anywhereTerminal.defaultCwd (if non-empty and valid) → workspace root → home directory
 */
export function readTerminalSettings(): ResolvedTerminalSettings {
  const config = vscode.workspace.getConfiguration("anywhereTerminal");
  const terminalConfig = vscode.workspace.getConfiguration("terminal.integrated");
  const editorConfig = vscode.workspace.getConfiguration("editor");

  // Font size resolution chain
  const fontSize = resolveFontSize(
    config.get<number>("fontSize"),
    terminalConfig.get<number>("fontSize"),
    editorConfig.get<number>("fontSize"),
  );

  // Font family resolution chain
  const fontFamily = resolveFontFamily(
    config.get<string>("fontFamily"),
    terminalConfig.get<string>("fontFamily"),
    editorConfig.get<string>("fontFamily"),
  );

  // Cursor blink
  const cursorBlink = config.get<boolean>("cursorBlink") ?? true;

  // Scrollback
  const scrollback = config.get<number>("scrollback") ?? DEFAULT_SCROLLBACK;

  // Shell resolution
  const { shell, shellArgs } = resolveShell(config.get<string>("shell.macOS"), config.get<string[]>("shell.args"));

  // CWD resolution
  const cwd = resolveCwd(config.get<string>("defaultCwd"));

  return {
    fontSize,
    fontFamily,
    cursorBlink,
    scrollback,
    shell,
    shellArgs,
    cwd,
  };
}

/**
 * Read only the TerminalConfig portion of settings (for init/configUpdate messages).
 * Does not resolve shell/cwd — avoids unnecessary synchronous I/O from shell detection.
 */
export function readTerminalConfig(): TerminalConfig {
  const config = vscode.workspace.getConfiguration("anywhereTerminal");
  const terminalConfig = vscode.workspace.getConfiguration("terminal.integrated");
  const editorConfig = vscode.workspace.getConfiguration("editor");

  return {
    fontSize: resolveFontSize(
      config.get<number>("fontSize"),
      terminalConfig.get<number>("fontSize"),
      editorConfig.get<number>("fontSize"),
    ),
    fontFamily: resolveFontFamily(
      config.get<string>("fontFamily"),
      terminalConfig.get<string>("fontFamily"),
      editorConfig.get<string>("fontFamily"),
    ),
    cursorBlink: config.get<boolean>("cursorBlink") ?? true,
    scrollback: config.get<number>("scrollback") ?? DEFAULT_SCROLLBACK,
  };
}

/**
 * Check whether a configuration change event affects any settings
 * that would require a config update to webviews.
 */
export function affectsTerminalConfig(e: vscode.ConfigurationChangeEvent): boolean {
  return (
    e.affectsConfiguration("anywhereTerminal") ||
    e.affectsConfiguration("editor.fontSize") ||
    e.affectsConfiguration("editor.fontFamily") ||
    e.affectsConfiguration("terminal.integrated.fontSize") ||
    e.affectsConfiguration("terminal.integrated.fontFamily")
  );
}

// ─── Private: Resolution Chains ─────────────────────────────────────

/**
 * Resolve font size through the fallback chain with clamping.
 * anywhereTerminal.fontSize (if >0) → terminal.integrated.fontSize (if >0) → editor.fontSize (if >0) → 14
 * Result is clamped to [6, 100].
 */
function resolveFontSize(
  extensionFontSize: number | undefined,
  terminalFontSize: number | undefined,
  editorFontSize: number | undefined,
): number {
  let resolved = DEFAULT_FONT_SIZE;

  if (extensionFontSize !== undefined && extensionFontSize > 0) {
    resolved = extensionFontSize;
  } else if (terminalFontSize !== undefined && terminalFontSize > 0) {
    resolved = terminalFontSize;
  } else if (editorFontSize !== undefined && editorFontSize > 0) {
    resolved = editorFontSize;
  }

  return clampFontSize(resolved);
}

/**
 * Resolve font family through the fallback chain.
 * anywhereTerminal.fontFamily (if non-empty) → terminal.integrated.fontFamily (if non-empty) → editor.fontFamily (if non-empty) → 'monospace'
 */
function resolveFontFamily(
  extensionFontFamily: string | undefined,
  terminalFontFamily: string | undefined,
  editorFontFamily: string | undefined,
): string {
  if (extensionFontFamily?.trim()) {
    return extensionFontFamily.trim();
  }
  if (terminalFontFamily?.trim()) {
    return terminalFontFamily.trim();
  }
  if (editorFontFamily?.trim()) {
    return editorFontFamily.trim();
  }
  return DEFAULT_FONT_FAMILY;
}

/**
 * Resolve shell path and arguments.
 * anywhereTerminal.shell.macOS (if non-empty) → auto-detect via PtyManager.detectShell()
 */
function resolveShell(
  customShell: string | undefined,
  customArgs: string[] | undefined,
): { shell: string; shellArgs: string[] } {
  if (customShell?.trim()) {
    return {
      shell: customShell.trim(),
      shellArgs: customArgs ?? [],
    };
  }

  // Fall back to auto-detection
  const detected = PtyManager.detectShell();
  return {
    shell: detected.shell,
    shellArgs: customArgs && customArgs.length > 0 ? customArgs : detected.args,
  };
}

/**
 * Resolve working directory.
 * anywhereTerminal.defaultCwd (if non-empty and valid directory) → workspace root → home directory
 */
function resolveCwd(customCwd: string | undefined): string {
  if (customCwd?.trim()) {
    const trimmed = customCwd.trim();
    // Validate that the path exists and is a directory
    try {
      const stat = fs.statSync(trimmed);
      if (stat.isDirectory()) {
        return trimmed;
      }
    } catch {
      // Invalid path — fall through to defaults
    }
  }

  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath;
  }

  return os.homedir();
}

/**
 * Clamp font size to the valid range [6, 100].
 */
function clampFontSize(size: number): number {
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
}
