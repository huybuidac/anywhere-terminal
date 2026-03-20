# Discovery: add-drag-drop-path

## Workstreams

| # | Workstream | Used | Justification |
|---|---|---|---|
| 1 | Memory Recall | ✅ | Checked for prior drag-drop decisions — none found |
| 2 | Architecture Snapshot | ✅ | Mapped WebView layer: main.ts → TerminalFactory → InputHandler → IPC |
| 3 | Internal Patterns | ✅ | Found InputHandler.ts pattern for input injection via `postMessage` |
| 4 | External Research | ✅ | Researched VS Code built-in terminal drag-drop + xterm.js input API |
| 5 | VS Code Source Study | ✅ | Read local VS Code source at user's request — full DnD flow understood |
| 6 | Constraint Check | ⏭️ | No new deps — uses native browser Drag & Drop API |

## Key Findings

### VS Code Built-in Terminal Drag-Drop Flow (from source)

**File**: `vscode/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts`

1. `_initDragAndDrop(container)` → creates `TerminalInstanceDragAndDropController`
2. Controller listens for `onDragEnter`, `onDragOver`, `onDragLeave`, `onDrop`
3. On `onDragEnter`: shows `terminal-drop-overlay` div (visual feedback)
4. On `onDrop`: extracts file path from DataTransfer in priority order:
   - `DataTransfers.RESOURCES` (`'ResourceURLs'`) → VS Code Explorer tree items (JSON array of URI strings)
   - `CodeDataTransfers.FILES` (`'CodeFiles'`) → VS Code internal file drag (JSON array of paths)
   - `dataTransfer.files[0]` → OS file manager drag, uses `getPathForFile()` (Electron `webUtils.getPathForFile`)
5. Fires `onDropFile(path)` → calls `instance.sendPath(path, false)` (insert, don't execute)
6. `sendPath` → `preparePathForShell(path)` → `sendText(prepared, false)` → `processManager.write(text)`

**Path preparation**: `preparePathForShell()` in `terminalEnvironment.ts`:
- Delegates to `escapeNonWindowsPath()` for POSIX shells
- POSIX escaping (zsh/bash): wraps in single quotes `'...'`, escapes `'` with `\'`
- Strips dangerous chars: `` ` $ | & > ~ # ! ^ * ; < ``
- Fish: similar but uses `"..."` for paths with both quote types
- PowerShell: uses `& '...'` syntax

**Visual feedback CSS** (from `terminal.css`):
```css
.terminal-drop-overlay {
  position: absolute; left: 0; right: 0; top: 0; bottom: 0;
  pointer-events: none; opacity: 0; z-index: 34;
  background-color: var(--vscode-terminal-dropBackground, var(--vscode-editorGroup-dropBackground));
}
/* opacity set to 1 during drag via JS */
```

### WebView Architecture (our extension)
- **Entry point**: `src/webview/main.ts` → `bootstrap()` sets up all event listeners
- **Terminal mount**: `#terminal-container` div, each terminal gets a child `<div>` with `data-vscode-context`
- **Input flow**: `terminal.onData()` → `postMessage({ type: "input", tabId, data })` → Extension Host → PTY
- **Programmatic input pattern**: `postMessage({ type: "input", tabId, data: "\x15" })` (see InputHandler.ts:115)
- **Active pane resolution**: `store.tabActivePaneIds.get(activeTabId)` → session ID of focused pane

### WebView Data Transfer Availability

Extension WebViews are sandboxed iframes. Extraction priority order (matches spec):
1. **`'ResourceURLs'`** — VS Code Explorer tree drags (best-effort: may not cross iframe boundary)
2. **`'CodeFiles'`** — VS Code internal file type (best-effort)
3. **`'text/uri-list'`** — standard MIME type, likely available for some drag sources
4. **`dataTransfer.files[i].path`** — Electron non-standard `File.path` property → try for OS file drags
5. **`'text/plain'`** — basic fallback (use if starts with `/`)
6. **`getPathForFile()`** — requires `globalThis.vscode.webUtils` (Electron privileged) → NOT available in extension WebViews, not used

Note: All URI-based strategies MUST use `decodeURIComponent()` to convert `%20` etc. back to real characters.

### xterm.js Input Methods
- `postMessage({ type: "input", tabId, data })` — **use this**: follows existing pattern, sends data directly to PTY via Extension Host, no bracketed paste wrapping
- VS Code's `sendText(text, shouldExecute=false)` does: normalize line endings `\r?\n` → `\r`, then write to PTY

## Gap Analysis

| Have | Need |
|---|---|
| Input injection pattern (`postMessage({ type: "input" })`) | Drag-drop event listeners on terminal containers |
| IPC protocol for sending input to PTY | Path extraction from DataTransfer (multi-strategy) |
| Active pane resolution (`store.tabActivePaneIds`) | POSIX path escaping (port `escapeNonWindowsPath`) |
| Terminal container DOM structure | Visual feedback overlay during drag |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Approach | WebView-only (Option A) | No Extension Host participation needed — VS Code internal data types may be readable directly in WebView iframe |
| Handler module | New `DragDropHandler.ts` in `src/webview/` | Follows InputHandler.ts pattern — extracted for testability |
| Path extraction | Multi-strategy (ResourceURLs → CodeFiles → text/uri-list → text/plain → File.path) | Matches VS Code priority; graceful degradation |
| Path escaping | Port `escapeNonWindowsPath()` from VS Code source | Exact same behavior as VS Code terminal |
| Input injection | `postMessage({ type: "input", tabId, data })` | Established pattern, sends directly to PTY |
| Visual feedback | Drop overlay div with `--vscode-terminal-dropBackground` CSS variable | Matches VS Code's visual style exactly |
| Target terminal | Active pane of active tab | Matches VS Code — drop goes to focused terminal |
| Multiple files | Space-separated quoted paths | User preference, matches shell conventions |
| Send with trailing space | Yes — append space after path | VS Code appends space so user can continue typing |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| WebView iframe may not receive VS Code internal DataTransfer types | MEDIUM | Multi-strategy extraction with graceful fallback; test empirically |
| Electron `File.path` may not be accessible in sandboxed WebView | LOW | Graceful no-op if unavailable |
| Path with special characters not properly escaped | LOW | Port VS Code's exact escaping logic; unit test edge cases |

## Open Questions

None — approach is clear. Implementation will empirically test which DataTransfer types are available in the WebView iframe.

## References

- [Drag-drop terminal research](research/drag-drop-terminal.md)
- VS Code source: `src/vs/workbench/contrib/terminal/browser/terminalInstance.ts` (TerminalInstanceDragAndDropController)
- VS Code source: `src/vs/platform/terminal/common/terminalEnvironment.ts` (escapeNonWindowsPath)
- VS Code source: `src/vs/workbench/contrib/terminal/common/terminalEnvironment.ts` (preparePathForShell)
