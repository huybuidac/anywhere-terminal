import * as vscode from "vscode";
import { TerminalEditorProvider } from "./providers/TerminalEditorProvider";
import { TerminalViewProvider } from "./providers/TerminalViewProvider";
import { loadNodePty } from "./pty/PtyManager";
import { SessionManager } from "./session/SessionManager";
import { affectsTerminalConfig, readTerminalConfig, readTerminalSettings } from "./settings/SettingsReader";
import { PtyLoadError } from "./types/errors";

export function activate(context: vscode.ExtensionContext) {
  // Validate node-pty availability early — show user-facing error if missing
  try {
    loadNodePty();
  } catch (err) {
    if (err instanceof PtyLoadError) {
      vscode.window.showErrorMessage(
        `AnyWhere Terminal: Failed to load node-pty. Requires VS Code >= 1.109.0. ${err.message}`,
      );
    } else {
      console.error("[AnyWhere Terminal] Unexpected error loading node-pty:", err);
    }
    // Continue activation — individual createSession calls will fail gracefully
  }
  // Create shared SessionManager (singleton)
  const sessionManager = new SessionManager();

  // Sidebar view
  const sidebarProvider = new TerminalViewProvider(context.extensionUri, sessionManager, "sidebar");

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TerminalViewProvider.sidebarViewType, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Panel view
  const panelProvider = new TerminalViewProvider(context.extensionUri, sessionManager, "panel");

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TerminalViewProvider.panelViewType, panelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Editor terminal command — each invocation creates an independent editor tab terminal
  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.newTerminalInEditor", () => {
      const panelDisposable = TerminalEditorProvider.createPanel(context, sessionManager);
      context.subscriptions.push(panelDisposable);
    }),
  );

  // ─── Provider Lookup ──────────────────────────────────────────

  // Map of view location to provider for direct lookup
  const providers = {
    sidebar: sidebarProvider,
    panel: panelProvider,
  };

  // Track which provider last received user interaction (for keybinding fallback)
  let lastFocusedProvider: TerminalViewProvider = sidebarProvider;

  sidebarProvider.onDidReceiveInteraction = () => {
    lastFocusedProvider = sidebarProvider;
  };
  panelProvider.onDidReceiveInteraction = () => {
    lastFocusedProvider = panelProvider;
  };

  // Helper: get the focused provider for keybinding context (both views may be visible).
  const getFocusedProvider = (): TerminalViewProvider => {
    if (panelProvider.view?.visible && !sidebarProvider.view?.visible) {
      return panelProvider;
    }
    if (sidebarProvider.view?.visible && !panelProvider.view?.visible) {
      return sidebarProvider;
    }
    return lastFocusedProvider;
  };

  // ─── Action Helpers ──────────────────────────────────────────

  const doNewTerminal = (provider: TerminalViewProvider): void => {
    const view = provider.view;
    if (!view) {
      return;
    }
    const viewId = provider.getViewId();
    const settings = readTerminalSettings();
    try {
      const newSessionId = sessionManager.createSession(viewId, view.webview, {
        shell: settings.shell,
        shellArgs: settings.shellArgs,
        cwd: settings.cwd,
      });
      const newSession = sessionManager.getSession(newSessionId);
      if (newSession) {
        safePostMessage(view.webview, {
          type: "tabCreated",
          tabId: newSessionId,
          name: newSession.name,
        });
      }
    } catch (err) {
      console.error("[AnyWhere Terminal] Failed to create terminal:", err);
      safePostMessage(view.webview, {
        type: "error",
        message: err instanceof Error ? err.message : "Failed to create new terminal",
        severity: "error",
      });
    }
  };

  const doKillTerminal = (provider: TerminalViewProvider): void => {
    const activeSessionId = provider.getActiveSessionId();
    if (!activeSessionId) {
      return;
    }
    sessionManager.destroySession(activeSessionId);
    const view = provider.view;
    if (view) {
      safePostMessage(view.webview, {
        type: "tabRemoved",
        tabId: activeSessionId,
      });
    }
  };

  const doClearTerminal = (provider: TerminalViewProvider): void => {
    const activeSessionId = provider.getActiveSessionId();
    if (!activeSessionId) {
      return;
    }
    sessionManager.clearScrollback(activeSessionId);
    const view = provider.view;
    if (view) {
      safePostMessage(view.webview, { type: "clear", tabId: activeSessionId });
    }
  };

  const doSplit = (provider: TerminalViewProvider, direction: "horizontal" | "vertical"): void => {
    const view = provider.view;
    if (!view) {
      return;
    }
    safePostMessage(view.webview, { type: "splitPane", direction });
  };

  const doCloseSplitPane = (provider: TerminalViewProvider): void => {
    const view = provider.view;
    if (!view) {
      return;
    }
    safePostMessage(view.webview, { type: "closeSplitPane" });
  };

  // ─── Generic Commands (for keybindings — use getFocusedProvider) ──────

  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.newTerminal", () => doNewTerminal(getFocusedProvider())),
    vscode.commands.registerCommand("anywhereTerminal.killTerminal", () => doKillTerminal(getFocusedProvider())),
    vscode.commands.registerCommand("anywhereTerminal.clearTerminal", () => doClearTerminal(getFocusedProvider())),
    vscode.commands.registerCommand("anywhereTerminal.splitHorizontal", () =>
      doSplit(getFocusedProvider(), "horizontal"),
    ),
    vscode.commands.registerCommand("anywhereTerminal.splitVertical", () => doSplit(getFocusedProvider(), "vertical")),
    vscode.commands.registerCommand("anywhereTerminal.closeSplitPane", () => doCloseSplitPane(getFocusedProvider())),
  );

  // ─── View-Specific Commands (for view/title menus — directly target correct provider) ──

  for (const loc of ["sidebar", "panel"] as const) {
    const provider = providers[loc];
    context.subscriptions.push(
      vscode.commands.registerCommand(`anywhereTerminal.newTerminal.${loc}`, () => doNewTerminal(provider)),
      vscode.commands.registerCommand(`anywhereTerminal.killTerminal.${loc}`, () => doKillTerminal(provider)),
      vscode.commands.registerCommand(`anywhereTerminal.splitHorizontal.${loc}`, () => doSplit(provider, "horizontal")),
      vscode.commands.registerCommand(`anywhereTerminal.splitVertical.${loc}`, () => doSplit(provider, "vertical")),
    );
  }

  // ─── Webview Context Menu Commands ────────────────────────────────
  // These are triggered from right-click on split panes via webview/context menus.
  // VS Code passes the data-vscode-context values as the command argument.

  /** Post a message to whichever provider's webview is visible. */
  const postToVisibleWebview = (message: unknown): void => {
    // Try both providers — only the one whose webview contains the element will match
    for (const provider of [sidebarProvider, panelProvider]) {
      const view = provider.view;
      if (view?.visible) {
        safePostMessage(view.webview, message);
      }
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.ctx.closePane", (ctx: { paneSessionId?: string }) => {
      if (ctx?.paneSessionId) {
        postToVisibleWebview({ type: "closeSplitPaneById", sessionId: ctx.paneSessionId });
      }
    }),
    vscode.commands.registerCommand("anywhereTerminal.ctx.splitVertical", (ctx: { paneSessionId?: string }) => {
      if (ctx?.paneSessionId) {
        postToVisibleWebview({ type: "splitPaneAt", direction: "vertical", sourcePaneId: ctx.paneSessionId });
      }
    }),
    vscode.commands.registerCommand("anywhereTerminal.ctx.splitHorizontal", (ctx: { paneSessionId?: string }) => {
      if (ctx?.paneSessionId) {
        postToVisibleWebview({ type: "splitPaneAt", direction: "horizontal", sourcePaneId: ctx.paneSessionId });
      }
    }),
    vscode.commands.registerCommand("anywhereTerminal.ctx.copy", () => {
      postToVisibleWebview({ type: "ctxCopy" });
    }),
    vscode.commands.registerCommand("anywhereTerminal.ctx.paste", () => {
      postToVisibleWebview({ type: "ctxPaste" });
    }),
    vscode.commands.registerCommand("anywhereTerminal.ctx.selectAll", () => {
      postToVisibleWebview({ type: "ctxSelectAll" });
    }),
    vscode.commands.registerCommand("anywhereTerminal.ctx.clearTerminal", () => {
      // Clear scrollback on extension side, then tell webview to clear viewport
      const provider = getFocusedProvider();
      const activeSessionId = provider.getActiveSessionId();
      if (activeSessionId) {
        sessionManager.clearScrollback(activeSessionId);
      }
      postToVisibleWebview({ type: "ctxClear" });
    }),
    vscode.commands.registerCommand("anywhereTerminal.ctx.newTerminal", () => {
      doNewTerminal(getFocusedProvider());
    }),
    vscode.commands.registerCommand("anywhereTerminal.ctx.killTerminal", () => {
      doKillTerminal(getFocusedProvider());
    }),
  );

  // ─── Configuration Change Listener ────────────────────────────────
  // Push updated config to all active webviews when relevant settings change.
  // See: specs/extension-settings/spec.md#settings-change-listener

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!affectsTerminalConfig(e)) {
        return;
      }

      const config = readTerminalConfig();
      const configUpdateMessage = { type: "configUpdate" as const, config };

      // Push to sidebar and panel providers
      for (const provider of [sidebarProvider, panelProvider]) {
        const view = provider.view;
        if (view) {
          safePostMessage(view.webview, configUpdateMessage);
        }
      }

      // Push to all editor panels
      for (const panel of TerminalEditorProvider.getActivePanels()) {
        safePostMessage(panel.webview, configUpdateMessage);
      }
    }),
  );

  // ─── Focus & Move Commands ──────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.focusSidebar", () => {
      void vscode.commands.executeCommand("anywhereTerminal.sidebar.focus");
    }),
    vscode.commands.registerCommand("anywhereTerminal.focusPanel", () => {
      void vscode.commands.executeCommand("anywhereTerminal.panel.focus");
    }),
    vscode.commands.registerCommand("anywhereTerminal.moveToSecondary", async () => {
      await vscode.commands.executeCommand("anywhereTerminal.sidebar.focus");
      await vscode.commands.executeCommand("workbench.action.moveView");
    }),
  );

  // Register SessionManager for disposal on extension deactivation
  context.subscriptions.push(sessionManager);
}

/** Safely post a message to a webview, handling both sync throws and async rejections. */
function safePostMessage(webview: vscode.Webview, message: unknown): void {
  try {
    void (webview.postMessage(message) as Thenable<boolean>).then(undefined, () => {});
  } catch {
    // Webview may be disposed
  }
}

export function deactivate() {}
