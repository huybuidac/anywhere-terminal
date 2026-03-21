# Discovery: add-keyboard-context-menu

## Workstreams

| # | Workstream | Used? | Justification |
|---|---|---|---|
| 1 | Memory Recall | ✅ | Found prior clipboard change, context menu was explicitly cut from Phase 1 |
| 2 | Architecture Snapshot | ✅ | Mapped src/webview/ and src/extension.ts structure |
| 3 | Internal Patterns | ✅ | Read existing InputHandler.ts, context menu commands in package.json |
| 4 | External Research | ❌ | VS Code webview/context API is well-known, no novel patterns |
| 5 | Documentation | ❌ | No new external libraries |
| 6 | Constraint Check | ❌ | No new dependencies |

## Key Findings

### Existing Keyboard Handler (InputHandler.ts)
- `createKeyEventHandler()` factory with dependency injection — handles Cmd+C, Cmd+V, Cmd+K, Cmd+A
- Already fully implemented and tested (129 lines code, 398 lines tests)
- Cmd+V uses native browser paste (returns `false` to let xterm handle it)
- Missing: Escape key handling (deselect/pass to shell)
- Ctrl+Tab already handled separately via `handleTabKeyboardShortcut()` in TabBarUtils.ts

### Existing Context Menu (package.json)
- `webview/context` menu section already exists with 3 entries: Close Pane, Split Vertical, Split Horizontal
- Uses `webviewSection == 'splitPane'` condition and `data-vscode-context` on DOM elements
- Extension host has `postToVisibleWebview()` helper for routing context menu commands
- Missing: Copy, Paste, Select All, Clear Terminal, New Terminal, Kill Terminal

### Architecture
- Context menus in VS Code webviews use the `webview/context` contribution point in package.json
- Commands are registered in extension.ts and receive context data from `data-vscode-context`
- Clipboard operations (Copy/Paste) need to be handled via postMessage to webview since clipboard API is in webview context
- New Terminal / Kill Terminal can reuse existing `doNewTerminal()` / `doKillTerminal()` helpers

## Gap Analysis

| Have | Need |
|---|---|
| Cmd+C/V/K/A in InputHandler.ts | Add Escape key handling |
| Ctrl+Tab in TabBarUtils.ts | Already done — no work needed |
| 3 context menu items (split/close pane) | Add 7 more items (Copy, Paste, Select All, Clear, separator, New Terminal, Kill Terminal) |
| `postToVisibleWebview()` helper | Reuse for new context menu commands |
| `data-vscode-context` on split panes | Already set — context menu items will appear on right-click |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Escape key behavior | Clear selection if exists, else pass to shell | Matches VS Code integrated terminal behavior |
| Context menu clipboard ops | Extension sends message to webview, webview executes | Clipboard API only available in webview context |
| Context menu grouping | clipboard@1, terminal@2, split@3 (existing) | Logical grouping with separators |

## Risks & Constraints

- **LOW**: All patterns are well-established in the codebase
- Clipboard operations from context menu require round-trip: extension command → postMessage → webview handler
- No new dependencies needed

## Open Questions

None — all patterns are clear from existing code.
