## 1. Extract XtermFitService

- [x] 1_1 Create `src/webview/resize/XtermFitService.ts` with `fitTerminal()` function
  - **Refs**: docs/PLAN.md#8.3; design.md#XtermFitService-as-standalone-function
  - **Done**: New file exists; exports `fitTerminal(terminal: Terminal, parentElement: HTMLElement): { cols: number; rows: number } | null`; contains ALL xterm `_core._renderService` access
  - **Test**: N/A — pure refactor, type-check verifies
  - **Files**: `src/webview/resize/XtermFitService.ts`
  - **Approach**: Move `fitTerminal()` (main.ts:665-706) to new file. Change signature from `(instance: TerminalInstance)` to `(terminal: Terminal, parentElement: HTMLElement)` so the module depends only on xterm's `Terminal` type, not on `TerminalInstance`. The caller in `main.ts` will pass `instance.terminal` and `instance.terminal.element?.parentElement`. Return `{ cols, rows } | null` instead of void — let the caller decide whether to call `terminal.resize()`. This keeps the fit service pure (no side effects beyond `_renderService.clear()`).

- [x] 1_2 Update `main.ts` to import and use `fitTerminal` from XtermFitService
  - **Deps**: 1_1
  - **Refs**: docs/PLAN.md#8.3
  - **Done**: `main.ts` no longer contains any `_core` or `_renderService` access; `fitTerminal` import from `./resize/XtermFitService`; type-check passes
  - **Test**: N/A — pure refactor
  - **Files**: `src/webview/main.ts`
  - **Approach**: Replace the inline `fitTerminal(instance)` function with a wrapper that calls the imported `fitTerminal(instance.terminal, instance.terminal.element?.parentElement!)` and then calls `instance.terminal.resize(cols, rows)` if the result is non-null. Keep the wrapper named `fitTerminal` to minimize churn in the 7+ call sites.

## 2. Extract BannerService

- [x] 2_1 Create `src/webview/ui/BannerService.ts` with `showBanner()` function
  - **Refs**: docs/PLAN.md#8.2; design.md#BannerService-as-standalone-function
  - **Done**: New file exists; exports `showBanner(container: HTMLElement, message: string, severity: "error" | "warn" | "info"): void`; includes `INFO_BANNER_DISMISS_MS` constant
  - **Test**: N/A — pure refactor, type-check verifies
  - **Files**: `src/webview/ui/BannerService.ts`
  - **Approach**: Move `showErrorBanner()` (main.ts:560-592) and `INFO_BANNER_DISMISS_MS` (main.ts:553) to new file. Change signature to accept `container: HTMLElement` instead of looking up `#terminal-container` internally — this makes the function testable without DOM globals. Rename to `showBanner` per the plan spec.

- [x] 2_2 Update `main.ts` to import and use `showBanner` from BannerService
  - **Deps**: 2_1
  - **Refs**: docs/PLAN.md#8.2
  - **Done**: `main.ts` no longer contains `showErrorBanner` or `INFO_BANNER_DISMISS_MS`; `showBanner` import from `./ui/BannerService`; type-check passes
  - **Test**: N/A — pure refactor
  - **Files**: `src/webview/main.ts`
  - **Approach**: Replace `showErrorBanner(message, severity)` call in `handleMessage` with `showBanner(containerEl, message, severity)` where `containerEl = document.getElementById("terminal-container")`. Remove the old function and constant from `main.ts`.

## 3. Extract ThemeManager

- [x] 3_1 Create `src/webview/theme/ThemeManager.ts` with ThemeManager class
  - **Refs**: docs/PLAN.md#8.1; design.md#ThemeManager-as-a-class
  - **Done**: New file exists; exports `ThemeManager` class with methods: `getTheme()`, `getMinimumContrastRatio()`, `applyToAll()`, `applyBodyBackground()`, `updateLocation()`, `startWatching()`, `dispose()`; includes `LOCATION_BACKGROUND_MAP` constant
  - **Test**: N/A — pure refactor, type-check verifies
  - **Files**: `src/webview/theme/ThemeManager.ts`
  - **Approach**: Create a class that owns `location` (TerminalLocation) and `observer` (MutationObserver | undefined). Move `getXtermTheme()` -> `getTheme()`, `isHighContrastTheme()` (private), `getMinimumContrastRatio()`, `applyThemeToAll()` -> `applyToAll(terminals)`, `applyBodyBackground()`, `updateLocation()`, `startThemeWatcher()` -> `startWatching(onThemeChange)`. Define `TerminalLocation` type and `LOCATION_BACKGROUND_MAP` in the module. `applyToAll` accepts `Iterable<{ terminal: Terminal }>` to stay decoupled from `TerminalInstance`. `startWatching` takes a callback `onThemeChange: () => void` so ThemeManager doesn't need to know about terminals — `main.ts` passes a callback that calls `themeManager.applyToAll(terminals.values())`.

- [x] 3_2 Update `main.ts` to import and use ThemeManager
  - **Deps**: 3_1
  - **Refs**: docs/PLAN.md#8.1
  - **Done**: `main.ts` no longer contains theme functions, `LOCATION_BACKGROUND_MAP`, `terminalLocation`, or `themeObserver`; `ThemeManager` import from `./theme/ThemeManager`; type-check passes
  - **Test**: N/A — pure refactor
  - **Files**: `src/webview/main.ts`
  - **Approach**: Create `themeManager` instance in `bootstrap()` with initial location. Replace all theme function calls: `getXtermTheme(loc)` -> `themeManager.getTheme()`, `getMinimumContrastRatio()` -> `themeManager.getMinimumContrastRatio()`, `applyThemeToAll()` -> `themeManager.applyToAll(terminals.values())`, `applyBodyBackground(loc)` -> `themeManager.applyBodyBackground()`, `updateLocation(loc)` -> `themeManager.updateLocation(loc)`, `startThemeWatcher()` -> `themeManager.startWatching(callback)`. Remove state vars `terminalLocation`, `themeObserver`, and the `LOCATION_BACKGROUND_MAP` constant. Export `TerminalLocation` type from ThemeManager for use by `inferLocationFromSize()`.

## 4. Verify

- [x] 4_1 Run type-check, lint, and unit tests to confirm no regressions
  - **Deps**: 1_2, 2_2, 3_2
  - **Refs**: project.md#Commands
  - **Done**: `pnpm run check-types` passes; `pnpm run lint` passes; `pnpm run test:unit` passes
  - **Test**: N/A — verification step
  - **Approach**: Run `pnpm run check-types`, `pnpm run lint`, `pnpm run test:unit` sequentially. Fix any issues found.
