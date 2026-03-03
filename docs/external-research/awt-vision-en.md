# AnyWhere Terminal – Project Description & Vision (English)

## 1. Project description

**AnyWhere Terminal** is a VS Code extension that lets you open multiple real terminals (bash, zsh, fish, PowerShell, cmd, etc.) and dock them directly into different VS Code UI regions:
- Primary Sidebar (Activity Bar containers).
- Panel (bottom region).
- Secondary Sidebar (Auxiliary Bar) via the standard “Move View” action.[web:13][web:10]

Unlike simply moving the default Integrated Terminal around, AnyWhere Terminal provides **independent terminal views** built with:
- `WebviewViewProvider` to create custom views.
- `xterm.js` to render the terminal UI inside webviews.[web:8]
- `node-pty` to spawn real shells on the extension host, fully supporting TUIs, signals, control sequences, etc.[web:21][web:58]

Users can open multiple terminal instances at the same time, with each instance attached to a different view/location, resulting in a much more flexible layout than the traditional single terminal panel.[web:13]

---

## 2. Pain points & current problems

### 2.1 Limitations of the current Integrated Terminal

1. **Layout tied to the Panel**
   - Although VS Code allows dragging the Integrated Terminal up or to the sides, it still shares UI real estate with other panel views (Output, Problems, Debug Console) and is not a fully independent view whose behavior/UI you can customize as freely as a Webview View.[web:28][web:35]
   - Many developers want a terminal that is “always there” in the Sidebar, independent from the Panel, which may be used for debugging or logs.

2. **No true terminals in Sidebar/Secondary Sidebar**
   - There is no API to mount the existing Integrated Terminal directly into the Sidebar or Secondary Sidebar as a full view; you can only contribute tree/list/webview views there.[web:13]
   - As a result, current extensions either:
     - Just show/hide the terminal panel via commands, or
     - Render a fake “terminal-like” UI without a real PTY behind it.

3. **No clear multi-location terminal model**
   - Developers working with multiple contexts (projects, containers, remote hosts) often open many terminals in the same panel, splitting it into tabs and panes, which leads to:
     - Harder context switching (many tabs/splits in a cramped area).
     - No way to “pin” a critical terminal (e.g. dev server logs) in the Sidebar while using the Panel for debug logs or tests.

AnyWhere Terminal addresses these problems by bringing a **real terminal** into Sidebar/Panel via webview + node-pty.

---

## 3. Product vision

### 3.1 Goals

The vision for AnyWhere Terminal is to:
- Become a **“terminal layout engine”** for VS Code – enabling users to arrange terminals around their workflow instead of being constrained by the default panel.
- Bring the in‑editor terminal experience **close to or beyond** traditional window‑manager/tiling‑terminal setups (Tmux, iTerm panes, Kitty layouts) while retaining the benefits of VS Code.

Key pillars:
- **Anywhere**: each terminal is an independent view that can live in the Sidebar, Panel, or Secondary Sidebar (via move), and in the future in other containers VS Code may support.[web:13][web:10]
- **Real**: underneath is always a real shell running in a PTY via node-pty, not a toy simulation; all TUIs like vim, htop, fzf, IPython, etc. work normally.[web:21][web:58]
- **Configurable**: users can define profiles, default shells, themes, keybindings, and behaviors per terminal.
- **Persistent**: sessions can be restored when reopening a workspace, reducing friction during context switches.

### 3.2 Target users

- **Backend / DevOps / Infra engineers**:
  - Frequently run long‑lived commands (servers, Docker, kubectl, logs) and need a terminal that is always visible in the Sidebar while the Panel is reserved for debugging or other outputs.
- **Frontend / Fullstack developers**:
  - Run dev servers, build watchers, and test runners simultaneously; want each to have its own terminal that is easy to monitor next to the project tree or other panels.
- **Remote / cloud developers**:
  - Work with SSH, containers, and remote hosts; may use a Sidebar terminal for the primary host and Panel terminals for secondary hosts/tools.

