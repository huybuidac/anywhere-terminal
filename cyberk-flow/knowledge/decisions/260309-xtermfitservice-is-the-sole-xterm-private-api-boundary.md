---
labels: [xterm, architecture, private-api]
source: cyberk-flow/changes/extract-simple-modules
summary: All xterm _core._renderService access is isolated in XtermFitService.ts. No other module should access xterm private APIs.
---
# XtermFitService is the sole xterm private API boundary
**Date**: 2026-03-09

## TL;DR
- `XtermFitService.ts` is the ONLY module allowed to access xterm private APIs (`_core._renderService`)
- This creates a single point of maintenance when xterm upgrades break private API shapes
- fitTerminal returns `{ cols, rows } | null` — pure data, no side effects except `_renderService.clear()`

## Context
xterm.js exposes `_core._renderService.dimensions` as an undocumented private API needed for accurate fit calculations. This API can break between xterm versions. Isolating all access in one file means xterm upgrades require checking only XtermFitService.

## Decision
Created `src/webview/resize/XtermFitService.ts` as the architectural boundary for xterm private APIs. The function:
- Accesses `(terminal as any)._core._renderService.dimensions` for cell size
- Uses `getBoundingClientRect()` (not `getComputedStyle()`) for parent dimensions — matches VS Code's own approach, avoids stale values during CSS flex transitions
- Calls `_renderService.clear()` before returning dimensions
- Returns `null` when no resize needed (dimensions unchanged or unavailable)

## Trade-offs
- Could have used FitAddon instead of direct private API access, but FitAddon had issues with split panel layouts and our custom scrollbar handling
- The `(terminal as any)` cast is intentional and unavoidable for private API access

## Evidence
- `src/webview/resize/XtermFitService.ts` → `fitTerminal()` — sole private API consumer
  - grep: `"_core"`, `"_renderService"`
- `src/webview/main.ts` — no `_core` or `_renderService` access after extraction
  - grep: `"fitTerminal"` (import only)

## When to apply
- BEFORE adding any xterm `_core` or `_renderService` access elsewhere: route it through XtermFitService
- When upgrading xterm.js: check XtermFitService for breaking private API changes
