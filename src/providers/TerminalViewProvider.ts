import * as crypto from "node:crypto";
import * as vscode from "vscode";
import * as PtyManager from "../pty/PtyManager";
import { PtySession } from "../pty/PtySession";
import { OutputBuffer } from "../session/OutputBuffer";
import type { WebViewToExtensionMessage } from "../types/messages";

/**
 * WebviewViewProvider for sidebar and panel terminal views.
 *
 * The same class is instantiated per view location (sidebar, panel).
 * Each instance manages its own set of terminal sessions through a unique viewId.
 *
 * Phase 1: Single PTY session per view. SessionManager integration in Phase 2.
 *
 * See: docs/design/webview-provider.md
 */
export class TerminalViewProvider implements vscode.WebviewViewProvider {
  public static readonly sidebarViewType = "anywhereTerminal.sidebar";
  public static readonly panelViewType = "anywhereTerminal.panel";

  /** The active webview view instance. Set after resolveWebviewView, cleared on dispose. */
  private _view: vscode.WebviewView | undefined;

  /** Phase 1: Single PTY session per view. Will be replaced by SessionManager in Phase 2. */
  private _ptySession: PtySession | undefined;
  /** Phase 1: Single output buffer per view. Tied to the PTY session. */
  private _outputBuffer: OutputBuffer | undefined;
  /** Phase 1: Session ID for the active PTY session. Used for tabId validation. */
  private _sessionId: string | undefined;
  /** Whether the webview has sent the 'ready' message. Gates outbound messages. */
  private _ready = false;

  /** Public accessor for the current webview view (used by future SessionManager integration). */
  get view(): vscode.WebviewView | undefined {
    return this._view;
  }

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly location: "sidebar" | "panel" = "sidebar",
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    // 1. Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };

    // 2. Set HTML content
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // 3. Wire message handler and lifecycle handlers
    const disposables: vscode.Disposable[] = [];

    disposables.push(
      webviewView.webview.onDidReceiveMessage((msg: unknown) => {
        this.handleMessage(msg, webviewView);
      }),
    );

