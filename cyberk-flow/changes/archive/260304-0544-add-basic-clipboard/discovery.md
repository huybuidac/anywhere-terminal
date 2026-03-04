# Discovery: add-basic-clipboard

## Workstreams Used/Skipped

| # | Workstream | Used? | Justification |
|---|---|---|---|
| 1 | Memory Recall | Yes | Seeded context from cf_search — found existing specs, design docs |
| 2 | Architecture Snapshot | Yes | gkg_repo_map + grep to map current implementation |
| 3 | Internal Patterns | Yes | Read existing implementation in src/webview/main.ts |
| 4 | External Research | Skipped | No novel library — xterm.js clipboard APIs well-documented in existing design docs |
| 5 | Documentation | Skipped | Design docs already comprehensive (flow-clipboard.md, keyboard-input.md) |
| 6 | Constraint Check | Skipped | No new dependencies |

## Key Findings

### Current Implementation State

The "Basic Clipboard" (PLAN.md task 1.7) is **already implemented** in `src/webview/main.ts`:
- `handlePaste()` (lines 180-189) — reads clipboard, delegates to `terminal.paste()`
- `attachInputHandler()` (lines 195-254) — custom key handler + onData wiring
- IME composition tracking (lines 83, 622-627) — `isComposing` flag via compositionstart/end
- All Cmd+C/V/K/A shortcuts handled in the key event handler

### Existing Spec

`cyberk-flow/specs/input-handler/spec.md` — 2 requirements:
1. Custom Key Event Handler (with 3 scenarios)
2. IME Composition Tracking (with 1 scenario)

### Audit: Implementation vs Design Docs

| Area | Design Doc Says | Implementation Does | Gap? |
|---|---|---|---|
| Bracketed paste | Explicit wrapping with `\x1b[200~...\x1b[201~` | Delegates to `terminal.paste()` which handles it natively | No — implementation is **better** (avoids duplicating xterm.js logic) |
| Line ending normalization | Explicit `\r?\n → \r` | Delegates to `terminal.paste()` | No — same reason |
| Clipboard API availability | Check `navigator.clipboard?.readText` before paste | No guard — directly calls `navigator.clipboard.readText()` | **YES** — missing guard |
| Copy error handling | Wrap in try/catch | Uses `.catch(() => {})` — silent | Minor — acceptable for copy |
| Paste error handling | try/catch with fallback | try/catch with console.warn | OK |
| `getSelection()` guard | Not mentioned | No guard for empty string | **YES** — `hasSelection()` true but `getSelection()` could return `""` |
| Cmd+K notification | Design says send `{ type: 'clear', tabId }` to extension | Only calls `terminal.clear()`, no message to extension | **YES** — extension scrollback cache not cleared |
| Ctrl+C → SIGINT | Always sends SIGINT | Correct — only intercepts `metaKey`, ctrlKey passes through | OK |
| Spec accuracy | Says explicit bracketed paste handling | Implementation correctly delegates to `terminal.paste()` | **YES** — spec needs update to match |

### Identified Improvements

1. **Clipboard API guard**: Add `navigator.clipboard?.readText` check before paste
2. **Cmd+K extension notification**: Send `clear` message so extension can reset scrollback cache
3. **getSelection() guard**: Check for empty string after `getSelection()`
4. **Spec alignment**: Update spec to reflect that `terminal.paste()` handles bracketed paste natively
5. **Unit tests**: No tests exist for any input handler logic

## Gap Analysis

| Have | Need |
|---|---|
| Working clipboard implementation | Clipboard API availability guard |
| Basic error handling | Cmd+K notification to extension host |
| Existing spec (2 requirements) | Updated spec matching actual (correct) implementation |
| Zero tests | Unit tests covering key handler logic, paste, copy, IME |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Bracketed paste approach | Keep `terminal.paste()` delegation | xterm.js handles it natively; explicit wrapping would duplicate logic and risk bugs |
| Cmd+K notification | Add `clear` message to extension | Extension holds scrollback cache per session; clearing terminal without notifying creates stale cache |
| Test framework | Vitest (existing) | Already used for PtyManager, PtySession, OutputBuffer tests |
| Test approach | Unit tests with mocked Terminal | Webview code can't run in Node; mock xterm.js Terminal API |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| xterm.js Terminal mock complexity | LOW | Only need to mock a few methods: hasSelection, getSelection, clearSelection, paste, clear, selectAll, attachCustomKeyEventHandler |
| Clipboard API not available in test env | LOW | Mock navigator.clipboard in tests |
| Cmd+K clear message — no handler on extension side | LOW | Check if extension already handles `clear` message type; if not, add handler |

## Open Questions

None — all decisions are straightforward for this change.
