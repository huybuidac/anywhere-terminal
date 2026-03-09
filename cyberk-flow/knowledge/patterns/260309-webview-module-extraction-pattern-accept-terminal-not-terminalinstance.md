---
labels: [webview, refactor, xterm, architecture]
source: cyberk-flow/changes/extract-simple-modules
summary: When extracting modules from main.ts, accept xterm Terminal type directly instead of TerminalInstance to keep modules decoupled from main.ts internals.
---
# Webview module extraction pattern: accept Terminal not TerminalInstance
**Date**: 2026-03-09

## TL;DR
- Extracted modules (ThemeManager, BannerService, XtermFitService) accept `Terminal` from `@xterm/xterm` rather than `TerminalInstance` from main.ts
- This keeps modules testable and decoupled — they depend only on the xterm library type, not on the app's internal state shape
- The caller in main.ts bridges between `TerminalInstance` and the module's interface

## Context
During Phase 8 decomposition of the 1478-LOC main.ts webview, three modules were extracted. A key design decision was choosing parameter types for the extracted functions/classes: should they accept `TerminalInstance` (the app-level interface) or `Terminal` (the library type)?

## Pattern
When extracting code from a monolith module:
1. **Functions/classes accept library-level types** (e.g., `Terminal` from `@xterm/xterm`), not app-specific wrapper types (e.g., `TerminalInstance`)
2. **Iterables use minimal interfaces** — `ThemeManager.applyToAll` accepts `Iterable<{ terminal: Terminal }>` instead of `Map<string, TerminalInstance>`
3. **The composition root (main.ts) bridges** — it destructures `instance.terminal` and passes it to the extracted module
4. **Return data, don't cause side effects** — `fitTerminal` returns `{ cols, rows } | null` instead of calling `terminal.resize()` directly; the caller decides

### Concrete examples:
- `fitTerminal(terminal: Terminal, parentElement: HTMLElement)` — not `fitTerminal(instance: TerminalInstance)`
- `showBanner(container: HTMLElement, message, severity)` — not `showBanner(message, severity)` with internal `getElementById`
- `ThemeManager.applyToAll(terminals: Iterable<{ terminal: Terminal }>)` — not `applyToAll(terminals: Map<string, TerminalInstance>)`

## Evidence
- `src/webview/resize/XtermFitService.ts` → `fitTerminal()` — accepts `Terminal` + `HTMLElement`, returns data
  - grep: `"export function fitTerminal"`
- `src/webview/ui/BannerService.ts` → `showBanner()` — accepts `HTMLElement` container
  - grep: `"export function showBanner"`
- `src/webview/theme/ThemeManager.ts` → `applyToAll()` — accepts `Iterable<{ terminal: Terminal }>`
  - grep: `"applyToAll(terminals: Iterable"`

## When to apply
- When extracting functions/classes from main.ts or other composition roots
- When a function currently takes an app-specific type but only uses a subset of its properties
- When designing module boundaries in the webview layer
