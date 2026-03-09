# Design: Extract Simple Modules

## Goals / Non-Goals
- **Goals**: Extract ThemeManager, BannerService, XtermFitService from `main.ts` as independent modules. Reduce `main.ts` by ~270 LOC. Isolate xterm private APIs to one module.
- **Non-Goals**: Change any runtime behavior. Add dependency injection framework. Extract ResizeCoordinator, StateStore, or MessageRouter (later phases).

## Architecture

After extraction, `main.ts` imports and delegates to three new modules:

```
main.ts (composition root, ~1200 LOC after this phase)
  ├── ThemeManager (class, ~130 LOC)
  │   └── owns: theme resolution, MutationObserver, location state
  ├── BannerService (function, ~43 LOC)
  │   └── owns: banner DOM creation, dismiss lifecycle
  └── XtermFitService (function, ~100 LOC)
      └── owns: ALL xterm _core._renderService access
```

## Gap Analysis

| Component | Have | Need | Gap |
| --------- | ---- | ---- | --- |
| ThemeManager | 8 functions + 2 state vars scattered in main.ts | Class with clean API | Extract + wrap |
| BannerService | 1 function + 1 constant in main.ts | Standalone function | Extract |
| XtermFitService | 1 function in main.ts | Standalone function | Extract |

## Decisions

### ThemeManager as a class (not standalone functions)
ThemeManager owns mutable state (`location`, `observer`) and has lifecycle (`startWatching`, `dispose`). A class is appropriate here — it's the Observer+Service pattern from the plan. Standalone functions would require passing state around or using module-level variables, which defeats the purpose of extraction.

### BannerService as a standalone function (not a class)
`showBanner` is stateless DOM manipulation. No lifecycle, no mutable state beyond the banners it creates (which are DOM-owned). A single exported function with its constant is sufficient.

### XtermFitService as a standalone function (not a class)
`fitTerminal` is a pure computation (input: terminal + parent → output: resize or no-op). No state, no lifecycle. A function is the right shape. It takes `Terminal` from xterm directly — the caller provides the instance.

### TerminalInstance type stays in main.ts (for now)
The `TerminalInstance` interface is used by many functions across main.ts. Moving it out is part of Phase 8.5 (WebviewStateStore). For this phase, ThemeManager.applyToAll and XtermFitService accept the xterm `Terminal` type directly, not `TerminalInstance`, keeping the new modules decoupled from main.ts internals.

### ThemeManager.applyToAll accepts `Iterable<TerminalInstance>`
To avoid importing `TerminalInstance` into ThemeManager, we define a minimal interface: `{ terminal: Terminal }`. This keeps ThemeManager decoupled — it only needs the xterm `Terminal` to set theme options.

## Risk Map

| Component | Risk Level | Reason | Verification |
| --------- | ---------- | ------ | ------------ |
| ThemeManager | LOW | Move-and-wrap, pattern exists (InputHandler) | Type-check + manual theme test |
| BannerService | LOW | Simplest extraction, no state | Type-check |
| XtermFitService | LOW | Single function, no state | Type-check + manual resize test |
| main.ts integration | LOW | Import + delegate, same behavior | Type-check + lint |

## Migration Plan
1. Create `src/webview/resize/XtermFitService.ts` — move `fitTerminal()` (no dependencies on other extractions)
2. Create `src/webview/ui/BannerService.ts` — move `showBanner()` + constant (no dependencies)
3. Create `src/webview/theme/ThemeManager.ts` — move theme functions + state (no dependencies on 1 or 2)
4. Update `main.ts` — replace inline implementations with imports
5. Type-check + lint

All three extractions are independent — order doesn't matter for correctness. The order above is by ascending complexity.

## Open Questions
- None
