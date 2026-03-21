# Discovery: add-theme-settings

## Workstreams

| # | Workstream | Used? | Justification |
|---|---|---|---|
| 1 | Memory Recall | ✅ | Found prior theme-manager spec, design docs, config patterns |
| 2 | Architecture Snapshot | ✅ | Mapped affected files: webview/main.ts, providers, extension.ts, messages.ts, package.json |
| 3 | Internal Patterns | ✅ | Existing ThemeManager in main.ts, TerminalConfig interface, applyConfig() |
| 4 | External Research | ❌ | Not needed — VS Code extension API is well-known, no novel libraries |
| 5 | Documentation | ❌ | Existing design doc (docs/design/theme-integration.md) is comprehensive |
| 6 | Constraint Check | ✅ | Checked package.json — no new dependencies needed |

## Key Findings

### Existing Theme Infrastructure (main.ts)
- `getXtermTheme()` already reads all 16 ANSI + 4 special CSS variables
- `LOCATION_BACKGROUND_MAP` already maps panel/sidebar/editor to CSS variables
- `applyBodyBackground()` and `applyThemeToAll()` exist
- `startThemeWatcher()` uses MutationObserver on body class
- `getFontFamily()` reads `--vscode-editor-font-family` CSS variable
- Location inference via `inferLocationFromSize()` (aspect ratio heuristic)

### Existing Config Infrastructure
- `TerminalConfig` interface: `{ fontSize, cursorBlink, scrollback }`
- `applyConfig()` in main.ts applies partial config updates to all terminals
- `ConfigUpdateMessage` type exists for extension→webview config push
- Both providers send hardcoded config `{ fontSize: 14, cursorBlink: true, scrollback: 10000 }` in onReady()

### Gaps

| Have | Need |
|---|---|
| Location-aware background via `LOCATION_BACKGROUND_MAP` | Already implemented — background fallback chain works |
| `getFontFamily()` reads CSS variable | Font family already read from CSS; need to also accept config override |
| Hardcoded config in providers | Read from `workspace.getConfiguration('anywhereTerminal')` |
| No `contributes.configuration` in package.json | Define all 6 settings |
| No `onDidChangeConfiguration` listener | Listen and push `configUpdate` to webviews |
| No high-contrast specific handling | Detect high-contrast via body class, ensure theme works |
| TerminalConfig missing fontFamily | Add fontFamily to TerminalConfig interface |

### Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Font resolution location | Extension host (not CSS vars) | Per design doc: `terminal.integrated.fontSize` and `editor.fontSize` are not CSS vars in webviews |
| Settings namespace | `anywhereTerminal.*` | Matches existing convention in PLAN.md |
| Shell/args settings | macOS only for now | Extension is macOS-focused per Phase 4 |
| High-contrast detection | Body class check | VS Code sets `vscode-high-contrast` / `vscode-high-contrast-light` classes |
| Config change propagation | Push via `configUpdate` message | Existing pattern — `ConfigUpdateMessage` already defined |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| Font size 0 means "inherit" | LOW | Already handled in applyConfig — `config.fontSize \|\| 14` |
| High-contrast themes may omit ANSI colors | LOW | getXtermTheme already returns undefined for missing vars, xterm.js uses defaults |
| Shell path validation on settings change | LOW | Reuse existing `validateShell()` from PtyManager |

## Open Questions

None — all questions resolved from existing design docs and codebase analysis.
