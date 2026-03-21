import * as crypto from "node:crypto";
import * as vscode from "vscode";
import type { SessionManager } from "../session/SessionManager";
import { readTerminalConfig, readTerminalSettings } from "../settings/SettingsReader";
import type { WebViewToExtensionMessage } from "../types/messages";
import { getTerminalHtml } from "./webviewHtml";

/**
 * Editor-area terminal provider using WebviewPanel.
 *
 * Unlike TerminalViewProvider (which uses WebviewViewProvider for sidebar/panel),
 * this class creates on-demand WebviewPanels that open as editor tabs.
 * Each call to createPanel() produces an independent terminal with its own PTY.
 * All session operations are delegated to the shared SessionManager.
 *
 * See: docs/design/webview-provider.md#§7
 */
export class TerminalEditorProvider {
  public static readonly viewType = "anywhereTerminal.editor";

  /** Track all active editor panels for config updates. */
  private static readonly _activePanels = new Set<vscode.WebviewPanel>();

  /** Get all active editor panels (for pushing config updates). */
  static getActivePanels(): ReadonlySet<vscode.WebviewPanel> {
    return TerminalEditorProvider._activePanels;
  }

  /** The unique view ID for this editor panel's sessions. */
  private readonly _viewId: string;
  /** Whether the webview has sent the 'ready' message. Gates outbound messages. */
  private _ready = false;
  /** The WebviewPanel managed by this instance. */
  private readonly _panel: vscode.WebviewPanel;

  private constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessionManager: SessionManager,
    panel: vscode.WebviewPanel,
  ) {
    this._panel = panel;
    this._viewId = `editor-${crypto.randomUUID()}`;
    this.setupPanel();
  }

  /**
   * Create a new terminal panel in the editor area.
   *
   * Each invocation creates an independent terminal with its own PTY.
   * The returned Disposable kills the PTY and disposes the panel on cleanup.
   */
  static createPanel(context: vscode.ExtensionContext, sessionManager: SessionManager): vscode.Disposable {
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

    const _provider = new TerminalEditorProvider(context.extensionUri, sessionManager, panel);

    // Track this panel for config updates
    TerminalEditorProvider._activePanels.add(panel);

    // Return a disposable that cleans up via panel dispose (which triggers onDidDispose → destroyAllForView)
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
    // 1. Set HTML content using shared utility
    this._panel.webview.html = getTerminalHtml(this._panel.webview, this.extensionUri, "editor");

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

    // 4. Wire dispose handler — clean up all subscriptions and sessions
    this._panel.onDidDispose(() => {
      for (const d of disposables) {
        d.dispose();
      }
      TerminalEditorProvider._activePanels.delete(this._panel);
      this.sessionManager.destroyAllForView(this._viewId);
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
          const createSettings = readTerminalSettings();
          const newSessionId = this.sessionManager.createSession(this._viewId, this._panel.webview, {
            shell: createSettings.shell,
            shellArgs: createSettings.shellArgs,
            cwd: createSettings.cwd,
          });
          const newSession = this.sessionManager.getSession(newSessionId);
          if (newSession) {
            this.safePostMessage({
              type: "tabCreated",
              tabId: newSessionId,
              name: newSession.name,
            });
          }
          break;
        }

        case "switchTab":
          if (typeof message.tabId === "string") {
            this.sessionManager.switchActiveSession(this._viewId, message.tabId);
          }
          break;

        case "closeTab":
          if (typeof message.tabId === "string") {
            this.sessionManager.destroySession(message.tabId);
            this.safePostMessage({
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
          break;
      }
    } catch (err) {
      console.error(`[AnyWhere Terminal] Error handling editor message ${message.type}:`, err);
    }
  }

  /**
   * Handle the 'ready' message from the webview.
   * Creates a session via SessionManager and sends 'init' to the webview.
   */
  private onReady(): void {
    this._ready = true;

    try {
      // Create initial session via SessionManager with resolved settings
      const settings = readTerminalSettings();
      this.sessionManager.createSession(this._viewId, this._panel.webview, {
        shell: settings.shell,
        shellArgs: settings.shellArgs,
        cwd: settings.cwd,
      });

      // Get tabs for the init message
      const tabs = this.sessionManager.getTabsForView(this._viewId);

      this.safePostMessage({
        type: "init",
        tabs,
        config: readTerminalConfig(),
      });
    } catch (err) {
      console.error("[AnyWhere Terminal] Failed to initialize editor terminal:", err);

      this.safePostMessage({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to initialize terminal",
        severity: "error",
      });
    }
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
}
