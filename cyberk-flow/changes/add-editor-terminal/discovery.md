# Discovery: add-editor-terminal

## Workstreams

| # | Workstream | Status | Justification |
|---|---|---|---|
| 1 | Memory Recall | Done | Seeded context from prior panel-terminal change and design docs |
| 2 | Architecture Snapshot | Done | Mapped providers/, extension.ts, session/, types/ |
| 3 | Internal Patterns | Done | Analyzed TerminalViewProvider as reference implementation |
| 4 | External Research | Skipped | No new libraries; WebviewPanel is well-documented VS Code API |
| 5 | Documentation | Skipped | Design docs already comprehensive for this feature |
| 6 | Constraint Check | Done | Checked package.json for commands, activationEvents |

## Key Findings

### Architecture Snapshot
- **TerminalViewProvider** (347 LOC) handles sidebar + panel via `WebviewViewProvider`
- Each instance manages a single PTY session (Phase 1 pattern — no SessionManager yet)
- Core logic: `onReady()` spawns PTY, creates OutputBuffer, sends `init` message
- `getHtmlForWebview()` generates secure HTML with CSP/nonce, embeds `data-terminal-location` attribute
- `handleMessage()` routes all message types with defensive validation
- `safePostMessage()` handles disposed webview gracefully

### Internal Patterns (TerminalViewProvider → TerminalEditorProvider)
- **HTML generation** is identical — same CSP, same script/style URIs, same DOM structure
- **Message handling** is identical — same ready handshake, input/resize/ack routing
- **PTY lifecycle** is identical — same spawn, output buffering, exit handling
- **Key difference**: `WebviewPanel` API differs from `WebviewView`:
  - Created via `vscode.window.createWebviewPanel()` (on-demand, not declarative)
  - Has `panel.title` for tab name (shows in editor tab bar)
  - Has `panel.onDidDispose` (not `onDidChangeVisibility`)
  - Has `panel.reveal()` to bring to front
  - `retainContextWhenHidden` set in options at creation time
  - No `resolveWebviewView` — lifecycle is managed by the extension

### Current extension.ts
- Only registers sidebar and panel providers
- No commands registered yet
- `deactivate()` is empty — no cleanup (PTY cleanup happens in view dispose handlers)

### Design Doc Reference
- `docs/design/webview-provider.md` §7 explicitly defines `TerminalEditorProvider` pattern
- Uses static `createPanel()` method
- Generates dynamic `viewId = editor-${crypto.randomUUID()}`
- Shares HTML generation via extracted function

## Gap Analysis

| Have | Need |
|---|---|
| TerminalViewProvider with full PTY lifecycle | TerminalEditorProvider using WebviewPanel |
| `getHtmlForWebview()` as private method | Shared/extracted HTML generation (or duplication) |
| `handleMessage()` as private method | Shared/extracted message handling (or duplication) |
| `safePostMessage()` as private method | Same utility in new provider |
| No commands registered | `anywhereTerminal.newTerminalInEditor` command |
| No activation event for command | `onCommand:anywhereTerminal.newTerminalInEditor` |
| `location` type: `"sidebar" \| "panel"` | Extend to include `"editor"` |

## Key Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Code sharing approach | Extract shared functions OR duplicate with minor differences | TerminalViewProvider uses private methods; extracting requires refactoring. Minimal duplication is acceptable for Phase 1 since SessionManager (Phase 2) will refactor both providers anyway. |
| Editor viewId format | `editor-${crypto.randomUUID()}` | Per design doc, dynamic ID per panel |
| Panel title | `"Terminal"` (static for now) | Tab naming with numbers is Phase 2 (SessionManager) |
| `retainContextWhenHidden` | `true` | Same rationale as sidebar/panel — preserves terminal state |
| Multiple editor panels | Yes — each command invocation creates a new panel | Per design: "One per opened editor tab" |
| PTY cleanup on panel close | `panel.onDidDispose()` → kill PTY | Same pattern as view dispose |

## Options Comparison: Code Sharing Strategy

| Criteria | Option A: Extract shared module | Option B: Duplicate with adaptation |
|---|---|---|
| Effort | ~1h more (refactor TerminalViewProvider) | Minimal |
| Risk | Medium — refactoring working code | Low — isolated new file |
| Maintenance | Better long-term | Slight duplication until Phase 2 |
| Phase 2 impact | Less refactoring needed | Same — both will be refactored for SessionManager |
| Recommendation | | **Recommended** — lower risk, Phase 2 refactors both anyway |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| Code duplication between providers | LOW | Phase 2 SessionManager will unify both; keep duplication minimal |
| Editor tab lifecycle differs from view | LOW | Well-documented API; `onDidDispose` is sufficient |
| Multiple editor panels spawning many PTYs | LOW | Each panel has independent PTY; cleanup on dispose |

## Open Questions

None — the design docs and existing implementation provide sufficient guidance.
