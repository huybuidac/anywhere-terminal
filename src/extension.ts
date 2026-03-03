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
}

export function deactivate() {}
