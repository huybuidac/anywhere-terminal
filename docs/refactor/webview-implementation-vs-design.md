# Webview Implementation vs Design — Full Audit

## Scope

- **9 design docs** audited: message-protocol, xterm-integration, resize-handling, theme-integration, keyboard-input, flow-initialization, flow-multi-tab, output-buffering, error-handling
- **13 source files** read: `src/webview/main.ts`, `src/webview/InputHandler.ts`, `src/webview/TabBarUtils.ts`, `src/webview/SplitModel.ts`, `src/webview/SplitContainer.ts`, `src/webview/SplitResizeHandle.ts`, `src/types/messages.ts`, `src/types/errors.ts`, `src/providers/TerminalViewProvider.ts`, `src/providers/TerminalEditorProvider.ts`, `src/session/SessionManager.ts`, `src/session/OutputBuffer.ts`, `src/settings/SettingsReader.ts`
- **~226 individual claims** checked with file:line references

## Aggregate Results

| Verdict    | Count | Percentage |
| ---------- | ----- | ---------- |
| MATCH      | 90    | 40%        |
| PARTIAL    | 52    | 23%        |
| MISMATCH   | 36    | 16%        |
| CODE-ONLY  | 38    | 17%        |
| DOC-ONLY   | 10    | 4%         |

## Per-Document Summary

| Design Doc             | Match | Partial | Mismatch | Code-Only | Doc-Only |
| ---------------------- | ----- | ------- | -------- | --------- | -------- |
| message-protocol       | 24    | 4       | 4        | 9         | 3        |
| xterm-integration      | 6     | 9       | 6        | 10+       | 1        |
| resize-handling        | 12    | 5       | 7        | 5         | 0        |
| theme-integration      | 6     | 5       | 6        | 3         | 0        |
| keyboard-input         | 7     | 4       | 7        | 3         | 1        |
| flow-init/multi-tab/output | 30 | 16      | 3        | 3         | 5        |
| error-handling         | 5     | 9       | 3        | 5         | 0        |

## Which Is More Trustworthy?

### Code is more trustworthy for runtime behavior

The code has evolved significantly beyond the docs. 38 features exist in code with no documentation at all. The most significant undocumented features:

- **Split pane system** (~400 LOC, 9 message types) — entirely absent from all design docs
- **Adaptive output buffering** (4–16ms based on throughput) — docs say fixed 8ms
- **Custom `fitTerminal()` using `getBoundingClientRect()`** — docs describe `FitAddon.fit()` which is loaded but never called (dead code)
- **Dynamic location inference from container aspect ratio** — docs say location comes from init message
- **High-contrast theme support** with WCAG AAA contrast ratio (7.0) — undocumented
- **Output pause/resume for hidden views** — undocumented
- **1MB buffer overflow protection with FIFO eviction** — undocumented
- **Error banner UI with severity-based styling** — undocumented

### Docs are more trustworthy for 4 behaviors that code should fix

| Issue | Doc says | Code does | Risk |
|---|---|---|---|
| **Ack routing** | Implies per-session routing | Routes all acks to active tab only (`TerminalViewProvider.ts:142-149`). Webview ack has no `tabId` (`main.ts:643`). | Background tab PTY can be permanently paused if it produces heavy output while another tab is active. |
| **Shared `resizeTimeout`** | N/A | `debouncedFit()` (`main.ts:709`) and `debouncedFitAllLeaves()` (`main.ts:400`) share a single `resizeTimeout` variable (`main.ts:95`). They clobber each other's debounce timers. | Split-pane resize during a window resize can cancel one or the other. |
| **Missing null guard on `_renderService.clear()`** | N/A | `main.ts:699` calls `core._renderService.clear()` without optional chaining, while line 666 uses `core?._renderService?.dimensions` with guards. | NPE if `_core` or `_renderService` is unavailable when `clear()` is called. |
| **`handlePaste()` is dead code** | Central to paste flow | `InputHandler.ts:45-58` — defined, exported, never called. `case "v"` in key handler returns `false` without calling it (`InputHandler.ts:117-123`). | Dead code and doc confusion. Either remove it or wire it. |

