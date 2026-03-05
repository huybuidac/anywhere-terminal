import * as vscode from "vscode";
import { TerminalViewProvider } from "./providers/TerminalViewProvider";

export function activate(context: vscode.ExtensionContext) {
  // Sidebar view
  const sidebarProvider = new TerminalViewProvider(context.extensionUri, "sidebar");

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TerminalViewProvider.sidebarViewType, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Panel view
  const panelProvider = new TerminalViewProvider(context.extensionUri, "panel");

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TerminalViewProvider.panelViewType, panelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

export function deactivate() {}
