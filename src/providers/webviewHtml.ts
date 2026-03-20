// src/providers/webviewHtml.ts — Shared HTML generation for terminal webviews
// See: docs/design/webview-provider.md#§4

import * as crypto from "node:crypto";
import * as vscode from "vscode";

/**
 * Generate secure HTML for a terminal webview with CSP and nonce.
 *
 * Used by both TerminalViewProvider (sidebar/panel) and TerminalEditorProvider (editor area)
 * to produce identical HTML structure. The only difference is the `data-terminal-location`
 * attribute on the body element.
 *
 * @param webview - The webview to generate HTML for
 * @param extensionUri - The extension's root URI (for resolving media/ resources)
 * @param location - The terminal location ('sidebar' | 'panel' | 'editor')
 * @returns The complete HTML string
 */
export function getTerminalHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  location: "sidebar" | "panel" | "editor",
): string {
  const nonce = crypto.randomBytes(16).toString("hex");

  // Convert file paths to webview-safe URIs
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "webview.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "xterm.css"));

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
      display: none;
      height: 30px;
      background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-sideBar-background));
      align-items: center;
      overflow: hidden;
      user-select: none;
      font-size: 12px;
      font-family: var(--vscode-font-family, sans-serif);
    }
    #tab-bar.visible {
      display: flex;
    }
    .tab-item {
      display: flex;
      align-items: center;
      height: 100%;
      padding: 0 8px;
      cursor: pointer;
      white-space: nowrap;
      color: var(--vscode-tab-inactiveForeground, #999);
      background: var(--vscode-tab-inactiveBackground, transparent);
      border-right: 1px solid var(--vscode-tab-border, transparent);
      gap: 6px;
    }
    .tab-item:hover {
      background: var(--vscode-tab-hoverBackground, rgba(255,255,255,0.05));
    }
    .tab-item.active {
      color: var(--vscode-tab-activeForeground, #fff);
      background: var(--vscode-tab-activeBackground, var(--vscode-editor-background));
      border-bottom: 1px solid var(--vscode-focusBorder, #007acc);
    }
    .tab-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 3px;
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 12px;
      padding: 0;
      opacity: 0;
    }
    .tab-item:hover .tab-close,
    .tab-item.active .tab-close {
      opacity: 0.7;
    }
    .tab-close:hover {
      opacity: 1 !important;
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1));
    }
    .tab-add {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 100%;
      cursor: pointer;
      color: var(--vscode-tab-inactiveForeground, #999);
      background: transparent;
      border: none;
      font-size: 16px;
      padding: 0;
    }
    .tab-add:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1));
      color: var(--vscode-tab-activeForeground, #fff);
    }
    .tab-exited .tab-name {
      opacity: 0.5;
      font-style: italic;
    }
    .error-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      font-size: 12px;
      font-family: var(--vscode-font-family, sans-serif);
      color: #fff;
      z-index: 100;
      flex-shrink: 0;
    }
    .error-banner-error {
      background: #c72e2e;
    }
    .error-banner-warn {
      background: #b5850a;
    }
    .error-banner-info {
      background: #1a6fb5;
    }
    .error-banner-message {
      flex: 1;
      margin-right: 8px;
    }
    .error-banner-dismiss {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border: none;
      background: transparent;
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      padding: 0;
      opacity: 0.7;
      border-radius: 3px;
    }
    .error-banner-dismiss:hover {
      opacity: 1;
      background: rgba(255,255,255,0.2);
    }
    #terminal-container {
      flex: 1;
      overflow: hidden;
      padding-left: 8px;
      box-sizing: border-box;
      position: relative;
    }

    /* Drag-drop tip banner — dismissable hint at bottom of terminal */
    .drag-drop-tip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 12px;
      font-size: 11px;
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-descriptionForeground, #888);
      background: var(--vscode-editorWidget-background, rgba(30, 30, 30, 0.8));
      border-top: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      flex-shrink: 0;
      gap: 8px;
    }
    .drag-drop-tip-text {
      flex: 1;
    }
    .drag-drop-tip-dismiss {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border: none;
      background: transparent;
      color: var(--vscode-descriptionForeground, #888);
      cursor: pointer;
      font-size: 12px;
      padding: 0;
      opacity: 0.6;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .drag-drop-tip-dismiss:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1));
    }

    /* Flash effect when path is inserted via context menu —
       uses ::after overlay to cover xterm content */
    @keyframes insert-path-flash {
      0% { opacity: 1; }
      100% { opacity: 0; }
    }
    #terminal-container.path-inserted::after {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(0, 122, 204, 0.12);
      pointer-events: none;
      z-index: 50;
      animation: insert-path-flash 0.8s ease-out forwards;
    }

    /* Split handle — visible 1px separator at rest, full sash on hover */
    .split-handle {
      flex: 0 0 4px;
      position: relative;
      background: transparent;
      opacity: 1;
      transition: background 0.15s ease;
    }
    .split-handle::after {
      content: '';
      position: absolute;
    }
    .split-handle[data-direction="vertical"]::after {
      top: 0;
      bottom: 0;
      left: 50%;
      width: 1px;
      transform: translateX(-50%);
      background: var(--vscode-panel-border, rgba(128, 128, 128, 0.35));
    }
    .split-handle[data-direction="horizontal"]::after {
      left: 0;
      right: 0;
      top: 50%;
      height: 1px;
      transform: translateY(-50%);
      background: var(--vscode-panel-border, rgba(128, 128, 128, 0.35));
    }
    .split-handle:hover,
    .split-handle:active {
      background: var(--vscode-sash-hoverBorder, rgba(128, 128, 128, 0.35));
    }
    .split-handle:hover::after,
    .split-handle:active::after {
      background: transparent;
    }
    .split-handle[data-direction="vertical"] {
      cursor: col-resize;
    }
    .split-handle[data-direction="horizontal"] {
      cursor: row-resize;
    }

    /* Keep xterm's 1px overview-ruler/scrollbar lane invisible.
       We still keep overviewRuler.width=1 in JS for FitAddon sizing math. */
    .xterm .xterm-decoration-overview-ruler {
      opacity: 0 !important;
      pointer-events: none !important;
    }

    .xterm .xterm-scrollable-element > .scrollbar.vertical,
    .xterm .xterm-scrollable-element > .scrollbar.vertical > .slider {
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
    }
  </style>
</head>
<body data-terminal-location="${location}">
  <div id="tab-bar"></div>
  <div id="terminal-container"></div>
  <div id="drag-drop-tip"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
