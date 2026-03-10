---
labels: [testing, xterm, webview, mock, vitest]
source: cyberk-flow/changes/add-webview-module-tests
summary: Use createMockTerminal() from src/webview/test-utils/mockTerminal.ts to mock xterm Terminal for webview module tests. Mocks only the interface subset used by modules: element, options, rows/cols, _core._renderService, write/clear/dispose.
---
# Shared xterm Terminal mock for webview module testing
**Date**: 2026-03-10

## TL;DR
- Shared mock factory `createMockTerminal()` provides a lightweight xterm Terminal mock for all webview module tests
- Mocks only the interface subset actually used: `element`, `options`, `rows/cols`, `_core._renderService.dimensions/clear`, `write/clear/dispose`
- Cast via `as unknown as Terminal` at call sites to satisfy type constraints

## Context
Phase 8 extracted 7 modules from main.ts. Testing them requires an xterm Terminal mock since real xterm Terminal cannot run in Node/jsdom (needs canvas/WebGL). Six test files share the same mock shape, so a shared factory avoids duplication.

## Pattern
Create a typed mock factory in `src/webview/test-utils/mockTerminal.ts` that returns an object matching the Terminal interface subset. The factory accepts `overrides` for `rows`, `cols`, `cellWidth`, `cellHeight`, `scrollback`. The `write` mock calls its callback synchronously if provided (mimicking xterm's async write behavior for test simplicity).

Key mocking techniques:
- **ResizeObserver**: `vi.stubGlobal("ResizeObserver", MockClass)` with captured callback for manual invocation
- **requestAnimationFrame**: `vi.stubGlobal("requestAnimationFrame", (cb) => { cb(0); return 0; })` for synchronous execution
- **getComputedStyle**: `vi.spyOn(window, "getComputedStyle").mockImplementation()` for CSS variable reading
- **MutationObserver**: jsdom provides a real MutationObserver; use `await vi.waitFor()` to assert async callbacks
- **getBoundingClientRect**: `vi.spyOn(element, "getBoundingClientRect")` for container dimensions

## Evidence
- `src/webview/test-utils/mockTerminal.ts` → `createMockTerminal()` — factory function
  - grep: `"createMockTerminal"`
- `src/webview/resize/ResizeCoordinator.test.ts` → `MockResizeObserver` class, `triggerResize()` helper
  - grep: `"MockResizeObserver"`
- `src/webview/theme/ThemeManager.test.ts` → CSS variable mocking pattern
  - grep: `"setCssVar"`

## When to apply
- When adding new test files for webview modules that interact with xterm Terminal
- When a new module is extracted from main.ts that needs terminal access in tests
- When mocking browser APIs (ResizeObserver, MutationObserver, rAF) in jsdom environment
