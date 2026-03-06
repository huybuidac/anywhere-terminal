import * as vscode from "vscode";
import type { SessionManager } from "../session/SessionManager";
import type { WebViewToExtensionMessage } from "../types/messages";
import { getTerminalHtml } from "./webviewHtml";

/**
 * WebviewViewProvider for sidebar and panel terminal views.
 *
 * The same class is instantiated per view location (sidebar, panel).
 * Each instance manages its own set of terminal sessions through a unique viewId.
 * All session operations are delegated to the shared SessionManager.
 *
 * See: docs/design/webview-provider.md
 */
export class TerminalViewProvider implements vscode.WebviewViewProvider {
  public static readonly sidebarViewType = "anywhereTerminal.sidebar";
  public static readonly panelViewType = "anywhereTerminal.panel";

  /** The active webview view instance. Set after resolveWebviewView, cleared on dispose. */
  private _view: vscode.WebviewView | undefined;

  /** Whether the webview has sent the 'ready' message. Gates outbound messages. */
  private _ready = false;

  /** Public accessor for the current webview view. */
  get view(): vscode.WebviewView | undefined {
    return this._view;
  }

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessionManager: SessionManager,
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

    // 2. Set HTML content using shared utility
    webviewView.webview.html = getTerminalHtml(webviewView.webview, this.extensionUri, this.location);

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

    // 5. Wire dispose handler — clean up all subscriptions and sessions
    webviewView.onDidDispose(() => {
      for (const d of disposables) {
        d.dispose();
      }
      this.sessionManager.destroyAllForView(this.getViewId());
      this._view = undefined;
      this._ready = false;
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
          if (typeof message.tabId === "string" && typeof message.data === "string") {
            this.sessionManager.writeToSession(message.tabId, message.data);
          }
          break;

        case "resize":
          if (
            typeof message.tabId === "string" &&
            typeof message.cols === "number" &&
            typeof message.rows === "number" &&
            Number.isFinite(message.cols) &&
            Number.isFinite(message.rows)
          ) {
            this.sessionManager.resizeSession(message.tabId, message.cols, message.rows);
          }
          break;

        case "ack":
          if (typeof message.charCount === "number") {
            // Find the session for this ack — use the active session's output buffer
            const tabs = this.sessionManager.getTabsForView(this.getViewId());
            const activeTab = tabs.find((t) => t.isActive);
            if (activeTab) {
              this.sessionManager.handleAck(activeTab.id, message.charCount);
            }
          }
          break;

        case "createTab": {
          const viewId = this.getViewId();
          const newSessionId = this.sessionManager.createSession(viewId, webviewView.webview);
          const newSession = this.sessionManager.getSession(newSessionId);
          if (newSession) {
            this.safePostMessage(webviewView.webview, {
              type: "tabCreated",
              tabId: newSessionId,
              name: newSession.name,
            });
          }
          break;
        }

        case "switchTab":
          if (typeof message.tabId === "string") {
            this.sessionManager.switchActiveSession(this.getViewId(), message.tabId);
          }
          break;

        case "closeTab":
          if (typeof message.tabId === "string") {
            this.sessionManager.destroySession(message.tabId);
            this.safePostMessage(webviewView.webview, {
              type: "tabRemoved",
              tabId: message.tabId,
            });
          }
          break;

        case "clear":
          if (typeof message.tabId === "string") {
            this.sessionManager.clearScrollback(message.tabId);
          }
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
   * Creates a session via SessionManager and sends 'init' to the webview.
   *
   * See: specs/ipc-wiring/spec.md#Ready-Handshake-Wiring
   */
  private onReady(webviewView: vscode.WebviewView): void {
    // Mark webview as ready — gates outbound messages
    this._ready = true;

    try {
      const viewId = this.getViewId();

      // Create initial session via SessionManager
      this.sessionManager.createSession(viewId, webviewView.webview);

      // Get tabs for the init message
      const tabs = this.sessionManager.getTabsForView(viewId);

      // Send 'init' message to the webview with default config
      this.safePostMessage(webviewView.webview, {
        type: "init",
        tabs,
        config: {
          fontSize: 14,
          cursorBlink: true,
          scrollback: 10000,
        },
      });
    } catch (err) {
      // Spawn failure: send error message
      console.error("[AnyWhere Terminal] Failed to initialize terminal:", err);

      this.safePostMessage(webviewView.webview, {
        type: "error",
        message: err instanceof Error ? err.message : "Failed to initialize terminal",
        severity: "error",
      });
    }
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
}
