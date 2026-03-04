// src/pty/PtyManager.ts — Singleton for node-pty loading, shell detection, environment building, CWD resolution
// See: docs/design/pty-manager.md

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { PtyLoadError, ShellNotFoundError } from "../types/errors";

// ─── node-pty Type Definitions ──────────────────────────────────────
// Minimal type interface for node-pty to avoid requiring the native package as a dev dependency.
// These match the subset of node-pty's API that we use.

/** Options for spawning a PTY process. */
export interface PtyForkOptions {
  name?: string;
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
}

/** A spawned PTY process. */
export interface Pty {
  /** The process ID. */
  readonly pid: number;
  /** The column count. */
  readonly cols: number;
  /** The row count. */
  readonly rows: number;
  /** Write data to the PTY. */
  write(data: string): void;
  /** Resize the PTY. */
  resize(columns: number, rows: number): void;
  /** Kill the PTY process. */
  kill(signal?: string): void;
  /** Pause the PTY (flow control). */
  pause(): void;
  /** Resume the PTY (flow control). */
  resume(): void;
  /** Register a data event handler. */
  onData: PtyEvent<string>;
  /** Register an exit event handler. */
  onExit: PtyEvent<{ exitCode: number; signal?: number }>;
}

/** Event handler registration function (returns a disposable). */
export type PtyEvent<T> = (listener: (e: T) => void) => { dispose(): void };

/** The node-pty module interface. */
export interface NodePtyModule {
  spawn(file: string, args: string[], options: PtyForkOptions): Pty;
}

// ─── node-pty Module Cache ──────────────────────────────────────────

/** Cached node-pty module — loaded once, reused across all sessions. */
let cachedNodePty: NodePtyModule | undefined;

// ─── Constants ──────────────────────────────────────────────────────

/** Candidate paths for node-pty within VS Code's installation, tried in order. */
const NODE_PTY_CANDIDATE_PATHS = ["node_modules.asar/node-pty", "node_modules/node-pty"] as const;

/** Shell fallback chain for macOS. */
const SHELL_FALLBACK_CHAIN = ["/bin/zsh", "/bin/bash", "/bin/sh"] as const;

/** Shells that support the --login flag. /bin/sh does NOT reliably support --login. */
const LOGIN_SHELLS = new Set(["/bin/zsh", "/bin/bash"]);

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Load node-pty from VS Code's internal modules.
 * Caches the module after first successful load.
 *
 * Returns the node-pty module with a `spawn` function.
 * We use a minimal type interface to avoid requiring the native node-pty package as a dev dependency.
 *
 * @throws {PtyLoadError} if node-pty cannot be found at any candidate path
 */
export function loadNodePty(): NodePtyModule {
  if (cachedNodePty) {
    return cachedNodePty;
  }

  const appRoot = vscode.env.appRoot;
  const attemptedPaths: string[] = [];

  for (const candidate of NODE_PTY_CANDIDATE_PATHS) {
    const fullPath = path.join(appRoot, candidate);
    attemptedPaths.push(fullPath);

    try {
      // Use module.require to bypass esbuild's require replacement.
      // esbuild replaces bare `require()` with `__require`, but `module.require`
      // is the real Node.js require function that can resolve external paths.
      const pty = module.require(fullPath);
      cachedNodePty = pty;
      return pty;
    } catch {
      // Try next candidate
    }
  }

  throw new PtyLoadError(attemptedPaths);
}

/**
 * Detect the user's preferred shell and arguments on macOS.
 * Priority: $SHELL → /bin/zsh → /bin/bash → /bin/sh
 *
 * @throws {ShellNotFoundError} if no valid shell is found (extremely unlikely on macOS)
 */
export function detectShell(): { shell: string; args: string[] } {
  const attemptedShells: string[] = [];

  // 1. Try $SHELL environment variable
  const envShell = process.env.SHELL;
  if (envShell) {
    attemptedShells.push(envShell);
    if (validateShell(envShell)) {
      return { shell: envShell, args: getShellArgs(envShell) };
    }
  }

  // 2. Try fallback chain
  for (const shell of SHELL_FALLBACK_CHAIN) {
    attemptedShells.push(shell);
    if (validateShell(shell)) {
      return { shell, args: getShellArgs(shell) };
    }
  }

  throw new ShellNotFoundError(attemptedShells);
}

/**
 * Build the environment variables for a new PTY process.
 * Clones process.env and adds terminal-specific overrides.
 *
 * Variables set: TERM, COLORTERM, LANG (if unset), TERM_PROGRAM, TERM_PROGRAM_VERSION.
 * Variables preserved (never overridden): PATH, HOME, SHELL.
 */
export function buildEnvironment(): Record<string, string> {
  // Clone process.env, filtering out undefined values for type safety.
  // process.env values are string | undefined; node-pty expects Record<string, string>.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // Terminal type
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";

  // UTF-8 locale — only set if not already configured
  if (!env.LANG) {
    env.LANG = "en_US.UTF-8";
  }

  // Identify our terminal program
  env.TERM_PROGRAM = "AnyWhereTerminal";

  // Extension version
  const ext = vscode.extensions.getExtension("anywhere-terminal.anywhere-terminal");
  env.TERM_PROGRAM_VERSION = ext?.packageJSON?.version ?? "0.0.0";

  return env;
}

/**
 * Resolve the working directory for a new PTY process.
 * Priority: first workspace folder → os.homedir()
 */
export function resolveWorkingDirectory(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath;
  }
  return os.homedir();
}

/**
 * Validate that a shell executable exists and is executable.
 */
export function validateShell(shellPath: string): boolean {
  try {
    const stat = fs.statSync(shellPath);
    // Check: file exists, is a file (not directory), and is executable (any execute bit)
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/**
 * Get default arguments for a shell.
 * Login shell (--login) is used for shells that support it (zsh, bash).
 * /bin/sh does NOT reliably support --login.
 */
function getShellArgs(shellPath: string): string[] {
  // Check the basename to handle paths like /usr/local/bin/zsh
  const basename = path.basename(shellPath);
  if (LOGIN_SHELLS.has(shellPath) || basename === "zsh" || basename === "bash") {
    return ["--login"];
  }
  return [];
}

// ─── Test Helpers ───────────────────────────────────────────────────

/**
 * Reset the cached node-pty module. For testing only.
 * @internal
 */
export function _resetCache(): void {
  cachedNodePty = undefined;
}
