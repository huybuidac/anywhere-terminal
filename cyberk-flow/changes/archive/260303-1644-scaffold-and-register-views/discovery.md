# Discovery: scaffold-and-register-views

## Workstreams Used/Skipped

| # | Workstream | Used? | Justification |
|---|---|---|---|
| 1 | Memory Recall | YES | Seeded context on esbuild, view containers, package.json contributions |
| 2 | Architecture Snapshot | YES | Examined current project structure, package.json, esbuild.js, tsconfig.json |
| 3 | Internal Patterns | YES | Read existing extension.ts, design docs for build-system and webview-provider |
| 4 | External Research | SKIP | All needed info is in project design docs already |
| 5 | Documentation | SKIP | No new external libraries beyond xterm.js (well-documented in design docs) |
| 6 | Constraint Check | YES | Read package.json, tsconfig.json, .gitignore for current state |

## Key Findings

### Current State
- **Extension scaffolded**: `yo code` TypeScript + esbuild already done
- **esbuild.js**: Only has extension bundle (CJS, node, externals: `vscode`). Missing webview bundle entirely
- **tsconfig.json**: `lib: ["ES2022"]` only — missing `"DOM"` for webview code
- **package.json**: Has `alchemy` as runtime dependency (likely leftover), missing xterm deps, `main` points to `dist/extension.js`
- **src/**: Only `extension.ts` (hello world boilerplate) and `test/` directory
- **media/**: Does not exist yet
- **.vscodeignore**: Does not exist yet
- **.gitignore**: Ignores `out`, `dist`, `node_modules` but not `media/*.js` build artifacts
- **contributes**: Only a hello world command, no view containers or views

### Design Documents Available
- `docs/design/build-system.md` — Complete esbuild dual-target config with CSS copy plugin
- `docs/design/webview-provider.md` — Full package.json contributions for views, containers, commands, menus
- `docs/DESIGN.md` — File structure, architecture overview

### Gap Analysis

| Have | Need |
|------|------|
| Single esbuild target (extension only) | Dual-target: extension + webview (IIFE, browser) |
| No xterm dependencies | `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links` as devDeps |
| `lib: ["ES2022"]` only | Add `"DOM"` for webview TypeScript |
| No `media/` directory | `media/` with build artifacts (webview.js, xterm.css) |
| No `.vscodeignore` | Clean VSIX packaging config |
| No view containers/views | Activity bar container + sidebar webview view |
| Hello world command only | Activation event `onView:anywhereTerminal.sidebar` |
| `alchemy` runtime dep | Remove leftover dependency |
| `node-pty` not externalized | Add to esbuild externals |

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| xterm packages location | devDependencies | Bundled into webview.js at build time, not runtime deps |
| tsconfig approach | Single file with `DOM` lib (Option A) | MVP simplicity, small codebase |
| esbuild CSS handling | Copy plugin in webview build | CSP requires separate file, not inline |
| `node-pty` externalization | Add to extension externals | Loaded dynamically from VS Code internals |
| Phase 1 view scope | Sidebar only | Task 1.2 scope — panel is Phase 2 |

## Risks & Constraints

| Risk | Level | Mitigation |
|------|-------|------------|
| xterm.css copy path may vary between versions | LOW | Pin xterm version, verify path in build |
| `node-pty` path may differ across VS Code versions | LOW | Handled in task 1.4 (pty manager), not in scope here |

## Open Questions

None — all design decisions are well-documented in existing design docs.
