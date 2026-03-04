# Discovery: implement-webview-terminal

## Workstreams Used/Skipped

| # | Workstream | Status | Justification |
|---|---|---|---|
| 1 | Memory Recall | Used | Seeded context from cf_search — found xterm-integration, resize-handling, keyboard-input, theme-integration, message-protocol designs |
| 2 | Architecture Snapshot | Used | gkg_repo_map + file reads — mapped existing src/ structure, TerminalViewProvider, messages.ts |
| 3 | Internal Patterns | Used | Read existing TerminalViewProvider implementation, esbuild config, message types |
| 4 | External Research | Skipped | All xterm.js patterns are already documented in docs/design/ — no novel external integration |
| 5 | Documentation | Skipped | Design docs are comprehensive and up-to-date |
| 6 | Constraint Check | Used | Verified package.json deps and esbuild config |

## Key Findings

### Current State
- `src/webview/main.ts` is a **placeholder** (3 lines: `console.log`)
- xterm.js dependencies **already installed**: `@xterm/xterm ^6.0.0`, `@xterm/addon-fit ^0.11.0`, `@xterm/addon-web-links ^0.12.0`
- esbuild **already configured** for dual-target build (extension CJS + webview IIFE)
- `media/xterm.css` is **already copied** via esbuild plugin
- `TerminalViewProvider` exists with HTML generation (CSP, nonce, `#terminal-container`, `#tab-bar`) and message routing stubs
- Message types **fully defined** in `src/types/messages.ts` (all 8 WV→Ext + 9 Ext→WV types)
- No SessionManager/PtyManager yet (task 1.4 scope) — the `ready` handler is a stub

### Design Docs Available
- `docs/design/xterm-integration.md` — Terminal init, addon loading, lifecycle, tab switching
- `docs/design/resize-handling.md` — ResizeObserver + 100ms debounce + visibility handling
- `docs/design/keyboard-input.md` — Cmd+C/V/K/A, IME composition tracking
- `docs/design/theme-integration.md` — CSS variable mapping, MutationObserver, location-aware bg
- `docs/design/message-protocol.md` — Full protocol spec, handshake sequence

### Architecture Decisions (pre-made in design docs)
- **MVP: all webview code in single `main.ts`** (~400-500 lines), extract to modules in Phase 2
- **DOM renderer first** (no WebGL for MVP)
- **FitAddon + WebLinksAddon** always loaded (Tier 1 addons)
- **100ms debounce** on all resize events (simplified from VS Code's adaptive strategy)
- **CSS display toggle** for tab switching (preserve scrollback)
- **MutationObserver on body class** for theme changes
- **acquireVsCodeApi()** for postMessage communication

## Gap Analysis

| Have | Need |
|---|---|
| Placeholder `main.ts` | Full xterm.js initialization + event wiring |
| Message types defined | Message handler in webview (window.addEventListener) |
| HTML with `#terminal-container` | xterm.js Terminal opening into container |
| xterm deps installed | Import and use xterm.js, FitAddon, WebLinksAddon |
| TerminalViewProvider sends `viewShow` | Webview handles `viewShow` for deferred resize |
| N/A | ResizeObserver + debounce logic |
| N/A | Theme reading from CSS variables |
| N/A | Keyboard handler (Cmd+C/V copy/paste, SIGINT) |
| N/A | IME composition tracking |
| N/A | Flow control ack batching |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| xterm.js v6 API differences from design docs (written for v5) | LOW | API is stable; verify Terminal constructor options |
| No SessionManager yet — can't test full I/O flow | LOW | Webview can be tested standalone; sends `ready`/`resize` messages, receives mocked responses |
| Single `main.ts` file may be large (~400-500 lines) | LOW | Acceptable for MVP; documented plan to extract in Phase 2 |

## Open Questions

None — design docs are comprehensive and all architectural decisions are pre-made.
