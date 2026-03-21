# terminal-context-menu Specification

## Purpose
TBD
## Requirements

### Requirement: Context Menu Commands Registration

The extension SHALL register the following commands for the terminal context menu:
- `anywhereTerminal.ctx.copy` — MUST send `{ type: "ctxCopy" }` to the visible webview
- `anywhereTerminal.ctx.paste` — MUST send `{ type: "ctxPaste" }` to the visible webview
- `anywhereTerminal.ctx.selectAll` — MUST send `{ type: "ctxSelectAll" }` to the visible webview
- `anywhereTerminal.ctx.clearTerminal` — MUST send `{ type: "ctxClear" }` to the visible webview
- `anywhereTerminal.ctx.newTerminal` — MUST call `doNewTerminal()` on the focused provider
- `anywhereTerminal.ctx.killTerminal` — MUST call `doKillTerminal()` on the focused provider

All commands MUST be hidden from the command palette (`"when": "false"` in `commandPalette`).

#### Scenario: Copy via context menu copies selected text

- **Given** terminal has text "hello" selected
- **When** user right-clicks and selects "Copy"
- **Then** extension sends `{ type: "ctxCopy" }` to webview, webview copies selection to clipboard

#### Scenario: Paste via context menu pastes clipboard content

- **When** user right-clicks and selects "Paste"
- **Then** extension sends `{ type: "ctxPaste" }` to webview, webview reads clipboard and pastes via `terminal.paste()`

#### Scenario: New Terminal via context menu creates tab

- **When** user right-clicks and selects "New Terminal"
- **Then** `doNewTerminal()` is called on the focused provider, creating a new terminal tab

### Requirement: Context Menu Contribution Points

The `package.json` SHALL declare the following entries under `contributes.menus.webview/context`:

| Command | Label | Group | Order | When |
|---|---|---|---|---|
| `anywhereTerminal.ctx.copy` | Copy | clipboard@1 | 1 | `webviewSection == 'splitPane'` |
| `anywhereTerminal.ctx.paste` | Paste | clipboard@1 | 2 | `webviewSection == 'splitPane'` |
| `anywhereTerminal.ctx.selectAll` | Select All | clipboard@1 | 3 | `webviewSection == 'splitPane'` |
| `anywhereTerminal.ctx.clearTerminal` | Clear Terminal | terminal@2 | 1 | `webviewSection == 'splitPane'` |
| `anywhereTerminal.ctx.newTerminal` | New Terminal | terminal@2 | 2 | `webviewSection == 'splitPane'` |
| `anywhereTerminal.ctx.killTerminal` | Kill Terminal | terminal@2 | 3 | `webviewSection == 'splitPane'` |

Existing split-pane entries (Close Pane, Split Vertical, Split Horizontal) SHALL remain in their current `pane@1` / `split@1` / `split@2` groups, renumbered to `split@3` to appear after the new entries.

#### Scenario: Context menu shows grouped items with separators

- **Given** user right-clicks on a terminal pane
- **Then** context menu shows: Copy, Paste, Select All | Clear Terminal, New Terminal, Kill Terminal | Close Pane, Split Vertical, Split Horizontal (groups separated by lines)

### Requirement: Webview Context Menu Message Handlers

The webview `handleMessage()` function SHALL handle the following new message types:
- `ctxCopy` — MUST copy the active terminal's selection to clipboard (same logic as Cmd+C with selection)
- `ctxPaste` — MUST read clipboard and paste via `terminal.paste()` (reuse `handlePaste()`)
- `ctxSelectAll` — MUST call `terminal.selectAll()` on the active terminal
- `ctxClear` — MUST call `terminal.clear()` on the active terminal

Each handler MUST operate on the **active pane's terminal** in the current tab (using the focused/active split pane session).

#### Scenario: ctxCopy with no selection does nothing

- **Given** active terminal has no selection
- **When** webview receives `{ type: "ctxCopy" }` message
- **Then** no clipboard write occurs (graceful no-op)

#### Scenario: ctxPaste delegates to handlePaste

- **When** webview receives `{ type: "ctxPaste" }` message
- **Then** `handlePaste(terminal, clipboard)` is called on the active terminal

