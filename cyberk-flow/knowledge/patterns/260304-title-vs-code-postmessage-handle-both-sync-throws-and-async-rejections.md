---
labels: [vscode, webview, postmessage, error-handling]
source: cyberk-flow/changes/implement-ipc-messaging
summary: webview.postMessage() returns a Thenable. Failures can surface as sync throws OR async rejections. Use a safePostMessage helper: try { void webview.postMessage(msg).then(undefined, () => {}); } catch {}. This prevents unhandled promise rejections that can destabilize the extension host.
---
# --title VS Code postMessage: handle both sync throws and async rejections
**Date**: 2026-03-04

webview.postMessage() returns a Thenable. Failures can surface as sync throws OR async rejections. Use a safePostMessage helper: try { void webview.postMessage(msg).then(undefined, () => {}); } catch {}. This prevents unhandled promise rejections that can destabilize the extension host.
