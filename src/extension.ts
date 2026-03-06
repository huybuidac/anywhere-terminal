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

  // Register SessionManager for disposal on extension deactivation
  context.subscriptions.push(sessionManager);
}

export function deactivate() {}
