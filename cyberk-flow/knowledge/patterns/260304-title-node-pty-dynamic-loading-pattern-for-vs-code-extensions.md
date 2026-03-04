---
labels: [node-pty, vscode, esbuild, dynamic-require]
source: src/pty/PtyManager.ts
summary: Use module.require() to load node-pty from VS Code's internal node_modules.asar/node-pty path, bypassing esbuild's require replacement. Fallback to node_modules/node-pty for older VS Code. Cache the module after first load. Define minimal type interfaces (Pty, PtyForkOptions, PtyEvent, NodePtyModule) instead of importing the native package as a dev dependency.
---
# --title node-pty dynamic loading pattern for VS Code extensions
**Date**: 2026-03-04

Use module.require() to load node-pty from VS Code's internal node_modules.asar/node-pty path, bypassing esbuild's require replacement. Fallback to node_modules/node-pty for older VS Code. Cache the module after first load. Define minimal type interfaces (Pty, PtyForkOptions, PtyEvent, NodePtyModule) instead of importing the native package as a dev dependency.
