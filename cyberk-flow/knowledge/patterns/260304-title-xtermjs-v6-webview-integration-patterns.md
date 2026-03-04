---
labels: [xterm, webview, vscode, terminal, patterns]
source: cyberk-flow/changes/implement-webview-terminal
summary: Key patterns for implementing xterm.js v6 in VS Code webviews: (1) Use `declare function acquireVsCodeApi` for the global injected by VS Code. (2) xterm.js `terminal.paste()` handles bracketed paste natively — do NOT manually wrap. (3) FitAddon requires the container to have non-zero dimensions (use `requestAnimationFrame` after display:block). (4) ResizeObserver + 100ms debounce for responsive resize. (5) MutationObserver on body class for theme changes. (6) CSS variable mapping for 20+ ANSI colors via `getComputedStyle`. (7) Ack batching (5K chars threshold) for flow control. (8) Async disposal guards needed in `requestAnimationFrame` callbacks since terminal may be disposed during the async frame.
---
# --title xterm.js v6 Webview Integration Patterns
**Date**: 2026-03-04

Key patterns for implementing xterm.js v6 in VS Code webviews: (1) Use `declare function acquireVsCodeApi` for the global injected by VS Code. (2) xterm.js `terminal.paste()` handles bracketed paste natively — do NOT manually wrap. (3) FitAddon requires the container to have non-zero dimensions (use `requestAnimationFrame` after display:block). (4) ResizeObserver + 100ms debounce for responsive resize. (5) MutationObserver on body class for theme changes. (6) CSS variable mapping for 20+ ANSI colors via `getComputedStyle`. (7) Ack batching (5K chars threshold) for flow control. (8) Async disposal guards needed in `requestAnimationFrame` callbacks since terminal may be disposed during the async frame.