### Docs describe useful features that were never implemented (DOC-ONLY)

| Feature | Design Doc | Assessment |
|---|---|---|
| Pre-launch input queue | flow-initialization §9a | Fast typists could lose keystrokes before PTY ready. Worth implementing. |
| `maxTabs` limit (`_canCreateTerminal`) | flow-multi-tab §2.2 | No limit exists. Unbounded tab creation possible. Low risk in practice but easy to add. |
| `stateUpdate` reconciliation message | flow-multi-tab §2.9 | Not implemented. Webview relies on individual `tabCreated`/`tabRemoved` messages. Current approach works but is less resilient to message loss. |
| `enableCmdK` config setting | keyboard-input §8 | Cmd+K always clears, not configurable. Decide whether configurability is needed. |
| VS Code Output Channel logging | error-handling §9 | All logging goes to `console.*`, not a VS Code Output Channel. No structured log function. |
| CWD existence validation | error-handling §3.6 | No `fs.existsSync()` check on CWD. `CwdNotFoundError` class is dead code. |
| Type guard functions | message-protocol §6 | `isWebViewMessage()` / `isExtensionMessage()` described but never implemented. |

## Critical Mismatches by Design Doc

### Message Protocol

- **9 undocumented message types**: `requestSplitSession`, `requestCloseSplitPane`, `viewShow`, `splitPane`, `splitPaneCreated`, `closeSplitPane`, `closeSplitPaneById`, `splitPaneAt`, `ctxClear` — all in code but not in docs.
- **`fontFamily` field** added to `TerminalConfig` (`messages.ts:16`) but not in doc.
- **`src/webview/utils/MessageHandler.ts`** listed as a dependent file — does not exist.
- **Union types are stale**: `WebViewToExtensionMessage` has 10 members (doc says 8). `ExtensionToWebViewMessage` has 15 members (doc says 8).

### Xterm Integration

- **Lazy loading pattern not implemented**: Doc describes `getXtermModule()` caching; code uses static `import { Terminal }` (`main.ts:18`).
- **`allowProposedApi: true`** in doc but not set in code.
- **WebGL is always loaded synchronously**, not on-demand via `gpuAcceleration` config. No such config exists.
- **Addon cache (`loadAddon<T>()` helper)** described but not implemented.
- **xterm version**: Doc says v5, code uses v6 (`package.json:416`). All addon versions are one minor ahead.
- **File size**: Doc predicts 400–500 LOC; actual is 1473 LOC.
- **`FitAddon` is dead weight**: Loaded into every terminal (`main.ts:859-861`), stored on every instance (`main.ts:896`), but `.fit()` is never called. Custom `fitTerminal()` replaces it entirely.

### Resize Handling

- **Debounce placement is inverted**: Doc says debounce is between `onResize` and `postMessage`. Code debounces between `ResizeObserver` and fit, then `postMessage` is immediate from `terminal.onResize` (`main.ts:885-887`).
- **`FitAddon.fit()` not used**: Code uses custom `fitTerminal()` (`main.ts:660-701`) with `getBoundingClientRect()` and xterm `_core._renderService.dimensions`.
- **`ResizeHandler` class and `IResizeHandler` interface**: Both described in doc, neither exists. Code uses module-level functions.
- **File location**: Doc says `src/webview/utils/ResizeHandler.ts` — file does not exist.
- **Per-terminal ResizeHandler**: Doc says one per terminal; code has one global `ResizeObserver` observing `#terminal-container`.

### Theme Integration

