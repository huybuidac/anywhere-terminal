---
topic: drag-drop-terminal
change: add-drag-drop-path
date: 2026-03-19
libraries: [microsoft/vscode, xtermjs/xterm.js]
---

# Research: drag-drop-terminal

## Answers

- **1. VS Code built-in terminal behavior**
  - File/folder drop is handled in `microsoft/vscode` `src/vs/workbench/contrib/terminal/browser/terminalInstance.ts` by `TerminalInstanceDragAndDropController.onDrop`.
  - Drop sources checked in order:
    1. `DataTransfers.RESOURCES` (Explorer/tree resources)
    2. `CodeDataTransfers.FILES` (VS Code-internal file drag payload)
    3. `e.dataTransfer.files[0]` + `getPathForFile(...)` (OS file manager drag)
  - After resolving a `URI`, VS Code calls `instance.sendPath(path, false)`, so the path is **inserted only** and **not executed**.
  - `sendPath` calls `preparePathForShell(...)`, so the inserted text is **shell-aware escaped/quoted**, not a raw path.

- **2. Browser Drag and Drop API in VS Code WebViews**
  - Webviews are sandboxed iframes (`allow-scripts`, `allow-same-origin`, `allow-forms`, etc.) in `microsoft/vscode` `src/vs/workbench/contrib/webview/browser/webviewElement.ts`.
  - Inside webview content, standard HTML5 DnD events still apply (`dragenter`, `dragover`, `drop`), and `drop` requires `preventDefault()` during `dragover` to accept a drop.
  - For OS file drops, browser APIs can expose `DataTransfer.files` / `DataTransfer.items`, but **not reliable absolute local file paths**.
  - VS Code itself gets filesystem paths through privileged Electron plumbing: `globalThis.vscode.webUtils.getPathForFile(file)` via `src/vs/platform/dnd/browser/dnd.ts` + `src/vs/base/parts/sandbox/electron-browser/preload.ts`. This is a workbench capability, not standard web API behavior.

- **3. VS Code WebView drag-drop specifics**
  - VS Code’s internal webview bridge does **not** forward full drag payloads between iframe and workbench. `WebViewDragEvent` only contains `shiftKey` in `src/vs/workbench/contrib/webview/browser/webviewMessages.d.ts`.
  - The outer workbench reconstructs a synthetic `DragEvent` with that minimal payload in `handleDragEvent(...)`; no `DataTransfer` contents are forwarded there.
  - Result: do **not** assume a VS Code extension webview can read Explorer drag payloads such as `DataTransfers.RESOURCES`, `CodeDataTransfers.FILES`, or privileged path data the way the built-in terminal can.
  - `text/uri-list` is heavily used elsewhere in VS Code/editor drop providers, but there is no evidence in the webview bridge that Explorer-to-webview drop guarantees `text/uri-list` exposure to webview JavaScript.

- **4. Path quoting conventions**
  - **POSIX shells (`bash`, `sh`, `zsh`)**: VS Code uses single quotes by default via `escapeNonWindowsPath(...)`. Examples from `src/vs/platform/terminal/test/common/terminalEnvironment.test.ts`:
    - `/foo/bar` → `'/foo/bar'`
    - `/foo/bar'baz` → `'/foo/bar\'baz'`
    - both quote types present → `$'/foo/bar\'baz"qux'`
  - **fish**: still prefers single quotes unless both quote types are present; then it switches to double quotes and escapes `"`.
  - **Git Bash on Windows**: converts `\` to `/`, then applies POSIX-style quoting.
  - **WSL**: converts Windows path to Unix path using backend `getWslPath(..., 'win-to-unix')`.
  - **Non-Windows path sanitization**: VS Code removes dangerous characters before quoting: `` ` $ | & > ~ # ! ^ * ; < ``.
  - **Windows shells**: source snippet in `src/vs/workbench/contrib/terminal/common/terminalEnvironment.ts` shows special handling for Git Bash and WSL, then a Windows branch that wraps paths with spaces in double quotes. DeepWiki/source summary indicates PowerShell has additional special handling beyond plain double quotes, but exact current behavior was not fully verified from raw source.

- **5. xterm.js input injection**
  - `terminal.write(...)` is for **PTY output -> terminal display**. Do **not** use it to simulate pasted user input.
  - `terminal.input(data, wasUserInput?)` triggers xterm’s input path / `onData` and is appropriate for simulating typed input.
  - `terminal.paste(data)` is the closest semantic match for drag-drop path insertion if you want it treated like a **paste**:
    - normalizes pasted text for terminal input,
    - applies bracketed paste when enabled,
    - sanitizes ESC in bracketed paste mode,
    - ultimately triggers the input/data path.
  - In xterm.js source:
    - `src/browser/public/Terminal.ts` exposes `paste`, `input`, `write`
    - `src/browser/Clipboard.ts` shows `paste(...)` calling `coreService.triggerDataEvent(...)`
    - `demo/server/server.ts` shows the expected architecture: `term.onData(...)` forwards input to the backend PTY; backend PTY output returns via `term.write(...)`

