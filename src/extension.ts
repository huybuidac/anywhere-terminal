import * as vscode from "vscode";
import { TerminalEditorProvider } from "./providers/TerminalEditorProvider";
import { TerminalViewProvider } from "./providers/TerminalViewProvider";
import { SessionManager } from "./session/SessionManager";

export function activate(context: vscode.ExtensionContext) {
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

  // ─── Terminal Commands ──────────────────────────────────────────

  // Helper: get the focused provider (sidebar or panel). Defaults to sidebar.
  const getFocusedProvider = (): TerminalViewProvider => {
    // If panel view is visible and sidebar is not, use panel
    if (panelProvider.view?.visible && !sidebarProvider.view?.visible) {
      return panelProvider;
    }
    return sidebarProvider;
  };

  // newTerminal: create a new terminal tab in the focused view
  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.newTerminal", () => {
      const provider = getFocusedProvider();
      const view = provider.view;
      if (!view) {
        return;
      }
      const viewId = provider.getViewId();
      const newSessionId = sessionManager.createSession(viewId, view.webview);
      const newSession = sessionManager.getSession(newSessionId);
      if (newSession) {
        try {
          void (
            view.webview.postMessage({
              type: "tabCreated",
              tabId: newSessionId,
              name: newSession.name,
            }) as Thenable<boolean>
          ).then(undefined, () => {});
        } catch {
          // Webview may be disposed
        }
      }
    }),
  );

  // killTerminal: destroy the active session in the focused view
  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.killTerminal", () => {
      const provider = getFocusedProvider();
      const activeSessionId = provider.getActiveSessionId();
      if (!activeSessionId) {
        return;
      }
      sessionManager.destroySession(activeSessionId);
      const view = provider.view;
      if (view) {
        try {
          void (
            view.webview.postMessage({
              type: "tabRemoved",
              tabId: activeSessionId,
            }) as Thenable<boolean>
          ).then(undefined, () => {});
        } catch {
          // Webview may be disposed
        }
      }
    }),
  );

  // clearTerminal: clear scrollback for the active session in the focused view
  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.clearTerminal", () => {
      const provider = getFocusedProvider();
      const activeSessionId = provider.getActiveSessionId();
      if (!activeSessionId) {
        return;
      }
      sessionManager.clearScrollback(activeSessionId);
      const view = provider.view;
      if (view) {
        try {
          void (
            view.webview.postMessage({
              type: "clear",
              tabId: activeSessionId,
            }) as Thenable<boolean>
          ).then(undefined, () => {});
        } catch {
          // Webview may be disposed
        }
      }
    }),
  );

  // focusSidebar: focus the sidebar terminal view
  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.focusSidebar", () => {
      void vscode.commands.executeCommand("anywhereTerminal.sidebar.focus");
    }),
  );

  // focusPanel: focus the panel terminal view
  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.focusPanel", () => {
      void vscode.commands.executeCommand("anywhereTerminal.panel.focus");
    }),
  );

  // moveToSecondary: focus sidebar then open "Move View" dialog
  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.moveToSecondary", async () => {
      await vscode.commands.executeCommand("anywhereTerminal.sidebar.focus");
      await vscode.commands.executeCommand("workbench.action.moveView");
    }),
  );

  // ─── Split Commands ──────────────────────────────────────────────

  // splitHorizontal: split the active pane horizontally (top/bottom)
  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.splitHorizontal", () => {
      const provider = getFocusedProvider();
      const view = provider.view;
      if (!view) {
        return;
      }
      try {
        void (
          view.webview.postMessage({
            type: "splitPane",
            direction: "horizontal",
          }) as Thenable<boolean>
        ).then(undefined, () => {});
      } catch {
        // Webview may be disposed
      }
    }),
  );

  // splitVertical: split the active pane vertically (left/right)
  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.splitVertical", () => {
      const provider = getFocusedProvider();
      const view = provider.view;
      if (!view) {
        return;
      }
      try {
        void (
          view.webview.postMessage({
            type: "splitPane",
            direction: "vertical",
          }) as Thenable<boolean>
        ).then(undefined, () => {});
      } catch {
        // Webview may be disposed
      }
    }),
  );

  // closeSplitPane: close the active pane within a split layout
  context.subscriptions.push(
    vscode.commands.registerCommand("anywhereTerminal.closeSplitPane", () => {
      const provider = getFocusedProvider();
      const view = provider.view;
      if (!view) {
        return;
      }
      try {
        void (
          view.webview.postMessage({
            type: "closeSplitPane",
          }) as Thenable<boolean>
        ).then(undefined, () => {});
      } catch {
        // Webview may be disposed
      }
    }),
  );

  // Register SessionManager for disposal on extension deactivation
  context.subscriptions.push(sessionManager);
}

export function deactivate() {}
