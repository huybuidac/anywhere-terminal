---
labels: [vscode, webview, mock, testing]
source: cyberk-flow/changes/add-editor-terminal — vscode mock extension
summary: When testing WebviewPanel-based providers, the vscode mock at src/test/__mocks__/vscode.ts must include: createWebviewPanel (with onDidChangeViewState, onDidDispose, webview.onDidReceiveMessage), ViewColumn enum, and commands.registerCommand. The mock panel needs __messageHandlers, __disposeHandlers, and __viewStateHandlers arrays for test access. PtySession and OutputBuffer mocks must use actual class syntax (not vi.fn().mockImplementation()) because production code uses `new`.
---
# --title VS Code mock pattern for WebviewPanel testing
**Date**: 2026-03-05

When testing WebviewPanel-based providers, the vscode mock at src/test/__mocks__/vscode.ts must include: createWebviewPanel (with onDidChangeViewState, onDidDispose, webview.onDidReceiveMessage), ViewColumn enum, and commands.registerCommand. The mock panel needs __messageHandlers, __disposeHandlers, and __viewStateHandlers arrays for test access. PtySession and OutputBuffer mocks must use actual class syntax (not vi.fn().mockImplementation()) because production code uses `new`.
