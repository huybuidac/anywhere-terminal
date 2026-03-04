---
labels: [biome, lint, conventions]
source: cyberk-flow/changes/implement-webview-terminal
summary: Biome aggressively auto-fixes `let` to `const` when the variable is not yet reassigned in the current code. For module-level state variables (like `activeTabId`) that will be reassigned later, either use `// biome-ignore` or initialize as `const` with a mutable container. In this project, we used `let` with the understanding that Biome warnings are acceptable for state variables.
---
# --title Biome let-to-const auto-fix in webview code
**Date**: 2026-03-04

Biome aggressively auto-fixes `let` to `const` when the variable is not yet reassigned in the current code. For module-level state variables (like `activeTabId`) that will be reassigned later, either use `// biome-ignore` or initialize as `const` with a mutable container. In this project, we used `let` with the understanding that Biome warnings are acceptable for state variables.