---

## 4. How AnyWhere Terminal solves the pain

### 4.1 Multi-location terminal views

Solution:
- Define multiple view containers and views:
  - Activity Bar container (Primary Sidebar): `anywhereTerminal`.
  - Panel container: `anywhereTerminalPanel`.
- Each view is a webview running xterm.js, connected to its own node-pty instance.[web:13][web:20]

Benefits:
- Developers can:
  - Keep a “primary terminal” fixed in the Sidebar for the main workspace.
  - Use the Panel for secondary terminals or debug TTYs.
  - Move one of the views to the Secondary Sidebar to create a 3‑column layout with a terminal on the right.[web:13][web:10]

### 4.2 Real terminal experience inside a webview

Solution:
- Use xterm.js as the UI and node-pty as the PTY backend, similar to serious web/Electron terminal apps.[web:8][web:21][web:58]
- Bridge I/O via `postMessage` (webview ↔ extension host) with sane buffering to keep updates smooth.

Benefits:
- All TUI‑based workflows (vim, htop, lazygit, fzf, ipython, nvim‑tree, ranger, etc.) run in AnyWhere Terminal just like in the standard Integrated Terminal.
- Users do not trade away terminal capabilities to get layout flexibility.

### 4.3 Theming & “native” VS Code look‑and‑feel

Solution:
- Use VS Code’s theme CSS variables in the webview (`--vscode-terminal-background`, `--vscode-terminal-foreground`, `--vscode-editor-font-family`, etc.).[web:42][web:53][web:54]
- Listen for theme changes and update xterm.js colors accordingly.

Benefits:
- AnyWhere Terminal looks like a natural part of VS Code, not an embedded foreign widget with mismatched fonts and colors.
- When users change themes (Dark+/Light+/One Dark Pro, etc.), the sidebar/panel terminals update along with the rest of the UI.

### 4.4 Upgrading workflows with multi-session & persistence

Solution (per roadmap):
- Each view can host multiple sessions (tabs/dropdown), managed by the extension host.
- Store session metadata in `workspaceState` so sessions can be restored when reopening VS Code.[web:20]
- Integrate shell/profile configuration, default working directories, and pre‑launch scripts.

Benefits:
- Users can define “workspace profiles”, e.g.:
  - Left Sidebar: Terminal A running `npm run dev`.
  - Bottom Panel: Terminal B running tests `npm test --watch`.
  - Right (Secondary Sidebar): Terminal C tailing logs (Docker, services, remote host, etc.).
- When reopening the project, the layout and terminal sessions can be restored to nearly the same state.

---

## 5. Long-term roadmap directions

Beyond the core features in the phased implementation plan, long‑term directions include:

1. **Profiles & templates**
   - Define per‑workspace profiles: a list of terminals (location, shell, command, cwd) and launch them all with a single command.

2. **Task integration**
   - Map VS Code tasks (`tasks.json`) to specific terminal views.
   - Allow pinning task output to a particular Sidebar terminal.

3. **Remote & container awareness**
   - Deep integration with Remote SSH, Dev Containers, and WSL so terminals always spawn in the currently active environment.[web:22]

4. **Observability & productivity**
   - Mini status lines for each terminal (exit code, last command duration, etc.).
   - Command history suggestions, and potential AI integration (e.g. detect error patterns, inspired by features mentioned in Secondary Terminal documentation).[web:23][web:37]

5. **Ecosystem friendliness**
   - (Later) expose APIs so other extensions can request opening a terminal in a specific location with a given command/cwd.

---

## 6. Value summary

AnyWhere Terminal is not just a “terminal in the sidebar” toy; it is a **terminal organization tool** for VS Code:
- It removes layout constraints of the default Integrated Terminal.[web:28][web:35]
- It brings a full‑power PTY terminal into all main UI regions (Sidebar, Panel, and Secondary Sidebar via move).[web:13][web:10]
- It unlocks personalized terminal workflows that reduce context switching and boost day‑to‑day development productivity.
