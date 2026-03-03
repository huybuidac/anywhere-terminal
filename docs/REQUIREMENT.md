# AnyWhere Terminal - Requirements Specification

## 1. Product Overview

**AnyWhere Terminal** is a VS Code extension that allows users to create fully functional, independent terminal instances and place them in **any** VS Code UI surface: Primary Sidebar, Secondary Sidebar, Bottom Panel, and Editor area. Unlike the built-in Integrated Terminal (which is confined to the Panel/Editor), AnyWhere Terminal uses custom WebView-based terminal views powered by xterm.js + node-pty to deliver a real PTY terminal experience anywhere in the IDE.

### 1.1 Target Platform (MVP)

- **macOS** (Intel & Apple Silicon) - primary and only supported platform for MVP
- VS Code version >= 1.109.0
- Future: Windows, Linux

### 1.2 Target Users

- Backend / DevOps / Infra engineers who need multiple terminals visible simultaneously
- Fullstack developers running dev servers, tests, and logs in parallel
- Power users who want terminal layout flexibility beyond the default panel

---

## 2. Functional Requirements

### 2.1 Core: Terminal Anywhere (MVP - P0)

| ID | Requirement | Priority |
|----|------------|----------|
| FR-01 | Create a real terminal (PTY-backed) in the **Primary Sidebar** | P0 |
| FR-02 | Create a real terminal in the **Bottom Panel** | P0 |
| FR-03 | Create a real terminal in the **Editor area** (as an editor tab) | P0 |
| FR-04 | Create a real terminal in the **Secondary Sidebar** (via "Move View" or proposed API) | P1 |
| FR-05 | Each terminal instance is independent - has its own shell process | P0 |
| FR-06 | Terminal supports the user's default shell (zsh, bash, fish on macOS) | P0 |
| FR-07 | Terminal correctly renders ANSI escape sequences, colors, and TUI programs (vim, htop, fzf, lazygit) | P0 |
| FR-08 | Terminal supports copy/paste (Cmd+C/Cmd+V on macOS) | P0 |
| FR-09 | Terminal auto-resizes when the containing panel/sidebar is resized | P0 |
| FR-09a | Terminal link detection: clickable URLs via `@xterm/addon-web-links` | P0 |
| FR-09b | Terminal colors match active VS Code theme at first render (basic CSS variable reading) | P0 |

### 2.2 Multiple Tabs / Sessions (P1)

| ID | Requirement | Priority |
|----|------------|----------|
| FR-10 | Support multiple terminal tabs within a single view (sidebar/panel) | P1 |
| FR-11 | Tab bar showing terminal names with active tab indicator | P1 |
| FR-12 | Create new terminal tab via "+" button or command | P1 |
| FR-13 | Close terminal tab via "x" button or command | P1 |
| FR-14 | Switch between tabs via click or keyboard shortcut (Ctrl+Tab) | P1 |
| FR-15 | Maximum of 10 terminal tabs per view | P1 |
| FR-16 | Tab naming: auto-name "Terminal 1", "Terminal 2", etc. with number recycling | P1 |

### 2.3 Keyboard Shortcuts & Input (P0-P1)

| ID | Requirement | Priority |
|----|------------|----------|
| FR-17 | Standard macOS shortcuts: Cmd+C (copy when selection exists, SIGINT otherwise), Cmd+V (paste) | P0 |
| FR-18 | Cmd+K to clear terminal | P1 |
| FR-19 | Ctrl+C sends SIGINT to running process | P0 |
| FR-20 | Arrow keys, Tab completion, Ctrl+A/E/D/W work correctly in shell | P0 |
| FR-21 | IME input support (CJK characters) | P2 |
| FR-22 | VS Code keybindings passthrough: shortcuts not consumed by terminal should propagate to VS Code | P1 |
| FR-23 | Configurable keybindings for terminal-specific actions | P2 |

### 2.4 Theming & Visual (P1)

| ID | Requirement | Priority |
|----|------------|----------|
| FR-24 | Terminal colors match the active VS Code theme (dark/light/high-contrast) | P1 |
| FR-25 | Terminal font matches VS Code terminal font settings | P1 |
| FR-26 | Real-time theme update when user switches VS Code color theme | P1 |
| FR-27 | Cursor blink support (configurable) | P2 |
| FR-28 | Scrollback buffer (default 10,000 lines, configurable) | P1 |

### 2.5 Lifecycle & Persistence (P2)

| ID | Requirement | Priority |
|----|------------|----------|
| FR-29 | Terminal shell process survives view collapse/hide (PTY remains alive) | P1 |
| FR-30 | Terminal output history restored when collapsed view is re-expanded | P1 |
| FR-31 | Session metadata persistence across VS Code restart (shell, cwd, tab names) | P2 |
| FR-32 | Optional scrollback buffer persistence via xterm-addon-serialize | P3 |
| FR-33 | Graceful cleanup: kill PTY processes on extension deactivation | P0 |

### 2.6 Configuration (P1-P2)

| ID | Requirement | Priority |
|----|------------|----------|
| FR-34 | `anywhereTerminal.shell.macOS` - default shell path | P1 |
| FR-35 | `anywhereTerminal.shell.args` - shell arguments | P1 |
| FR-36 | `anywhereTerminal.scrollback` - scrollback lines (default 10000) | P2 |
| FR-37 | `anywhereTerminal.fontSize` - terminal font size | P2 |
| FR-38 | `anywhereTerminal.cursorBlink` - enable/disable cursor blink | P2 |
| FR-39 | `anywhereTerminal.defaultCwd` - default working directory | P2 |

### 2.7 Commands (P0-P1)