- **Background resolution priority inverted**: Doc says `--vscode-terminal-background` first, then location-specific. Code at `main.ts:449` does location-specific first: `get(LOCATION_BACKGROUND_MAP[location]) ?? get("--vscode-terminal-background")`.
- **`ThemeManager` class**: Does not exist. Code uses module-level functions in `main.ts:442-521`.
- **Default location parameter**: Doc says `"panel"`, code says `"sidebar"` (`main.ts:442`).
- **Return type**: Doc says `ITheme`, code returns `Record<string, string | undefined>`.
- **7 extra theme properties** in code not documented (cursor accent, selection foreground, inactive selection background, 4 scrollbar properties).
- **Dynamic location inference**: `inferLocationFromSize()` (`main.ts:119-121`) — completely undocumented. Changes location based on container aspect ratio.

### Keyboard Input

- **Paste handling is the biggest gap**: Doc dedicates ~60 lines to manual bracketed paste and `\r?\n` → `\r` normalization. None implemented. Code delegates to xterm's native paste event. `handlePaste()` is dead code.
- **`enableCmdK` not implemented**: Cmd+K always clears (`InputHandler.ts:126-128`). No config check.
- **`IInputHandler` interface**: Doc describes a class with `attach`/`detach`/`updateConfig` methods. Code uses a factory function `createKeyEventHandler()`.
- **File path**: Doc says `src/webview/terminal/InputHandler.ts`; actual is `src/webview/InputHandler.ts`.
- **3 undocumented shortcuts**: Escape clears selection, Cmd+Backspace sends `\x15` (line kill), Cmd+K sends `postMessage` clear notification.

### Flow Init / Multi-Tab / Output Buffering

- **Ack routing bug**: Webview ack message has no `tabId` (`main.ts:643`). Provider routes all acks to active session only (`TerminalViewProvider.ts:142-149`). This is a correctness issue for multi-tab scenarios.
- **Flush interval**: Doc says fixed 8ms. Code implements adaptive 4ms–16ms (`OutputBuffer.ts:19-35`) based on rolling throughput window. The adaptive behavior is a significant undocumented improvement.
- **`stateUpdate` reconciliation**: Described in docs, never implemented. No such message type exists.
- **WebView disposal**: Doc says destroy orphaned PTY sessions. Code preserves sessions (`TerminalViewProvider.ts:90-98`) and pauses output for re-creation.
- **Ack batching**: Doc describes a `while` loop sending multiple 5K acks. Code uses `if` with single send and reset to 0 (`main.ts:640-646`).

### Error Handling

- **WebView communication failure cleanup**: Doc says log warning, stop timer, clean up orphaned PTY. Code silently swallows errors (`safePostMessage` returns `void`, no logging, no cleanup).
- **CWD not found**: No `fs.existsSync()` check. No fallback chain for invalid CWDs. `CwdNotFoundError` is dead code.
- **Logging infrastructure**: Doc describes Output Channel with structured log levels. Not implemented — all logging is `console.*`.
- **4 dead error classes**: `SpawnError`, `CwdNotFoundError`, `WebViewDisposedError`, `SessionNotFoundError` — defined in `src/types/errors.ts` but never thrown.

## `main.ts` Pain Points

### Responsibility overload

`src/webview/main.ts` (1473 LOC) handles 18 distinct responsibilities:

| #  | Responsibility | Lines | LOC |
|----|---------------|-------|-----|
| 1  | Type declarations | 34–50 | 17 |
| 2  | Constants | 51–64 | 14 |
| 3  | Module-level state (12 `let` vars + 4 Maps) | 66–117 | 52 |
| 4  | Layout state persistence | 123–173 | 51 |
| 5  | Split pane management | 175–414 | 240 |
| 6  | Theme/location management | 416–546 | 131 |
| 7  | Error banner UI | 548–590 | 43 |
| 8  | Input handling wiring | 592–632 | 41 |
| 9  | Flow control (ack) | 634–646 | 13 |
| 10 | Resize/fit handling | 648–800 | 153 |
| 11 | Terminal CRUD | 802–936 | 135 |
| 12 | Tab switching | 938–1017 | 80 |
| 13 | Terminal disposal | 1019–1086 | 68 |
| 14 | Tab bar rendering | 1088–1135 | 48 |
| 15 | Config application | 1137–1191 | 55 |
| 16 | Message routing (14-case switch) | 1192–1363 | 172 |
| 17 | Init orchestration | 1365–1408 | 44 |
| 18 | Bootstrap/entry point | 1410–1473 | 64 |

