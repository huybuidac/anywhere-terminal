# AnyWhere Terminal – Implementation Plan (English)

## Phase 1 – MVP: 1 terminal in 1 Sidebar view

### Goals
- Have one view in the Primary Sidebar that shows a fully functional terminal (xterm.js + node-pty) connected to a real shell.
- Run stably on at least one main OS (Linux/macOS or Windows).

### Detailed tasks

1. **Scaffold the extension**
   - Use `yo code` to generate a basic TypeScript VS Code extension.[web:20]
   - Add `esbuild`, `typescript`, `@types/node` to `devDependencies`.[web:3][web:9]
   - Configure `bundle` (esbuild) and `vscode:prepublish` scripts in `package.json`.

2. **Define the view container & view (Primary Sidebar)**
   - In `package.json`:
     - Add a `viewsContainers.activitybar` entry with id `anywhereTerminal`.
     - Add a `views.anywhereTerminal` entry with view id `anywhereTerminal.sidebarPrimary`, type `webview`.[web:13]
   - Set a suitable icon and title (e.g. `icon.svg`, "AnyWhere Terminal").

3. **Implement a basic WebviewViewProvider**
   - Create `AnywhereTerminalViewProvider` implementing `WebviewViewProvider`.
   - In `resolveWebviewView`:
     - Enable `enableScripts: true`.
     - Set `localResourceRoots` to `media/`.
     - Return HTML with a `<div id="terminal"></div>` container and load `xterm.js`, `xterm.css`, `main.js`.[web:20]

4. **Add xterm.js on the webview side**
   - Install `xterm` + `xterm-addon-fit`.[web:8][web:24]
   - Build/bundle JS for the webview (small webpack/rollup bundle, or copy UMD builds from `node_modules` into `media/`).
   - In `main.js`:
     - Initialize `Terminal` + `FitAddon`.
     - `term.open(...)`, `term.loadAddon(fitAddon)`.
     - Wire up a bridge with `acquireVsCodeApi()` (onData → `postMessage`, on message `data` → `term.write`).

5. **Integrate node-pty on the extension side**
   - For the first phase, reuse VS Code’s built‑in node-pty via the dynamic require hack in `pty.ts`.[web:18]
   - Implement a `createSession(view)` function that spawns a shell (bash/zsh/powershell) with default width/height.[web:21]
   - Hook PTY `.onData` → `view.webview.postMessage({ type: 'data', data })`.
   - Hook PTY `.onExit` → send an `exit` message down to the webview.

6. **Handle resize & basic lifecycle**
   - Webview: use `FitAddon` and `window.resize` to `fit()` and send `{ type: 'resize', cols, rows }`.
   - Extension: on a `resize` message, call `pty.resize(cols, rows)`.
   - Clean up session when a view is disposed or the PTY exits.

7. **Manual testing**
   - Run with F5 and open the view in the Activity Bar.
   - Verify:
     - Shell prompt appears.
     - Commands (ls, pwd, node, git, etc.) run correctly.
     - Resizing VS Code roughly resizes the terminal correctly.

---

## Phase 2 – Multi-location: Sidebar, Panel, Secondary (via move)

### Goals
- Provide independent terminal views in the Primary Sidebar and Panel.
- Offer a recommended way for users to place a view in the Secondary Sidebar using standard VS Code UI.

### Detailed tasks

1. **Add a Panel view container & view**
   - In `package.json`:
     - Add a `viewsContainers.panel` entry with id `anywhereTerminalPanel`.
     - Add a `views.anywhereTerminalPanel` entry with view id `anywhereTerminal.panel`, type `webview`.[web:13]

2. **Reuse the provider for multiple view IDs**
   - Use the same `AnywhereTerminalViewProvider` for both `anywhereTerminal.sidebarPrimary` and `anywhereTerminal.panel`.
   - In `resolveWebviewView`, create a new session for each view instance.

3. **Design the session map & logic**
   - Generate unique `sessionId` values (e.g. timestamp + random suffix).
   - Map `sessionId` → `{ pty, view }`.
   - Each view instance has its own dedicated session.

4. **Support the Secondary Sidebar**
   - Document in README: right‑click the view header → `Move View` → select `Secondary Side Bar`.[web:10][web:13]
   - Optional: command `anywhereTerminal.moveToSecondary`:
     - Focus the view.
     - Call `vscode.commands.executeCommand('workbench.action.moveView')` to open the move picker (user still chooses the destination).[web:4][web:10]

5. **Optimize the I/O bridge**
   - Add a small output buffer for node-pty:
     - Accumulate data and flush it to the webview every ~10–16 ms.
   - Ensure there are no event listener leaks when repeatedly opening/closing views.

