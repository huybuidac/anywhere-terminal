---
labels: [biome, lint, typescript, unused-fields]
source: cyberk-flow/changes/add-editor-terminal — _viewId field kept being removed by lint
summary: When running `biome check --write --unsafe`, Biome will automatically remove private class field declarations that are assigned but never read. This means you cannot pre-declare fields for future use (e.g., Phase 2 prep) without either: (1) adding a biome-ignore comment, (2) actually reading the field somewhere, or (3) deferring the field to when it's needed. The `--unsafe` flag enables the `noUnusedPrivateClassMembers` auto-fix.
---
# --title Biome --unsafe removes unused private class fields
**Date**: 2026-03-05

When running `biome check --write --unsafe`, Biome will automatically remove private class field declarations that are assigned but never read. This means you cannot pre-declare fields for future use (e.g., Phase 2 prep) without either: (1) adding a biome-ignore comment, (2) actually reading the field somewhere, or (3) deferring the field to when it's needed. The `--unsafe` flag enables the `noUnusedPrivateClassMembers` auto-fix.
