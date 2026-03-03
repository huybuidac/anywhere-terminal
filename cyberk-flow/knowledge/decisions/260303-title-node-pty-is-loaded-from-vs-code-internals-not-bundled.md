---
labels: [node-pty, vscode, esbuild, packaging]
source: scaffold-and-register-views Oracle review feedback
summary: node-pty must NOT be in package.json dependencies. It is loaded dynamically from VS Code's built-in node_modules.asar at runtime. It is externalized in esbuild config to prevent bundling attempts. The .vscodeignore does NOT need to include node_modules for this reason.
---
# --title node-pty is loaded from VS Code internals, not bundled
**Date**: 2026-03-03

node-pty must NOT be in package.json dependencies. It is loaded dynamically from VS Code's built-in node_modules.asar at runtime. It is externalized in esbuild config to prevent bundling attempts. The .vscodeignore does NOT need to include node_modules for this reason.