6. **Multi-location testing**
   - Open Sidebar + Panel views simultaneously and run heavy commands (git status, npm run, log tail) in both.
   - Manually move one view to the Secondary Sidebar and verify everything still works.

---

## Phase 3 – Polish: Theming, Settings, Multi-session, Persistence

### Goals
- Provide a solid everyday experience: theme-aligned, stable behavior.
- Support multiple sessions per view + auto‑restore sessions when reopening a workspace.

### Detailed tasks

1. **Theming & basic UX**
   - Use CSS variables `--vscode-terminal-background`, `--vscode-terminal-foreground`, `--vscode-editor-font-family`, `--vscode-editor-font-size` to style the container/xterm.[web:42][web:53][web:54]
   - Use `vscode-light`, `vscode-dark`, `vscode-high-contrast` classes for further fine‑tuning.
   - Adjust scrollbars, padding, and maybe a small status line (e.g. current shell + cwd).

2. **Settings (configuration)**
   - Define `contributes.configuration` in `package.json`:
     - `anywhereTerminal.defaultShell.linux`, `.macOS`, `.windows`.
     - `anywhereTerminal.scrollback`, `anywhereTerminal.fontSize`, `anywhereTerminal.cursorBlink`.
     - `anywhereTerminal.enableBracketedPaste`, etc.
   - Read configuration via `workspace.getConfiguration('anywhereTerminal')` when creating sessions.

3. **Multiple sessions in a single view**
   - Webview side:
     - Add a small header bar: tabs or a dropdown session list + `+` (New) and `x` (Close) buttons.
     - Message protocol:
       - `webview → extension`: `createSession`, `switchSession(id)`, `killSession(id)`.
       - `extension → webview`: `sessionCreated`, `sessionList`, `sessionExited`.
   - Extension side:
     - Track `activeSessionId` + a list of sessions per view.
     - On `switchSession`, just change routing of data; keep PTYs alive.

4. **Session persistence**
   - Store session metadata in `workspaceState`:
     - `sessionId`, `shell`, `cwd`, `viewLocation`, `createdAt`.
   - On activation or view resolve:
     - Load metadata and recreate the relevant PTYs (no need to replay buffers at first).
   - Optionally use `xterm-addon-serialize` to snapshot buffers and store them (possibly truncated) in `workspaceState` or a hidden file, then restore on reload.[web:24][web:23]

5. **Advanced interactions**
   - Webview context menu (right‑click) for Copy, Paste, Select All, Clear.
   - Optional hotkeys (e.g. Ctrl+Shift+T within the view → reopen last closed session).

6. **Hardening & testing**
   - Test workspaces with long and non‑ASCII paths, multiple git repos, etc.
   - Stress‑test with long‑running processes (npm run dev, docker logs, tail -f) across multiple sessions.
   - Ensure no crashes when VS Code reloads the window.

---

## Phase 4 – Packaging, Marketplace, CI/CD

### Goals
- Package and publish reliably.
- Have CI/CD pipelines for automatic build/test/package.

### Detailed tasks

1. **Finalize bundling & packaging**
   - Ensure `bundle` (esbuild) and `vscode:prepublish` run before `vsce package`.[web:3][web:9]
   - Configure `.vscodeignore` to drop unnecessary files but keep:
     - `out/` (bundled extension).
     - `media/` (webview assets).
     - If you vendor node-pty: `node_modules/node-pty/**` or similar.[web:18]

2. **README & docs**
   - Clearly explain:
     - Capabilities: terminals in Sidebar and Panel; how to put one into the Secondary Sidebar.
     - Main settings.
     - Known limitations (e.g. Secondary Sidebar requires user‑driven “Move View”).[web:10][web:13]
   - Add screenshots/gifs.

3. **Marketplace metadata**
   - Configure `displayName`, `description`, `categories` ("Other", "Debuggers" if relevant), `keywords` ("terminal", "sidebar", "panel").
   - Provide a 128x128 icon and banner if desired.

4. **CI/CD (GitHub Actions)**
   - Workflow: on push/tag:
     - `npm ci`.
     - `npm run lint` (if present) and `npm test`.
     - `npm run bundle`.
     - `npx vsce package` to produce a `.vsix` artifact.
   - Optional: auto‑publish on tags like `v*`:
     - Use a VS Code Marketplace PAT (`VSCE_PAT`) to run `vsce publish`.[web:3]

5. **Feedback & iteration**
   - Gather issues/feedback from users.
   - Prioritize fixes: crashes/compatibility, I/O performance, keybinding conflicts.
   - Build a backlog for advanced features (task integration, workspace profiles, AI integration, etc.).