## Recommended Approach

- Match VS Code semantics by treating drag-drop as **paste of a shell-prepared path**, not terminal output. Prefer `terminal.paste(preparedPath)` or an equivalent input-path call that flows through your existing `onData -> PTY.write` bridge.
- Reuse VS Code-like shell quoting rules, especially POSIX single-quote escaping, Git Bash path normalization, and WSL conversion. Do not insert raw filesystem paths.
- Assume a webview **cannot fully replicate** built-in terminal drop behavior for Explorer/OS drops using only standard DOM `DataTransfer` APIs. The built-in terminal has privileged access (`getPathForFile`, internal drag MIME types) that extension webviews likely do not.

## Core API

### VS Code terminal side

- `TerminalInstanceDragAndDropController.onDrop(...)`
- `TerminalInstance.sendPath(originalPath, false)`
- `TerminalInstance.preparePathForShell(originalPath)`
- `preparePathForShell(...)`
- `escapeNonWindowsPath(path, shellType?)`

### xterm.js side

- `terminal.paste(data: string): void`
- `terminal.input(data: string, wasUserInput = true): void`
- `terminal.write(data: string | Uint8Array, callback?): void`
- `terminal.onData(...)`

## Usage Examples

### VS Code built-in terminal drop flow

Source: `microsoft/vscode` `src/vs/workbench/contrib/terminal/browser/terminalInstance.ts`

```typescript
const rawResources = e.dataTransfer.getData(DataTransfers.RESOURCES);
if (rawResources) {
  path = URI.parse(JSON.parse(rawResources)[0]);
}

const rawCodeFiles = e.dataTransfer.getData(CodeDataTransfers.FILES);
if (!path && rawCodeFiles) {
  path = URI.file(JSON.parse(rawCodeFiles)[0]);
}

if (!path && e.dataTransfer.files.length > 0 && getPathForFile(e.dataTransfer.files[0])) {
  path = URI.file(getPathForFile(e.dataTransfer.files[0])!);
}

this._onDropFile.fire(path);
```

Then:

```typescript
await this.sendPath(path, false);
```

### xterm.js expected data flow

Source: `xtermjs/xterm.js` `demo/server/server.ts`

```typescript
term.onData(function(data) {
  send(data);
});
```

Interpretation:

- frontend input/paste -> `onData`
- app forwards to PTY/backend
- backend output -> `term.write(...)`

## Platform-Specific Setup

- **Desktop VS Code workbench** can resolve native file paths using Electron `webUtils.getPathForFile(file)`.
- **Extension webviews** should be treated as browser-sandboxed content; plan for reduced drag payload visibility.
- If drag-drop must work for both Explorer and external file manager exactly like the built-in terminal, a pure-webview implementation may hit capability limits unless an outer VS Code layer/extension host participates.

## Gotchas & Constraints

- Built-in terminal behavior is **not** a plain browser example; it depends on VS Code internal DnD MIME types and privileged Electron file-path access.
- `terminal.write(...)` will only paint text/output; it bypasses the user-input semantics you want.
- `terminal.paste(...)` can change payload shape under bracketed paste mode (wraps with `\x1b[200~...\x1b[201~` unless disabled, and sanitizes raw ESC).
- Non-Windows escaping intentionally strips several shell-metacharacters for safety; a “literal original filename” may not survive 1:1 if it contains those characters.
- The built-in terminal code shown only uses the **first** dropped file/path in the terminal drop handler snippet.

## Gaps

- Exact current `preparePathForShell(...)` behavior for **PowerShell/cmd.exe edge cases** was only partially verified from source snippets/DeepWiki; POSIX/Git Bash/Fish behavior is better-grounded because tests are explicit.
- No official evidence was found that extension webviews reliably receive Explorer drags as `text/uri-list`; treat that as unverified.
- No official VS Code extension API was found that gives a webview the same privileged `getPathForFile(...)` access the workbench uses internally.

## Confidence

**Medium-High** — built-in terminal drop flow and xterm.js input/output semantics were confirmed from source and tests; webview limitations are strongly supported by VS Code webview source, but exact Explorer-to-extension-webview payload behavior remains partially unverified.

Persisted file: `cyberk-flow/changes/add-drag-drop-path/research/drag-drop-terminal.md`
