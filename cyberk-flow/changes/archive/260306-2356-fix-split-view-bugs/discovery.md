# Discovery: fix-split-view-bugs

## Workstreams

| # | Workstream | Used? | Justification |
|---|---|---|---|
| 1 | Memory Recall | No | Prior split changes are well-documented in archived changes |
| 2 | Architecture Snapshot | Yes | Read all affected files to root-cause bugs |
| 3 | Internal Patterns | No | Bugs are in existing code, not new patterns |
| 4 | External Research | No | No external libraries involved |
| 5 | Documentation | No | VS Code codicon names are well-known |
| 6 | Constraint Check | No | No new dependencies |

## Key Findings

### Bug 1: Split button icons swapped in package.json

**Root cause**: `package.json` lines 109-116 — icon assignments are swapped:
- `anywhereTerminal.splitHorizontal` uses `$(split-vertical)` ← WRONG
- `anywhereTerminal.splitVertical` uses `$(split-horizontal)` ← WRONG

The icons need to be swapped so each command uses its matching codicon.

Button sizing is controlled by VS Code's view/title menu rendering — all buttons in the `navigation` group are evenly sized by default. The uneven sizing may be a side effect of the wrong icons having different visual weights. Fixing the icons should resolve the sizing perception.

### Bug 2: Ghost tab showing UUID

**Root cause**: `TerminalViewProvider.ts` lines 199-208 — the `requestCloseSplitPane` handler calls `this.sessionManager.destroySession()` AND sends `tabRemoved` message back to the webview. But split pane sessions are NOT tabs — they exist within a tab's split tree. Sending `tabRemoved` for a split pane session causes the webview's `removeTerminal()` to try to process it as a tab removal, which is incorrect.

Additionally, the `onReady` handler (line 229-295) sends ALL sessions for a view in the `init` message via `getTabsForView()`. If `getTabsForView()` returns split pane sessions alongside root tab sessions, they would appear as separate tabs in the init message. The `SessionManager.getTabsForView()` returns all sessions created for a view — it doesn't distinguish between root tabs and split pane sessions.

The fix should be in the webview side: the `updateTabBar()` function already filters by `tabLayouts` keys (line 882), so split pane sessions that don't have their own `tabLayouts` entry won't appear in the tab bar. The ghost tab issue is likely from the `init` message including split pane sessions as tabs. The webview's `handleInit()` creates a terminal for each tab in the init message, and `createTerminal()` creates a `tabLayouts` entry (line 694). The fix in `splitPaneCreated` handler (line 1041-1042) deletes the layout entry, but during init restoration, split pane sessions get their own layout entries.

The cleanest fix: stop sending `tabRemoved` for split pane sessions in `requestCloseSplitPane`, since the webview already handles pane removal internally.

### Bug 3: Split divider invisible

**Root cause**: Two issues:
1. `split.css` is never loaded in the webview HTML — `webviewHtml.ts` only loads `xterm.css`
2. Even if loaded, `split.css` line 27 sets `opacity: 0` on `.split-handle` — the divider is intentionally invisible at rest, only appearing on hover

The fix: Add a visible separator. Two approaches:
- **Option A**: Add inline styles in `SplitContainer.ts` for the handle background
- **Option B**: Load `split.css` in the webview HTML and update the opacity

Since `split.css` contains other important styles (`.active-pane`, `.split-leaf`, `.split-branch`), it should be loaded. But since esbuild bundles the webview as IIFE and doesn't handle CSS imports, the CSS needs to be either:
- Inlined in `webviewHtml.ts` (like the existing inline styles)
- Copied to `media/` and loaded via `<link>` (like `xterm.css`)

The simplest approach: add the split CSS as inline styles in `webviewHtml.ts` (consistent with existing inline styles there), and change the handle to have a visible 1px separator line using `--vscode-panel-border`.

## Gap Analysis

| Have | Need |
|---|---|
| Icons defined in package.json | Swap icon values |
| Split CSS file exists | Load CSS or inline styles in webview HTML |
| Handle has 4px flex basis | Add visible 1px border/background |
| requestCloseSplitPane sends tabRemoved | Stop sending tabRemoved for split panes |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| Icon swap breaks keybindings | LOW | Keybindings reference command IDs, not icons |
| CSS changes affect existing split styling | LOW | Only changing handle opacity/background |
| Removing tabRemoved causes stale state | LOW | Webview already handles pane cleanup internally |

## Open Questions

None — all bugs are root-caused with clear fixes.
