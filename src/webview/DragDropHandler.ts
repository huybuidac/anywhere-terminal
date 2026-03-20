// src/webview/DragDropHandler.ts — Drag-and-drop file path insertion for terminal
//
// Handles file/folder Shift+drops from VS Code Explorer into terminal instances.
// Extracts paths from DataTransfer, escapes them for POSIX shells, and injects
// via the existing input IPC message.
//
// NOTE: OS file manager (Finder) drops are NOT supported — sandboxed WebView
// iframes cannot access File.path or webUtils.getPathForFile().
//
// See: docs/design/message-protocol.md, research/drag-drop-terminal.md

import { escapePathForShell } from "../utils/shellEscape";

// Re-export for backward compat with tests that import from this module
export { escapePathForShell } from "../utils/shellEscape";

// ─── Path Extraction ────────────────────────────────────────────────

/**
 * Extract a decoded filesystem path from a `file://` URI string.
 * Returns the decoded pathname, or `undefined` if the URI is not a file URI.
 */
function fileUriToPath(uri: string): string | undefined {
  try {
    const parsed = new URL(uri.trim());
    if (parsed.protocol !== "file:") {
      return undefined;
    }
    return decodeURIComponent(parsed.pathname);
  } catch {
    return undefined;
  }
}

/**
 * Extract file paths from a DataTransfer object using a multi-strategy approach.
 *
 * Strategies are tried in priority order (matching VS Code's
 * `TerminalInstanceDragAndDropController.onDrop()`), stopping at the first
 * strategy that returns a non-empty result:
 *
 * 1. `ResourceURLs` — VS Code Explorer tree items (JSON array of URI strings)
 * 2. `CodeFiles` — VS Code internal file drag (JSON array of file paths)
 * 3. `text/uri-list` — standard newline-separated `file://` URIs
 * 4. `DataTransfer.files` with `.path` — Electron non-standard file path
 * 5. `text/plain` — raw path text if it starts with `/`
 *
 * Each strategy is wrapped in try/catch for graceful degradation.
 */
export function extractPathsFromDrop(dataTransfer: DataTransfer): string[] {
  // Strategy 1: VS Code Explorer resources (best-effort)
  try {
    const raw = dataTransfer.getData("ResourceURLs");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const paths = parsed.map(fileUriToPath).filter((p): p is string => p !== undefined);
        if (paths.length > 0) {
          return paths;
        }
      }
    }
  } catch (e) {
    console.warn("[AnyWhere Terminal] Failed to parse ResourceURLs drag data:", e);
  }

  // Strategy 2: VS Code internal CodeFiles (best-effort)
  try {
    const raw = dataTransfer.getData("CodeFiles");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const paths = parsed.filter((p): p is string => typeof p === "string" && p.length > 0);
        if (paths.length > 0) {
          return paths;
        }
      }
    }
  } catch (e) {
    console.warn("[AnyWhere Terminal] Failed to parse CodeFiles drag data:", e);
  }

  // Strategy 3: Standard text/uri-list (newline-separated file:// URIs)
  try {
    const raw = dataTransfer.getData("text/uri-list");
    if (raw) {
      const paths = raw
        .split("\n")
        .map((line) => fileUriToPath(line))
        .filter((p): p is string => p !== undefined);
      if (paths.length > 0) {
        return paths;
      }
    }
  } catch {
    // Fall through
  }

  // Strategy 4: Electron File.path (non-standard property on File objects)
  try {
    const files = dataTransfer.files;
    if (files && files.length > 0) {
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Electron adds a non-standard .path property to File objects
        const filePath = (file as File & { path?: string }).path;
        if (filePath) {
          paths.push(filePath);
        }
      }
      if (paths.length > 0) {
        return paths;
      }
    }
  } catch {
    // Fall through
  }

  // Strategy 5: text/plain — use as path if it starts with /
  try {
    const raw = dataTransfer.getData("text/plain");
    if (raw?.startsWith("/")) {
      return [raw];
    }
  } catch {
    // Fall through
  }

  return [];
}

// ─── DragDropHandler Class ──────────────────────────────────────────

/** Dependencies injected into DragDropHandler (follows InputHandler.ts DI pattern). */
export interface DragDropHandlerDeps {
  postMessage: (msg: unknown) => void;
  /** Returns the active pane session ID (not the tab ID) for correct split-pane routing. */
  getActiveSessionId: () => string | null;
  getTerminalExited: () => boolean;
}