| ID | Requirement | Priority |
|----|------------|----------|
| FR-40 | `anywhereTerminal.newTerminal` - create new terminal in active view | P0 |
| FR-41 | `anywhereTerminal.newTerminalInEditor` - open terminal as editor tab | P1 |
| FR-42 | `anywhereTerminal.killTerminal` - kill active terminal | P1 |
| FR-43 | `anywhereTerminal.clearTerminal` - clear terminal output | P1 |
| FR-44 | `anywhereTerminal.focusSidebar` - focus the sidebar terminal | P1 |
| FR-45 | `anywhereTerminal.focusPanel` - focus the panel terminal | P1 |

---

## 3. Non-Functional Requirements

### 3.1 Performance

| ID | Requirement | Target |
|----|------------|--------|
| NFR-01 | Terminal input latency (keypress → echo) | < 50ms (realistic round-trip through postMessage IPC; < 16ms is only achievable within a single process) |
| NFR-02 | Output rendering for burst data (e.g., `cat large_file`) | No UI freeze, smooth scrolling |
| NFR-03 | Extension activation time | < 500ms |
| NFR-04 | Memory per terminal instance | < 50MB (including scrollback) |
| NFR-05 | IPC bridge: batched output at 8ms intervals | Mandatory — balances latency vs. throughput (VS Code uses 5ms, reference uses 16ms) |
| NFR-05a | Flow control / backpressure: pause PTY when webview cannot consume output fast enough | Mandatory — prevents memory exhaustion on heavy output (e.g., `find /`). High watermark 100K chars → pause PTY, low watermark 5K → resume. Webview sends `ack` messages after processing batches (5K batch size). |

### 3.2 Reliability

| ID | Requirement |
|----|------------|
| NFR-06 | Extension must not crash VS Code Extension Host |
| NFR-07 | PTY process crash should be isolated - other terminals unaffected |
| NFR-08 | No event listener leaks on view open/close cycles |
| NFR-09 | Clean shutdown: all PTY processes killed on extension deactivation |

### 3.3 Compatibility

| ID | Requirement |
|----|------------|
| NFR-10 | macOS Intel (x64) and Apple Silicon (arm64) support |
| NFR-11 | VS Code >= 1.109.0 |
| NFR-12 | Works with Remote SSH, Dev Containers (future) |

### 3.4 Security

| ID | Requirement |
|----|------------|
| NFR-13 | WebView CSP (Content Security Policy) with nonce-based script security |
| NFR-14 | `localResourceRoots` restricted to extension's media directory |
| NFR-15 | No arbitrary code execution from WebView context |

---

## 4. Out of Scope (MVP)

The following features are explicitly out of scope for the initial release:

- Windows and Linux support
- Split terminal panes within a single view
- Terminal profiles and workspace templates
- Task integration (mapping `tasks.json` to terminal views)
- Remote / container awareness
- AI integration (error detection, command suggestions)
- Extension API for other extensions to request terminals
- Drag-and-drop terminal views between locations
- Search within terminal output

---

## 5. Success Criteria

### MVP (Phase 1)
- A user can open VS Code, click the AnyWhere Terminal icon in the Activity Bar, and get a fully working terminal in the Primary Sidebar
- The terminal correctly runs shell commands, displays output, handles resize
- Copy/paste works with Cmd+C/Cmd+V
- Terminal colors match the active VS Code theme (basic CSS variable mapping)
- URLs in terminal output are clickable
- Heavy output (e.g., `find /`) does not crash the extension (flow control active)

### Phase 2
- Terminals work in all 3+ locations simultaneously (Sidebar, Panel, Editor)
- Multiple tabs per view

### Phase 3
- Session persistence
- Configuration settings
- Polish and publish to Marketplace

---

## 6. Constraints & Assumptions

### 6.1 VS Code API Constraints

1. **Secondary Sidebar**: As of VS Code 1.104 (Aug 2025), `viewsContainers.secondarySidebar` is still a **proposed API** (`contribSecondarySideBar`). Until finalized, users must use "Move View" to place views in the Secondary Sidebar. Our extension targets VS Code >= 1.109.0 which may have this finalized.

2. **WebviewViewProvider**: Can only be registered for views in `activitybar` and `panel` view containers. Views can be dragged to other locations by the user.

3. **WebviewPanel**: Used for editor-area terminals. These are full webview panels that open as editor tabs.

4. **retainContextWhenHidden**: Setting this to `true` prevents webview DOM destruction when hidden, but uses more memory. Required for terminal views to maintain state.

### 6.2 Technical Constraints

1. **node-pty**: Must use VS Code's built-in node-pty (from `node_modules.asar`) for MVP to avoid native module compilation complexity.

2. **postMessage IPC**: The only communication channel between WebView and Extension Host. Must implement buffering to avoid event loop saturation.

3. **Webview isolation**: WebViews are sandboxed iframes. No direct filesystem or Node.js API access from the WebView context.

### 6.3 Assumptions

- Users have a working shell configured on their macOS system (zsh is the default since macOS Catalina)
- VS Code is running on the local machine (not in a remote context for MVP)
- Extension runs in the Extension Host process (not Web Extension Host)

---

## 7. Competitive Analysis

| Extension | Sidebar | Panel | Secondary | Editor | Multi-tab | Real PTY |
|-----------|---------|-------|-----------|--------|-----------|----------|
| **VS Code Built-in** | No | Yes | No | Yes | Yes | Yes |
| **Sidebar Terminal (agus)** | Launcher only | Delegates | No | No | No | No (uses native) |
| **Secondary Terminal** | Yes | No | Yes | No | Yes | Yes |
| **AnyWhere Terminal** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |

Our key differentiator: **true "anywhere" placement** including Editor area, with independent PTY-backed terminals in all locations simultaneously.