### State management is scattered

16 module-level mutable variables with mutations spread across the file:

- `activeTabId` mutated by 3+ functions across 400 lines
- `tabLayouts` (Map) mutated by 6+ functions across the entire file
- `tabActivePaneIds` (Map) mutated by 7+ functions
- `resizeTimeout` shared between `debouncedFit()` and `debouncedFitAllLeaves()` — they clobber each other

### Testability is zero

- `acquireVsCodeApi()` executes at import time (`main.ts:69`) — importing the module in tests throws
- Self-executing `bootstrap()` on module load (`main.ts:1468-1473`)
- No exports — every function is module-private
- DOM queries hardcoded in 20+ locations
- Browser APIs (ResizeObserver, MutationObserver, clipboard, navigator) used directly

### xterm private API usage

All in `fitTerminal()` (`main.ts:660-701`):
- `main.ts:665`: `(instance.terminal as any)._core`
- `main.ts:666`: `core?._renderService?.dimensions`
- `main.ts:699`: `core._renderService.clear()` (missing null guard)

### Dead code

- `FitAddon` loaded but never used (`main.ts:859-861`, `896`) — `fitTerminal()` bypasses it
- `handlePaste()` in `InputHandler.ts:45-58` — exported but never called
- `CwdNotFoundError`, `SpawnError`, `WebViewDisposedError`, `SessionNotFoundError` in `errors.ts`

## Recommended Actions

### Priority 1: Fix correctness bugs

1. **Make ack session-scoped**: Add `tabId` to ack message. Route to correct session's `OutputBuffer` in `TerminalViewProvider.ts:142-149`.
2. **Fix shared `resizeTimeout`**: Give `debouncedFit()` and `debouncedFitAllLeaves()` separate timers.
3. **Add null guard**: `main.ts:699` — change `core._renderService.clear()` to `core?._renderService?.clear()`.

### Priority 2: Remove dead code

1. Remove `FitAddon` from `TerminalInstance` interface, imports, and creation. Or use it instead of custom `fitTerminal()`.
2. Remove `handlePaste()` from `InputHandler.ts` (or wire it for real).
3. Remove dead error classes or start throwing them.

### Priority 3: Update design docs

All 9 docs need updates. The most stale:
1. **message-protocol** — 9 undocumented message types, stale union types
2. **xterm-integration** — wrong xterm version, wrong addon strategy, wrong file size
3. **resize-handling** — entirely wrong mechanism (FitAddon vs custom fit)
4. **keyboard-input** — paste flow is fictional
5. **theme-integration** — background priority inverted, class doesn't exist

### Priority 4: Refactor `main.ts`

See `docs/refactor/webview-refactor-plan.md` for the 5-phase extraction plan. The top pain points to address first:

1. Extract state into a `WebViewState` object (fixes scattered mutations, enables testing)
2. Extract `fitTerminal()` into `XtermFitService` (isolates xterm private API)
3. Extract `handleMessage()` cases into named handlers (fixes inline business logic)
4. Extract theme functions into `ThemeManager` (already ~130 LOC, self-contained)
5. Make `bootstrap()` non-self-executing with dependency injection (enables testing)

## Guiding Principle

> **Code is the source of truth for runtime behavior.**
> **Docs are the source of truth for intended architecture.**
> **When they disagree, fix both — update docs to match reality, fix code to match intended quality.**
