<!-- Tasks are executed sequentially in dependency order (topological sort). -->
<!-- Tasks with no Deps run first; tasks whose Deps are all complete run next. -->

## 1. Path Escaping

- [x] 1_1 Create POSIX shell path escaping utility
  - Tests: 8/8 pass (escapePathForShell). Commands: `pnpm run test:unit` — 393 pass
  - Deviation: escaping uses VS Code's `\'` pattern (not POSIX `'\''`) per user request to match VS Code source
  - **Refs**: specs/drag-drop-path-insertion/spec.md#posix-path-escaping; research/drag-drop-terminal.md#core-api
  - **Done**: Unit tests pass for all 5 escaping scenarios: simple path, path with spaces, path with single quote, path with dangerous chars, path with both single and double quotes
  - **Test**: src/webview/DragDropHandler.test.ts (unit)
  - **Files**: src/webview/DragDropHandler.ts, src/webview/DragDropHandler.test.ts
  - **Approach**: Create a `escapePathForShell(path: string): string` function exported from `src/webview/DragDropHandler.ts`. Port VS Code's `escapeNonWindowsPath()` logic from the local VS Code source at `vscode/src/vs/platform/terminal/common/terminalEnvironment.ts` (lines 14-80): (1) escape backslashes `\` → `\\`, (2) strip dangerous shell metacharacters `` ` $ | & > ~ # ! ^ * ; < `` via regex `/[\`\$\|\&\>\~\#\!\^\*\;\<]/g`, (3) apply shell-specific quoting: if path has both `'` and `"` → use `$'...'` ANSI-C quoting with `\'`; if path has only `'` → use `'...'` with `'\''` escape; otherwise → wrap in `'...'`. For MVP, only implement the default POSIX path (bash/zsh) — no fish, PowerShell, or Windows branches needed. Test file follows colocated pattern at `src/webview/DragDropHandler.test.ts`.

## 2. Path Extraction

- [x] 2_1 Create multi-strategy path extraction from DataTransfer
  - Tests: 12/12 pass (extractPathsFromDrop). Commands: `pnpm run test:unit` — 405 pass
  - All 6 spec scenarios covered: ResourceURLs, percent-encoded URI, File.path, text/plain, malformed JSON, strategy precedence
  - **Refs**: specs/drag-drop-path-insertion/spec.md#path-extraction-strategy; research/drag-drop-terminal.md#vs-code-built-in-terminal-drop-flow
  - **Done**: Unit tests pass for: ResourceURLs extraction, URI with percent-encoded spaces, File.path extraction, text/plain fallback, malformed JSON fallback, strategy precedence
  - **Test**: src/webview/DragDropHandler.test.ts (unit)
  - **Files**: src/webview/DragDropHandler.ts, src/webview/DragDropHandler.test.ts
  - **Approach**: Create a `extractPathsFromDrop(dataTransfer: DataTransfer): string[]` function in `DragDropHandler.ts`. Implement the 5-strategy priority chain matching VS Code's `TerminalInstanceDragAndDropController.onDrop()` from `terminalInstance.ts:2541-2578`: (1) try `getData('ResourceURLs')` → `JSON.parse()` → map each URI string to decoded path using `decodeURIComponent(new URL(uri).pathname)`, (2) try `getData('CodeFiles')` → `JSON.parse()`, (3) try `getData('text/uri-list')` → split on `\n`, filter `file://` lines → `decodeURIComponent(new URL(line).pathname)`, (4) try `dataTransfer.files` → read `.path` property (Electron non-standard), (5) try `getData('text/plain')` → use if starts with `/`. Each strategy wrapped in try/catch — on error, log to console.warn and continue to next strategy. Return array of absolute path strings. **Critical**: always `decodeURIComponent()` when extracting from URIs to handle `%20`, `%27`, etc. Mock `DataTransfer` in tests using a plain object with `getData()` and `files` properties.

