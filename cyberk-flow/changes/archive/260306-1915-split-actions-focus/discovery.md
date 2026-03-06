# Discovery: split-actions-focus

## Workstreams

| # | Workstream | Used? | Justification |
|---|---|---|---|
| 1 | Memory Recall | Yes | Found prior split-layout-core context, out-of-scope items |
| 2 | Architecture Snapshot | Yes | Read all affected files: main.ts, SplitModel.ts, SplitContainer.ts, extension.ts, messages.ts, package.json |
| 3 | Internal Patterns | Yes | Studied existing command registration, message handling, tab switching patterns |
| 4 | External Research | No | No novel libraries — all patterns exist in codebase |
| 5 | Documentation | No | No new external APIs |
| 6 | Constraint Check | Yes | Read package.json for existing commands/menus/keybindings |

## Key Findings

### Existing Split Infrastructure (from split-layout-core)
- `SplitModel.ts` has: `createLeaf`, `createBranch`, `findLeaf`, `getAllSessionIds`, `replaceNode`, `updateBranchRatio`
- **Missing**: `removeLeaf` / unsplit operation — need to add this to SplitModel
- `SplitContainer.ts` renders split tree recursively with `onLeafMounted` callback
- `main.ts` manages `tabLayouts: Map<string, SplitNode>` and `_renderTabSplitTree(tabId)`
- State persistence via `persistLayoutState()` / `restoreLayoutState()`

### Command Registration Pattern
- `extension.ts` registers commands via `vscode.commands.registerCommand`
- Uses `getFocusedProvider()` helper to determine sidebar vs panel
- Commands post messages to webview via `view.webview.postMessage`
- `package.json` declares commands in `contributes.commands` and menus in `contributes.menus`

### IPC Message Pattern
- `messages.ts` defines discriminated union types for both directions
- WebView → Extension: `WebViewToExtensionMessage` union
- Extension → WebView: `ExtensionToWebViewMessage` union
- New split messages need to flow Extension → WebView (commands trigger split in webview)

### Focus Management Current State
- `activeTabId` tracks which tab is active (tab-level, not pane-level)
- `terminal.focus()` called on tab switch
- No concept of "active pane within a tab" — this is new
- `attachInputHandler` wires `terminal.onData` with the tab's ID
- Tab bar reflects `activeTabId`

### Key Architecture Decision: Where Split Logic Lives
- **Split commands** originate in extension host (VS Code commands) but execute in webview (DOM manipulation)
- Extension host sends a message like `{ type: 'splitPane', direction: 'horizontal' }` to webview
- Webview handles: create new session request → extension creates PTY → webview updates split tree
- **Alternative**: Webview requests split, extension creates session, sends back `splitPaneCreated` — this is cleaner because the webview needs a new sessionId from the extension host (PTY creation)

### Focus Management Architecture
- Need `activePaneId` state in webview (separate from `activeTabId`)
- Click on a leaf pane → set `activePaneId`, call `terminal.focus()`
- Visual indicator: CSS border/outline on `.split-leaf.active-pane`
- Input routing: `terminal.onData` already routes by session ID, so focus just determines which terminal gets keyboard events via `terminal.focus()`
- Tab bar should show the active pane's session name (or the tab's primary name)

## Gap Analysis

| Have | Need |
|---|---|
| Split tree data model | `removeLeaf` operation for unsplit |
| Tab-level active tracking | Pane-level active tracking (`activePaneId`) |
| Command registration pattern | 3 new commands (splitH, splitV, closeSplitPane) |
| IPC message types | New message types for split actions |
| CSS for split layout | CSS for active pane indicator |
| Tab bar rendering | Split action buttons in tab bar/toolbar |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Split initiation flow | Webview requests split → Extension creates session → Extension sends `splitPaneCreated` → Webview updates tree | Extension host owns PTY creation; webview can't create sessions directly |
| Close pane flow | Webview sends `closeSplitPane` → Extension destroys session → Extension sends confirmation → Webview removes leaf | Consistent with existing closeTab pattern |
| Focus tracking location | Webview-only (`activePaneId` state) | Focus is a UI concern; extension host doesn't need to know which pane is focused |
| Active pane indicator | 1px border using `--vscode-focusBorder` | Consistent with VS Code's focus styling |
| Keyboard shortcuts | Cmd+\ (vertical), Cmd+Shift+\ (horizontal) on Mac; Ctrl+\ / Ctrl+Shift+\ on others | Standard split shortcuts (matches VS Code editor split) |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| Keyboard shortcuts may conflict with VS Code built-in | LOW | Use `when` clause to scope to our views only |
| Focus management with multiple xterm instances | LOW | xterm.js `terminal.focus()` is well-tested |
| removeLeaf edge case: last pane in tab | LOW | If only one leaf, closeSplitPane = closeTab |

## Open Questions

None — all resolved via discovery.
