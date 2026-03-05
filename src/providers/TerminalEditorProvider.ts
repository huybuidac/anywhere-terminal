import * as crypto from "node:crypto";
import * as vscode from "vscode";
import * as PtyManager from "../pty/PtyManager";
import { PtySession } from "../pty/PtySession";
import { OutputBuffer } from "../session/OutputBuffer";
import type { WebViewToExtensionMessage } from "../types/messages";

/**
 * Editor-area terminal provider using WebviewPanel.
 *
 * Unlike TerminalViewProvider (which uses WebviewViewProvider for sidebar/panel),
 * this class creates on-demand WebviewPanels that open as editor tabs.
 * Each call to createPanel() produces an independent terminal with its own PTY.
 *
 * Phase 1: Single PTY session per panel. SessionManager integration in Phase 2.
 *
 * See: docs/design/webview-provider.md#§7
 */
export class TerminalEditorProvider {
  public static readonly viewType = "anywhereTerminal.editor";

  /** Phase 1: Single PTY session per panel. Will be replaced by SessionManager in Phase 2. */
  private _ptySession: PtySession | undefined;
  /** Phase 1: Single output buffer per panel. Tied to the PTY session. */
  private _outputBuffer: OutputBuffer | undefined;
  /** Phase 1: Session ID for the active PTY session. Used for tabId validation. */
  private _sessionId: string | undefined;
  /** Whether the webview has sent the 'ready' message. Gates outbound messages. */
  private _ready = false;
  /** The WebviewPanel managed by this instance. */
  private readonly _panel: vscode.WebviewPanel;

  private constructor(
    private readonly extensionUri: vscode.Uri,
    panel: vscode.WebviewPanel,
  ) {
    this._panel = panel;
    this.setupPanel();
  }

  /**
   * Create a new terminal panel in the editor area.
   *
   * Each invocation creates an independent terminal with its own PTY.
   * The returned Disposable kills the PTY and disposes the panel on cleanup.
   */
  static createPanel(context: vscode.ExtensionContext): vscode.Disposable {
    const panel = vscode.window.createWebviewPanel(
      TerminalEditorProvider.viewType,
      "Terminal",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      },
    );

    const _provider = new TerminalEditorProvider(context.extensionUri, panel);

    // Return a disposable that cleans up via panel dispose (which triggers onDidDispose → cleanupSession)
    return {
      dispose: () => {
        panel.dispose();
      },
    };
  }

  /**
   * Set up the panel: HTML content, message handler, dispose handler.
   */
  private setupPanel(): void {
    // 1. Set HTML content
    this._panel.webview.html = this.getHtmlForWebview(this._panel.webview);

    // 2. Wire message handler
    const disposables: vscode.Disposable[] = [];

    disposables.push(
      this._panel.webview.onDidReceiveMessage((msg: unknown) => {
        this.handleMessage(msg);
      }),
    );

    // 3. Wire visibility handler (for deferred resize on tab switch)
    disposables.push(
      this._panel.onDidChangeViewState((e) => {
        if (e.webviewPanel.visible && this._ready) {
          this.safePostMessage({ type: "viewShow" });
        }
      }),
    );

    // 4. Wire dispose handler — clean up all subscriptions and PTY
    this._panel.onDidDispose(() => {
      for (const d of disposables) {
        d.dispose();
      }
      this.cleanupSession();
    });
  }

  /**
   * Route incoming webview messages to appropriate handlers.
   *
   * See: docs/design/webview-provider.md#§8, docs/design/message-protocol.md#§10
   */
  private handleMessage(msg: unknown): void {
    // Basic shape validation
    if (!msg || typeof msg !== "object" || !("type" in msg) || typeof (msg as { type: unknown }).type !== "string") {
      console.warn("[AnyWhere Terminal] Invalid message from editor webview:", msg);
      return;
    }

    const message = msg as WebViewToExtensionMessage;

    try {
      switch (message.type) {
        case "ready":
          this.onReady();
          break;

        case "input":
          if (this._ptySession && message.tabId === this._sessionId && typeof message.data === "string") {
            this._ptySession.write(message.data);
          }
          break;

        case "resize":
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
          break;
      }
    } catch (err) {
      console.error(`[AnyWhere Terminal] Error handling editor message ${message.type}:`, err);
    }
  }

  /**
   * Handle the 'ready' message from the webview.
   * Spawns a PTY, creates an OutputBuffer, and sends 'init' to the webview.
   */
  private onReady(): void {
    this.cleanupSession();
    this._ready = true;

    try {
      const nodePty = PtyManager.loadNodePty();
      const { shell, args } = PtyManager.detectShell();
      const env = PtyManager.buildEnvironment();
      const cwd = PtyManager.resolveWorkingDirectory();

      const sessionId = crypto.randomUUID();
      const ptySession = new PtySession(sessionId);
      ptySession.spawn(nodePty, shell, args, { cwd, env });

      const outputBuffer = new OutputBuffer(sessionId, this._panel.webview, ptySession);

      this._ptySession = ptySession;
      this._outputBuffer = outputBuffer;
      this._sessionId = sessionId;

      ptySession.onData = (data: string) => {
        outputBuffer.append(data);
      };

      ptySession.onExit = (code: number) => {
        if (this._sessionId !== sessionId) {
          return;
        }
        if (this._outputBuffer) {
          this._outputBuffer.dispose();
          this._outputBuffer = undefined;
        }
        this.safePostMessage({ type: "exit", tabId: sessionId, code });
        this._ptySession = undefined;
        this._sessionId = undefined;
      };

      this.safePostMessage({
        type: "init",
        tabs: [{ id: sessionId, name: "Terminal 1", isActive: true }],
        config: {
          fontSize: 14,
          cursorBlink: true,
          scrollback: 10000,
        },
      });
    } catch (err) {
      console.error("[AnyWhere Terminal] Failed to initialize editor terminal:", err);
      this.cleanupSession();

      this.safePostMessage({
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
   */
  private safePostMessage(message: unknown): void {
    try {
      void (this._panel.webview.postMessage(message) as Thenable<boolean>).then(undefined, () => {
        // Async rejection — webview may be disposed
      });
    } catch {
      // Sync throw — webview may be disposed
    }
  }

  /**
   * Generate secure HTML for the webview with CSP and nonce.
   *
   * See: docs/design/webview-provider.md#§4
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString("hex");

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
      padding-left: 8px;
      box-sizing: border-box;
    }

    /* Keep xterm's 1px overview-ruler/scrollbar lane invisible.
       We still keep overviewRuler.width=1 in JS for FitAddon sizing math. */
    .xterm .xterm-decoration-overview-ruler {
      opacity: 0 !important;
      pointer-events: none !important;
    }

    .xterm .xterm-scrollable-element > .scrollbar.vertical,
    .xterm .xterm-scrollable-element > .scrollbar.vertical > .slider {
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
    }
  </style>
</head>
<body data-terminal-location="editor">
  <div id="tab-bar"></div>
  <div id="terminal-container"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
