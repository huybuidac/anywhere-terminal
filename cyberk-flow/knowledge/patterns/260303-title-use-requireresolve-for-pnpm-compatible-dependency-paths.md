---
labels: [pnpm, esbuild, build]
source: scaffold-and-register-views code review feedback
summary: When locating files inside node_modules (e.g., CSS files to copy during build), use require.resolve() instead of hardcoded path.join(__dirname, 'node_modules', ...) because pnpm uses symlinks and hoisting that may not match the expected path structure.
---
# --title Use require.resolve() for pnpm-compatible dependency paths
**Date**: 2026-03-03

When locating files inside node_modules (e.g., CSS files to copy during build), use require.resolve() instead of hardcoded path.join(__dirname, 'node_modules', ...) because pnpm uses symlinks and hoisting that may not match the expected path structure.
