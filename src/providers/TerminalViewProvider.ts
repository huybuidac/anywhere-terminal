import * as crypto from "node:crypto";
import * as vscode from "vscode";
import type { WebViewToExtensionMessage } from "../types/messages";

/**
 * WebviewViewProvider for sidebar and panel terminal views.
 *
 * The same class is instantiated per view location (sidebar, panel).
 * Each instance manages its own set of terminal sessions through a unique viewId.
 *
 * See: docs/design/webview-provider.md
 */
export class TerminalViewProvider implements vscode.WebviewViewProvider {
  public static readonly sidebarViewType = "anywhereTerminal.sidebar";
  public static readonly panelViewType = "anywhereTerminal.panel";

  /** The active webview view instance. Set after resolveWebviewView, cleared on dispose. */
  private _view: vscode.WebviewView | undefined;

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
        if (webviewView.visible) {
          webviewView.webview.postMessage({ type: "viewShow" });
        }
      }),
    );

    // 5. Wire dispose handler — clean up all subscriptions
    webviewView.onDidDispose(() => {
      for (const d of disposables) {
        d.dispose();
      }
      // TODO: sessionManager.destroyAllForView(this.getViewId()) when SessionManager exists
      this._view = undefined;
    });
  }

  /**
   * Route incoming webview messages to appropriate handlers.
   * All handlers are stubs until SessionManager is implemented (task 1.4+).
   *
   * See: docs/design/webview-provider.md#§8, docs/design/message-protocol.md#§10
   */
  private handleMessage(msg: unknown, _webviewView: vscode.WebviewView): void {
    // Basic shape validation
    if (!msg || typeof msg !== "object" || !("type" in msg) || typeof (msg as { type: unknown }).type !== "string") {
      console.warn("[AnyWhere Terminal] Invalid message from webview:", msg);
      return;
    }

    const message = msg as WebViewToExtensionMessage;

    try {
      switch (message.type) {
        case "ready":
          console.log(`[AnyWhere Terminal] WebView ready (${this.location})`);
          // TODO: Create initial session via SessionManager, send 'init' message
          break;

        case "input":
          // TODO: sessionManager.writeToSession(message.tabId, message.data)
          break;

        case "resize":
          // TODO: sessionManager.resizeSession(message.tabId, message.cols, message.rows)
          break;

        case "ack":
          // TODO: outputBuffer.handleAck(message.charCount)
          break;

        case "createTab":
          // TODO: sessionManager.createSession(), send 'tabCreated' message
          break;

        case "switchTab":
          // TODO: sessionManager.switchActiveSession(viewId, message.tabId)
          break;

        case "closeTab":
          // TODO: sessionManager.destroySession(message.tabId), send 'tabRemoved'
          break;

        case "clear":
          // TODO: sessionManager.clearScrollback(message.tabId)
          break;

        default:
          console.warn(`[AnyWhere Terminal] Unknown message type: ${(msg as { type: string }).type}`);
      }
    } catch (err) {
      console.error(`[AnyWhere Terminal] Error handling message ${message.type}:`, err);
      // Don't rethrow — isolated error shouldn't crash the provider
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