## 3. Drag-Drop Event Handler & Visual Feedback

- [x] 3_1 Create DragDropHandler class with event listeners and visual overlay
  - Tests: 8/8 handler tests pass (overlay lifecycle, drop→postMessage, exited guard, multi-file, dragover preventDefault). Commands: `pnpm run test:unit` — 413 pass
  - jsdom environment configured per codebase convention
  - **Deps**: 1_1, 2_1
  - **Refs**: specs/drag-drop-path-insertion/spec.md#drop-file-path-insertion; specs/drag-drop-path-insertion/spec.md#drag-visual-feedback; research/drag-drop-terminal.md#recommended-approach
  - **Done**: DragDropHandler class is created with `setup(container)` method; overlay shows on dragenter, hides on dragleave/drop; drop extracts paths, escapes them, and calls postMessage; jsdom test verifies overlay lifecycle and drop→postMessage flow
  - **Test**: src/webview/DragDropHandler.test.ts (unit, jsdom)
  - **Files**: src/webview/DragDropHandler.ts, src/webview/DragDropHandler.test.ts
  - **Approach**: Create a `DragDropHandler` class in `DragDropHandler.ts` with dependencies `{ postMessage, getActiveTabId, getTerminalExited }` injected via constructor (follow `InputHandler.ts` DI pattern from `src/webview/InputHandler.ts`). The `setup(container: HTMLElement)` method attaches 4 event listeners: (1) `dragenter` — create/show overlay div with class `terminal-drop-overlay`, set inline styles: `position: absolute; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none; z-index: 34; background-color: var(--vscode-terminal-dropBackground, var(--vscode-editorGroup-dropBackground)); opacity: 0.5;` (matching VS Code's terminal.css). Ensure container has `position: relative` for overlay positioning. (2) `dragover` — `e.preventDefault()` to allow drop. (3) `dragleave` — remove overlay; check `e.relatedTarget` is outside container to avoid flicker from child xterm elements (use `container.contains(e.relatedTarget)` — only remove if target left the container). (4) `drop` — `e.preventDefault()`, remove overlay, call `extractPathsFromDrop(e.dataTransfer)`, map through `escapePathForShell()`, join with space, append trailing space, call `postMessage({ type: "input", tabId: getActiveTabId(), data: joinedPaths })`. Skip if `getTerminalExited()` returns true or no paths extracted. Add jsdom test: create a div, call `setup()`, dispatch synthetic `dragenter`/`dragleave`/`drop` events, verify overlay DOM presence and postMessage calls.

## 4. Integration

- [x] 4_1 Wire DragDropHandler into main.ts bootstrap
  - Type check: pass. Lint: pass (biome auto-fixed 1 file). Test: 413/413 pass
  - Wiring follows resizeCoordinator.setup() pattern in handleInit()
  - **Deps**: 3_1
  - **Refs**: specs/drag-drop-path-insertion/spec.md#drop-file-path-insertion
  - **Done**: Drag-and-drop works in all terminal locations (sidebar, panel, editor); type check and lint pass
  - **Test**: N/A — wiring only, all logic tested in earlier tasks
  - **Files**: src/webview/main.ts
  - **Approach**: In `src/webview/main.ts`, import `DragDropHandler` and instantiate it alongside other services (after line 38, near `factory` creation). Pass `{ postMessage: (msg) => vscode.postMessage(msg), getActiveTabId: () => store.activeTabId, getTerminalExited: () => { const tabId = store.activeTabId; if (!tabId) return true; const paneId = store.tabActivePaneIds.get(tabId) ?? tabId; const instance = store.terminals.get(paneId); return !instance || instance.exited; } }`. In `handleInit()`, after `resizeCoordinator.setup(containerEl)` (line 244), add `dragDropHandler.setup(containerEl)` to attach drag-drop listeners to `#terminal-container`. This mirrors how `resizeCoordinator` is wired — setup on the same container element after init.