/**
 * Handles drag-and-drop of files/folders onto terminal containers.
 *
 * Shows a visual overlay during drag-over and inserts shell-escaped
 * file paths into the active terminal session on drop.
 *
 * See: specs/drag-drop-path-insertion/spec.md
 */
export class DragDropHandler {
  private readonly postMessage: (msg: unknown) => void;
  private readonly getActiveSessionId: () => string | null;
  private readonly getTerminalExited: () => boolean;
  private dropOverlay: HTMLDivElement | null = null;
  private container: HTMLElement | null = null;
  private isSetup = false;

  constructor(deps: DragDropHandlerDeps) {
    this.postMessage = deps.postMessage;
    this.getActiveSessionId = deps.getActiveSessionId;
    this.getTerminalExited = deps.getTerminalExited;
  }

  /**
   * Attach drag-and-drop event listeners to a container element.
   * Typically called with `#terminal-container` during init.
   */
  setup(container: HTMLElement): void {
    // Guard against double-registration
    if (this.isSetup) {
      return;
    }
    this.isSetup = true;
    this.container = container;

    // Ensure container is positioned for absolute overlay
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    container.addEventListener("dragenter", this.onDragEnter);
    container.addEventListener("dragover", this.onDragOver);
    container.addEventListener("dragleave", this.onDragLeave);
    container.addEventListener("drop", this.onDrop);
  }

  // ─── Event Handlers (arrow functions for stable `this`) ─────────

  private onDragEnter = (e: DragEvent): void => {
    this.showOverlay(e.shiftKey);
  };

  private onDragOver = (e: DragEvent): void => {
    // Must preventDefault on dragover to allow the drop
    e.preventDefault();
    // Update overlay hint based on Shift key state (user may press/release Shift mid-drag)
    this.updateOverlayHint(e.shiftKey);
  };

  private onDragLeave = (e: DragEvent): void => {
    // Only remove overlay if the drag target left the container entirely.
    // When dragging over child elements (xterm DOM), dragleave fires but
    // relatedTarget is still inside — we should NOT remove the overlay.
    if (this.container && e.relatedTarget instanceof Node && this.container.contains(e.relatedTarget)) {
      return;
    }
    this.removeOverlay();
  };

  private onDrop = (e: DragEvent): void => {
    e.preventDefault();
    this.removeOverlay();

    // Guard: Shift must be held to allow drop (VS Code restores pointer-events on Shift)
    if (!e.shiftKey) {
      return;
    }

    // Guard: exited terminal — no-op
    if (this.getTerminalExited()) {
      return;
    }

    // Guard: no dataTransfer
    if (!e.dataTransfer) {
      return;
    }

    // Extract paths from the drop event
    const paths = extractPathsFromDrop(e.dataTransfer);
    if (paths.length === 0) {
      return;
    }

    // Escape each path and join with spaces, append trailing space
    const escaped = paths.map(escapePathForShell).join(" ");
    const sessionId = this.getActiveSessionId();

    this.postMessage({ type: "input", tabId: sessionId, data: `${escaped} ` });
  };

  // ─── Overlay Management ─────────────────────────────────────────

  private showOverlay(shiftHeld: boolean): void {
    if (this.dropOverlay || !this.container) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "terminal-drop-overlay";
    overlay.style.position = "absolute";
    overlay.style.left = "0";
    overlay.style.right = "0";
    overlay.style.top = "0";
    overlay.style.bottom = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "34";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.fontFamily = "var(--vscode-font-family, sans-serif)";
    overlay.style.fontSize = "13px";
    overlay.style.color = "var(--vscode-foreground, #ccc)";

    this.container.appendChild(overlay);
    this.dropOverlay = overlay;
    this.updateOverlayHint(shiftHeld);
  }

  private updateOverlayHint(shiftHeld: boolean): void {
    if (!this.dropOverlay) {
      return;
    }
    if (shiftHeld) {
      this.dropOverlay.style.backgroundColor =
        "var(--vscode-terminal-dropBackground, var(--vscode-editorGroup-dropBackground, rgba(83, 89, 93, 0.5)))";
      this.dropOverlay.style.opacity = "0.7";
      this.dropOverlay.textContent = "Drop to insert path";
    } else {
      this.dropOverlay.style.backgroundColor = "rgba(83, 89, 93, 0.3)";
      this.dropOverlay.style.opacity = "0.9";
      this.dropOverlay.textContent = "Hold Shift to drop file path";
    }
  }

  private removeOverlay(): void {
    if (this.dropOverlay) {
      this.dropOverlay.remove();
      this.dropOverlay = null;
    }
  }
}
