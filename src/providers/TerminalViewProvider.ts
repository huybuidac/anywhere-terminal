import * as vscode from "vscode";
import type { SessionManager } from "../session/SessionManager";
import { readTerminalConfig, readTerminalSettings } from "../settings/SettingsReader";
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

  /** Callback fired when this provider receives user interaction (message from webview). */
  private _onDidReceiveInteraction: (() => void) | undefined;

  /** Public accessor for the current webview view. */
  get view(): vscode.WebviewView | undefined {
    return this._view;
  }

  /** Register a callback to be notified when the user interacts with this view. */
  set onDidReceiveInteraction(callback: (() => void) | undefined) {
    this._onDidReceiveInteraction = callback;
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

    // 4. Wire visibility handler (for deferred resize on re-show + output pause/resume)
    disposables.push(
      webviewView.onDidChangeVisibility(() => {
        const viewId = this.getViewId();
        if (webviewView.visible) {
          // Resume output flushing when view becomes visible
          this.sessionManager.resumeOutputForView(viewId);
          if (this._ready) {
            this.safePostMessage(webviewView.webview, { type: "viewShow" });
          }
        } else {
          // Pause output flushing when view becomes hidden
          this.sessionManager.pauseOutputForView(viewId);
        }
      }),
    );

    // 5. Wire dispose handler — clean up subscriptions but preserve sessions for re-creation.
    // Sessions are anchored to the Extension Host lifecycle, not the WebView lifecycle.
    // They will be restored when resolveWebviewView is called again.
    webviewView.onDidDispose(() => {
      for (const d of disposables) {
        d.dispose();
      }
      // Pause output for the view — sessions survive but don't flush to a disposed webview
      this.sessionManager.pauseOutputForView(this.getViewId());
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

    // Notify that this provider received user interaction
    this._onDidReceiveInteraction?.();

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
          if (typeof message.charCount === "number" && typeof message.tabId === "string") {
            this.sessionManager.handleAck(message.tabId, message.charCount);
          }
          break;

        case "createTab": {
          const viewId = this.getViewId();
          const settings = readTerminalSettings();
          try {
            const newSessionId = this.sessionManager.createSession(viewId, webviewView.webview, {
              shell: settings.shell,
              shellArgs: settings.shellArgs,
              cwd: settings.cwd,
            });
            const newSession = this.sessionManager.getSession(newSessionId);
            if (newSession) {
              void this.safeSendWithRetry(webviewView.webview, {
                type: "tabCreated",
                tabId: newSessionId,
                name: newSession.name,
              });
            }
          } catch (err) {
            console.error("[AnyWhere Terminal] Failed to create tab:", err);
            void this.safeSendWithRetry(webviewView.webview, {
              type: "error",
              message: err instanceof Error ? err.message : "Failed to create new terminal tab",
              severity: "error",
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

        case "requestSplitSession": {
          if (
            typeof (message as { direction?: unknown }).direction === "string" &&
            typeof (message as { sourcePaneId?: unknown }).sourcePaneId === "string"
          ) {
            const splitMsg = message as { direction: "horizontal" | "vertical"; sourcePaneId: string };
            const viewId = this.getViewId();
            const splitSettings = readTerminalSettings();
            try {
              const newSessionId = this.sessionManager.createSession(viewId, webviewView.webview, {
                isSplitPane: true,
                shell: splitSettings.shell,
                shellArgs: splitSettings.shellArgs,
                cwd: splitSettings.cwd,
              });
              const newSession = this.sessionManager.getSession(newSessionId);
              if (newSession) {
                void this.safeSendWithRetry(webviewView.webview, {
                  type: "splitPaneCreated",
                  sourcePaneId: splitMsg.sourcePaneId,
                  newSessionId,
                  newSessionName: newSession.name,
                  direction: splitMsg.direction,
                });
              }
            } catch (err) {
              console.error("[AnyWhere Terminal] Failed to create split session:", err);
              void this.safeSendWithRetry(webviewView.webview, {
                type: "error",
                message: err instanceof Error ? err.message : "Failed to create split terminal",
                severity: "error",
              });
            }
          }
          break;
        }

        case "requestCloseSplitPane": {
          if (typeof (message as { sessionId?: unknown }).sessionId === "string") {
            const closeMsg = message as { sessionId: string };
            this.sessionManager.destroySession(closeMsg.sessionId);
          }
          break;
        }

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
   * On first creation: creates a session via SessionManager and sends 'init'.
   * On re-creation: restores existing sessions with scrollback data.
   *
   * See: specs/ipc-wiring/spec.md#Ready-Handshake-Wiring
   * See: specs/view-lifecycle-resilience/spec.md#Scrollback-Cache-Replay-on-Webview-Re-creation
   */
  private onReady(webviewView: vscode.WebviewView): void {
    // Mark webview as ready — gates outbound messages
    this._ready = true;

    try {
      const viewId = this.getViewId();
      const existingTabs = this.sessionManager.getTabsForView(viewId);

      if (existingTabs.length > 0) {
        // Re-creation scenario: sessions already exist for this view
        // Update webview references for all existing sessions
        this.sessionManager.updateWebviewForView(viewId, webviewView.webview);

        // Send 'init' message with existing tabs (with retry for transient failures)
        void this.safeSendWithRetry(webviewView.webview, {
          type: "init",
          tabs: existingTabs,
          config: readTerminalConfig(),
        });

        // Send 'restore' messages with scrollback data for each session
        for (const tab of existingTabs) {
          const scrollbackData = this.sessionManager.getScrollbackData(tab.id);
          if (scrollbackData) {
            this.safePostMessage(webviewView.webview, {
              type: "restore",
              tabId: tab.id,
              data: scrollbackData,
            });
          }
        }

        // Resume output flushing for the view
        this.sessionManager.resumeOutputForView(viewId);
      } else {
        // First-time creation: create initial session with resolved settings
        const settings = readTerminalSettings();
        this.sessionManager.createSession(viewId, webviewView.webview, {
          shell: settings.shell,
          shellArgs: settings.shellArgs,
          cwd: settings.cwd,
        });

        // Get tabs for the init message
        const tabs = this.sessionManager.getTabsForView(viewId);

        // Send 'init' message to the webview with resolved config (with retry)
        void this.safeSendWithRetry(webviewView.webview, {
          type: "init",
          tabs,
          config: readTerminalConfig(),
        });
      }
    } catch (err) {
      // Spawn failure: send error message (with retry for transient failures)
      console.error("[AnyWhere Terminal] Failed to initialize terminal:", err);

      void this.safeSendWithRetry(webviewView.webview, {
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
   * Post a message with retry logic for transient postMessage failures.
   * Retries up to `maxRetries` times with a 50ms delay between attempts.
   * Returns true if the message was delivered, false if all attempts failed.
   * Used for critical messages (init, tabCreated, splitPaneCreated, error).
   */
  private async safeSendWithRetry(webview: vscode.Webview, message: unknown, maxRetries = 2): Promise<boolean> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await (webview.postMessage(message) as Thenable<boolean>);
        if (result) {
          return true;
        }
      } catch {
        // Sync or async failure — will retry
      }
      // Wait before retrying (skip delay on last attempt)
      if (attempt < maxRetries) {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
    }
    return false;
  }

  /**
   * Get the view ID for session tracking.
   */
  getViewId(): string {
    return this.location === "sidebar" ? TerminalViewProvider.sidebarViewType : TerminalViewProvider.panelViewType;
  }

  /**
   * Get the active session ID for this view.
   * Returns undefined if no sessions exist or no session is active.
   */
  getActiveSessionId(): string | undefined {
    const tabs = this.sessionManager.getTabsForView(this.getViewId());
    const activeTab = tabs.find((t) => t.isActive);
    return activeTab?.id;
  }
}
