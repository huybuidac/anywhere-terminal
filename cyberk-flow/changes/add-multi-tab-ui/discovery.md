# Discovery: add-multi-tab-ui

## Workstreams

| # | Workstream | Used? | Justification |
|---|---|---|---|
| 1 | Memory Recall | Yes | Checked for prior tab UI decisions |
| 2 | Architecture Snapshot | Yes | Mapped webview, providers, session manager |
| 3 | Internal Patterns | Yes | Read existing switchTab, createTerminal, removeTerminal |
| 4 | External Research | No | No novel libraries — xterm.js tab patterns well-understood |
| 5 | Documentation | Yes | Read all 6 design docs thoroughly |
| 6 | Constraint Check | No | No new dependencies needed |

## Key Findings

### Extension Host — FULLY IMPLEMENTED
- `SessionManager` already supports multi-session per view with `viewSessions` map
- `TerminalViewProvider.handleMessage()` already handles `createTab`, `switchTab`, `closeTab` messages
- `TerminalEditorProvider.handleMessage()` has identical multi-tab message handling
- Message types (`CreateTabMessage`, `SwitchTabMessage`, `CloseTabMessage`, `TabCreatedMessage`, `TabRemovedMessage`) are all defined in `src/types/messages.ts`
- Number recycling via `findAvailableNumber()` is implemented
- Operation queue serialization for destroy operations is implemented
- Kill tracking via `terminalBeingKilled` Set is implemented

### WebView — PARTIALLY IMPLEMENTED
- `createTerminal()` creates xterm instances with CSS display toggle ✓
- `switchTab()` hides/shows containers via `display: none/block` ✓
- `removeTerminal()` disposes xterm and switches to next tab ✓
- `handleMessage()` handles `tabCreated` and `tabRemoved` messages ✓
- **MISSING**: `renderTabBar()` function — the `#tab-bar` div exists in HTML but nothing renders into it
- **MISSING**: Tab bar CSS styles
- **MISSING**: Click handlers for tab switching and close buttons
- **MISSING**: "+" button for creating new tabs
- **MISSING**: Ctrl+Tab / Ctrl+Shift+Tab keyboard shortcuts
- **MISSING**: Tab bar update calls after tab mutations (create, switch, remove)

### HTML Template
- `webviewHtml.ts` already has `#tab-bar` div with `flex-shrink: 0` styling
- `#terminal-container` has `flex: 1` — tab bar will naturally sit above terminal area

## Gap Analysis

| Have | Need |
|---|---|
| `#tab-bar` empty div in HTML | Tab bar rendering function with tab elements |
| No tab bar CSS | Styled tab strip with VS Code theme variables |
| `switchTab()` function | Click handler on tab elements calling `switchTab()` |
| `removeTerminal()` function | Close button ("x") on each tab |
| `vscode.postMessage({ type: 'createTab' })` | "+" button wired to send createTab message |
| No keyboard shortcuts | Ctrl+Tab / Ctrl+Shift+Tab for tab cycling |
| Tab mutations don't update UI | `renderTabBar()` calls after create/switch/remove |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Tab bar rendering approach | Dynamic DOM via `renderTabBar()` | Simpler than template literals; matches design doc pattern |
| Tab switching mechanism | CSS `display: none/block` | Already implemented; preserves scrollback per design |
| Tab bar styling | VS Code CSS variables | Theme consistency per `docs/design/theme-integration.md` |
| Keyboard shortcut scope | Document-level keydown handler | Per `docs/design/flow-multi-tab.md` §Keyboard Shortcut |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| Tab bar takes vertical space from terminal | LOW | `flex-shrink: 0` already set; minimal height (~28px) |
| Theme mismatch | LOW | Use VS Code CSS variables exclusively |
| Performance with many tabs | LOW | Max 10 tabs per view (FR-15); DOM is trivial |

## Open Questions

None — all design decisions are documented in `docs/design/flow-multi-tab.md`.