    // 4. Wire visibility handler (for deferred resize on re-show)
    disposables.push(
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible && this._ready) {
          this.safePostMessage(webviewView.webview, { type: "viewShow" });
        }
      }),
    );

    // 5. Wire dispose handler — clean up all subscriptions and PTY
    webviewView.onDidDispose(() => {
      for (const d of disposables) {
        d.dispose();
      }
      this.cleanupSession();
      this._view = undefined;
    });
  }

  /**
   * Route incoming webview messages to appropriate handlers.
   *
   * See: docs/design/webview-provider.md#§8, docs/design/message-protocol.md#§10
   */
  private handleMessage(msg: unknown, webviewView: vscode.WebviewView): void {
    // Basic shape validation
    if (!msg || typeof msg !== "object" || !("type" in msg) || typeof (msg as { type: unknown }).type !== "string") {
      console.warn("[AnyWhere Terminal] Invalid message from webview:", msg);
      return;
    }

    const message = msg as WebViewToExtensionMessage;

    try {
      switch (message.type) {
        case "ready":
          this.onReady(webviewView);
          break;

        case "input":
          // Defensive: ignore if no session, tabId mismatch, or invalid data
          if (this._ptySession && message.tabId === this._sessionId && typeof message.data === "string") {
            this._ptySession.write(message.data);
          }
          break;

        case "resize":
          // Defensive: ignore if no session, tabId mismatch, or invalid dimensions
          if (
            this._ptySession &&
            message.tabId === this._sessionId &&
            typeof message.cols === "number" &&
            typeof message.rows === "number" &&
            Number.isFinite(message.cols) &&
            Number.isFinite(message.rows)
          ) {
            this._ptySession.resize(message.cols, message.rows);
          }
          break;

        case "ack":
          // Defensive: ignore if no output buffer exists
          this._outputBuffer?.handleAck(message.charCount);
          break;

        case "createTab":
          // Phase 2: sessionManager.createSession(), send 'tabCreated' message
          break;

        case "switchTab":
          // Phase 2: sessionManager.switchActiveSession(viewId, message.tabId)
          break;

        case "closeTab":
          // Phase 2: sessionManager.destroySession(message.tabId), send 'tabRemoved'
          break;

        case "clear":
          // Phase 2: sessionManager.clearScrollback(message.tabId)
          break;

        default:
          // Silently ignore unknown message types
          break;
      }
    } catch (err) {
      console.error(`[AnyWhere Terminal] Error handling message ${message.type}:`, err);
      // Don't rethrow — isolated error shouldn't crash the provider
    }
  }

  /**
   * Handle the 'ready' message from the webview.
   * Spawns a PTY, creates an OutputBuffer, and sends 'init' to the webview.
   *
   * See: specs/ipc-wiring/spec.md#Ready-Handshake-Wiring
   */
  private onReady(webviewView: vscode.WebviewView): void {
    // Clean up any existing session (e.g., if webview was re-created)
    this.cleanupSession();

    // Mark webview as ready — gates outbound messages
    this._ready = true;

    try {
      // 1. Load node-pty
      const nodePty = PtyManager.loadNodePty();

      // 2. Detect shell
      const { shell, args } = PtyManager.detectShell();

      // 3. Build environment
      const env = PtyManager.buildEnvironment();

      // 4. Resolve working directory
      const cwd = PtyManager.resolveWorkingDirectory();

      // 5. Create PtySession and spawn
      const sessionId = crypto.randomUUID();
      const ptySession = new PtySession(sessionId);
      ptySession.spawn(nodePty, shell, args, { cwd, env });

      // 6. Create OutputBuffer connected to PTY and webview
      const outputBuffer = new OutputBuffer(sessionId, webviewView.webview, ptySession);

      // Store references BEFORE wiring callbacks to prevent race conditions
      // (PTY could exit immediately after spawn, before callbacks are wired)
      this._ptySession = ptySession;
      this._outputBuffer = outputBuffer;
      this._sessionId = sessionId;

      // 7. Wire PtySession.onData → OutputBuffer.append()
      ptySession.onData = (data: string) => {
        outputBuffer.append(data);
      };

      // 8. Wire PtySession.onExit → flush buffer + send exit message
      ptySession.onExit = (code: number) => {
        // Guard: ignore if this is a stale session (a new session has replaced us)
        if (this._sessionId !== sessionId) {
          return;
        }
        // Guard: cleanupSession() may have already disposed the buffer
        if (this._outputBuffer) {
          this._outputBuffer.dispose();
          this._outputBuffer = undefined;
        }
        this.safePostMessage(webviewView.webview, { type: "exit", tabId: sessionId, code });
        this._ptySession = undefined;
        this._sessionId = undefined;
      };

      // 9. Send 'init' message to the webview with default config
      this.safePostMessage(webviewView.webview, {
        type: "init",
        tabs: [{ id: sessionId, name: "Terminal 1", isActive: true }],
        config: {
          fontSize: 14,
          cursorBlink: true,
          scrollback: 10000,
        },
      });
    } catch (err) {
      // Spawn failure: send error message, clean up partial state
      console.error("[AnyWhere Terminal] Failed to initialize terminal:", err);
      this.cleanupSession();

      this.safePostMessage(webviewView.webview, {
        type: "error",
        message: err instanceof Error ? err.message : "Failed to initialize terminal",
        severity: "error",
      });
    }
  }

  /**
   * Clean up the current PTY session and output buffer.
   */
  private cleanupSession(): void {
    if (this._outputBuffer) {
      this._outputBuffer.dispose();
      this._outputBuffer = undefined;
    }
    if (this._ptySession) {
      this._ptySession.kill();
      this._ptySession = undefined;
    }
    this._sessionId = undefined;
    this._ready = false;
  }

  /**
   * Safely post a message to the webview, handling both sync throws and async rejections.
   * Returns void — fire-and-forget with error logging.
   */
  private safePostMessage(webview: vscode.Webview, message: unknown): void {
    try {
      void (webview.postMessage(message) as Thenable<boolean>).then(undefined, () => {
        // Async rejection — webview may be disposed
      });
    } catch {
      // Sync throw — webview may be disposed
    }
  }

  /**
   * Get the view ID for session tracking.
   */
  getViewId(): string {
    return this.location === "sidebar" ? TerminalViewProvider.sidebarViewType : TerminalViewProvider.panelViewType;
  }

  /**
   * Generate secure HTML for the webview with CSP and nonce.
   *
   * See: docs/design/webview-provider.md#§4
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString("hex");

    // Convert file paths to webview-safe URIs
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "webview.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "xterm.css"));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';
                 font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <style>
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    body {
      display: flex;
      flex-direction: column;
    }
    #tab-bar {
      flex-shrink: 0;
    }
    #terminal-container {
      flex: 1;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div id="tab-bar"></div>
  <div id="terminal-container"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
