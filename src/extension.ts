import * as crypto from "node:crypto";
import * as vscode from "vscode";

/**
 * Minimal WebviewViewProvider stub for sidebar terminal view.
 * Will be replaced by full TerminalViewProvider in task 1.3 of PLAN.md.
 */
class TerminalViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "anywhereTerminal.sidebar";

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
  }

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
      align-items: center;
      justify-content: center;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
    }
  </style>
</head>
<body>
  <div id="terminal-container"></div>
  <p>Terminal loading...</p>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new TerminalViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TerminalViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}

export function deactivate() {}
