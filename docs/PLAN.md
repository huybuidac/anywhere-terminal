# AnyWhere Terminal - Implementation Plan

## Overview

This plan is organized into 4 phases, progressing from a minimal working terminal to a fully polished, publishable extension. Each phase has clear goals, detailed tasks, estimated effort, and acceptance criteria.

**Total estimated effort**: ~6-8 weeks for a single developer

---

## Phase 1 - MVP: Single Terminal in Sidebar (Week 1-2)

### Goal
Create a **single, fully functional terminal** in the Primary Sidebar using xterm.js + node-pty. This is the most critical milestone - proving the core architecture works end-to-end.

### Tasks

#### 1.1 Project Scaffolding (~2h)
- [x] Extension already scaffolded with `yo code` (TypeScript + esbuild)
- [x] Add runtime dependencies: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`
- [x] Configure esbuild to:
  - Bundle extension host code (Node.js target)
  - Bundle webview code separately (browser target)
  - Externalize `vscode` and `node-pty`
- [x] Set up `media/` directory for webview assets
- [x] Configure `.vscodeignore` for clean packaging

#### 1.2 Define View Container & View (~1h)
- [x] Add `viewsContainers.activitybar` entry in `package.json`:
  - id: `anywhereTerminal`
  - title: "AnyWhere Terminal"
  - icon: terminal icon (SVG or product icon `$(terminal)`)
- [x] Add `views.anywhereTerminal` entry:
  - id: `anywhereTerminal.sidebar`
  - name: "Terminal"
  - type: `webview`
- [x] Register activation event: `onView:anywhereTerminal.sidebar`

#### 1.3 Implement WebviewViewProvider (~4h)
- [x] Create `src/providers/TerminalViewProvider.ts`
  - Implements `vscode.WebviewViewProvider`
  - `resolveWebviewView()`:
    - Set `enableScripts: true`
    - Set `retainContextWhenHidden: true`
    - Set `localResourceRoots` to extension's media directory
    - Generate and set HTML content
- [x] Create `getHtmlForWebview()` function:
  - CSP with nonce-based script security
  - Load xterm.css
  - Load bundled webview.js
  - Include `<div id="terminal-container">` mount point
- [x] Register provider in `extension.ts`:
  ```typescript
  vscode.window.registerWebviewViewProvider(
    'anywhereTerminal.sidebar',
    provider,
    { webviewOptions: { retainContextWhenHidden: true } }
  );
  ```

#### 1.4 Implement node-pty Integration (~3h)
- [x] Create `src/pty/ptyManager.ts`:
  - Dynamic require to load VS Code's built-in node-pty:
    ```typescript
    const modulePath = path.join(vscode.env.appRoot, 'node_modules.asar', 'node-pty');
    ```
  - Handle webpack/esbuild require: `__non_webpack_require__` pattern
- [x] Create `src/pty/ptySession.ts`:
  - `PtySession` class wrapping a single PTY process
  - `spawn(shell, args, options)` - create PTY with cols/rows/cwd/env
  - `write(data)` - forward input to PTY
  - `resize(cols, rows)` - resize PTY
  - `kill()` - terminate PTY process
  - Events: `onData`, `onExit`
- [x] Shell detection for macOS:
  - Use `process.env.SHELL` (defaults to `/bin/zsh` on macOS Catalina+)
  - Fallback chain: `$SHELL` → `/bin/zsh` → `/bin/bash`

#### 1.5 Implement Webview Terminal (xterm.js) (~4h)
- [x] Create `src/webview/main.ts` (bundled separately for browser):
  - Initialize xterm.js `Terminal` instance
  - Load `FitAddon` and `WebLinksAddon` (always loaded — trivial, high UX value)
  - Open terminal in `#terminal-container`
  - Wire up `acquireVsCodeApi()` for messaging
- [x] Input handling:
  - `terminal.onData(data)` → `vscode.postMessage({ type: 'input', data })`
- [x] Output handling:
  - `window.addEventListener('message', ...)` → on `type: 'output'` → `terminal.write(data)`
- [x] Resize handling:
  - `ResizeObserver` on container → `fitAddon.fit()` → send `{ type: 'resize', cols, rows }`
  - Debounce resize events at ~100ms

#### 1.6 Implement IPC Messaging (~3h)
- [x] Wire messaging directly in `TerminalViewProvider` (no separate MessageBridge abstraction — per design, messages route through the ViewProvider):
  - Extension → WebView: `webviewView.webview.postMessage(msg)`
  - WebView → Extension: `webviewView.webview.onDidReceiveMessage(handler)`
- [x] Message protocol (Phase 1):
  ```typescript
  // WebView → Extension
  { type: 'ready' }
  { type: 'input', data: string }
  { type: 'resize', cols: number, rows: number }
  { type: 'ack', bytes: number }         // flow control acknowledgment

  // Extension → WebView
  { type: 'output', data: string }
  { type: 'exit', code: number }
  ```
- [x] Output buffering on extension side:
  - Collect PTY output chunks into a buffer string
  - Flush every ~8ms via `setInterval` (compromise between VS Code's 5ms and reference's 16ms)
  - Immediate flush if buffer exceeds threshold (e.g., 64KB)
- [x] Flow control (backpressure):
  - Track unacknowledged bytes sent to webview
  - When unacked exceeds high watermark (100K chars) → `ptyProcess.pause()`
  - Webview sends `ack` message after writing each batch (5K batch size)
  - When unacked drops below low watermark (5K chars) → `ptyProcess.resume()`

#### 1.6a Basic Theme Integration (~1h)
- [x] Read VS Code CSS variables in webview on startup:
  - `--vscode-terminal-background`, `--vscode-terminal-foreground`
  - `--vscode-terminalCursor-foreground`, `--vscode-terminal-selectionBackground`
  - All 16 ANSI color variables (`--vscode-terminal-ansiBlack` through `--vscode-terminal-ansiBrightWhite`)
- [x] Apply as xterm.js `terminal.options.theme` on init
- [x] Monitor theme changes via `MutationObserver` on `<body>` class changes → re-read and re-apply

#### 1.7 Basic Clipboard (macOS) (~2h)
- [x] Implement `attachCustomKeyEventHandler` on xterm.js:
  - Detect `Cmd+C`:
    - If selection exists → `navigator.clipboard.writeText(term.getSelection())`, return `false`
    - If no selection → return `true` (let xterm send SIGINT `\x03`)
  - Detect `Cmd+V`:
    - Read from clipboard → `term.paste(text)`, return `false`
- [x] Ensure `Ctrl+C` always sends SIGINT (standard terminal behavior)

#### 1.8 Manual Testing (~2h)
- [x] Run with F5, open AnyWhere Terminal in Activity Bar
- [x] Verify:
  - [x] Shell prompt appears (zsh/bash)
  - [x] Commands execute: `ls`, `pwd`, `git status`, `node -v`
  - [x] Output renders correctly (colors, formatting)
  - [x] Resize works when dragging sidebar width
  - [x] Cmd+C copies selected text
  - [x] Cmd+V pastes from clipboard
  - [x] Ctrl+C interrupts running process
  - [x] Terminal survives sidebar collapse/expand (if `retainContextWhenHidden`)
  - [x] Terminal theme matches current VS Code theme (dark/light)
  - [x] URLs in output are clickable
  - [x] Heavy output (`find / -name "*.js" 2>/dev/null`) does not crash (flow control)

### Phase 1 Acceptance Criteria
- [x] Terminal appears in Primary Sidebar with working shell
- [x] Commands execute and output displays correctly
- [x] Copy/paste works
- [x] Resize works
- [x] Terminal colors match active VS Code theme
- [x] URLs in terminal output are clickable
- [x] Heavy output does not crash or freeze the extension (flow control active)
- [x] No crashes or extension host hangs

---

## Phase 2 - Multi-Location & Multi-Tab (Week 3-4)

### Goal
Terminal works in **all locations** (Sidebar, Panel, Editor) with **multiple tab** support per view.

### Tasks

#### 2.1 Panel Terminal View (~2h)
- [x] Add `viewsContainers.panel` entry in `package.json`:
  - id: `anywhereTerminalPanel`
  - title: "AnyWhere Terminal"
- [x] Add `views.anywhereTerminalPanel` entry:
  - id: `anywhereTerminal.panel`
  - type: `webview`
- [x] Reuse `TerminalViewProvider` for panel view
- [x] Each view instance gets its own PTY session

#### 2.2 Editor Terminal (WebviewPanel) (~4h)
- [x] Create `src/providers/TerminalEditorProvider.ts`:
  - Use `vscode.window.createWebviewPanel()` to create editor-area terminal
  - Share the same webview HTML generation logic
  - Share the same IPC bridge pattern
- [x] Register command `anywhereTerminal.newTerminalInEditor`
- [x] Handle editor tab lifecycle (close → kill PTY)

#### 2.3 Session Manager (~4h)
- [x] Create `src/session/SessionManager.ts`:
  - Central registry: `Map<string, TerminalSession>`
  - `TerminalSession`: `{ id, pty, viewId, tabName, isActive, createdAt }`
  - `createSession(viewId, options?)` → spawn PTY, return sessionId
  - `destroySession(sessionId)` → kill PTY, clean up
  - `getSessionsForView(viewId)` → list sessions attached to a view
  - `switchActiveSession(viewId, sessionId)` → change data routing
- [x] Generate unique session IDs: `crypto.randomUUID()`
- [x] Terminal number recycling (1-10)

#### 2.4 Multi-Tab UI in WebView (~6h)
- [x] Create tab bar component in webview HTML/CSS:
  - Horizontal tab strip at top of terminal area
  - Each tab: name label + close (x) button
  - Active tab highlighted
  - "+" button to create new tab
- [x] Tab switching logic:
  - Only one xterm.js instance visible at a time per view
  - Use CSS `display: none/block` to switch (preserve scrollback)
  - OR: destroy/recreate xterm instances (simpler, loses local state)
- [x] Tab message protocol:
  ```typescript
  // WebView → Extension
  { type: 'createTab' }
  { type: 'switchTab', tabId: string }
  { type: 'closeTab', tabId: string }
  
  // Extension → WebView
  { type: 'tabCreated', tabId: string, name: string }
  { type: 'tabList', tabs: Array<{ id, name, isActive }> }
  { type: 'tabRemoved', tabId: string }
  ```
- [x] Input routing: include `tabId` in input/resize messages

#### 2.5 Secondary Sidebar Support (~2h)
- [x] Check if `contribSecondarySideBar` API is finalized in target VS Code version
  - If yes: add `viewsContainers.secondarySidebar` entry
  - If no: document "Move View" instructions for users
- [x] Register command `anywhereTerminal.moveToSecondary`:
  - Focus the sidebar view
  - Execute `workbench.action.moveView`

#### 2.6 Commands Registration (~2h)
- [x] Register all commands in `package.json`:
  - `anywhereTerminal.newTerminal` - create new tab in active view
  - `anywhereTerminal.newTerminalInEditor` - open editor terminal
  - `anywhereTerminal.killTerminal` - kill active tab
  - `anywhereTerminal.clearTerminal` - clear active terminal
  - `anywhereTerminal.focusSidebar` - focus sidebar terminal
  - `anywhereTerminal.focusPanel` - focus panel terminal
- [x] Add view/title menu buttons (icons in view toolbar):
  - New terminal (+ icon)
  - Kill terminal (trash icon)

#### 2.7 View Lifecycle Resilience (~3h)
- [x] PTY processes anchored to Extension Host lifecycle (not WebView)
- [x] Implement scrollback cache in SessionManager:
  - Buffer PTY output per session (configurable max size)
  - On webview `ready` message → flush cached output to webview
- [x] Handle WebView visibility changes:
  - `onDidChangeVisibility` → pause/resume output flushing
- [x] Handle WebView disposal → session cleanup

#### 2.8 Testing (~3h)
- [ ] Test simultaneous terminals in Sidebar + Panel
- [ ] Test editor terminal tabs
- [ ] Test multi-tab: create, switch, close, create again
- [ ] Test view collapse/expand with running processes
- [ ] Heavy output test: `find / -name "*.js" 2>/dev/null` in all locations

### Phase 2 Acceptance Criteria
- [ ] Terminals work independently in Sidebar, Panel, and Editor
- [ ] Multiple tabs per view with create/switch/close
- [ ] PTY survives view collapse/hide
- [ ] No resource leaks across view lifecycle

---

## Phase 3 - Polish: Theming, Settings, UX (Week 5-6)

### Goal
Make AnyWhere Terminal feel **native** to VS Code - matching themes, respecting settings, and providing a polished user experience.

### Tasks

#### 3.1 Advanced Theme Integration (~3h)
- [ ] _(Basic CSS variable reading + MutationObserver already done in Phase 1 task 1.6a)_
- [ ] Location-aware background: detect if terminal is in sidebar vs panel vs editor, adjust background accordingly
- [ ] Read font from VS Code variables:
  - `--vscode-editor-font-family`
  - `--vscode-editor-font-size`
- [ ] High-contrast theme support
- [ ] Test with multiple VS Code themes (Dark+, Light+, Monokai, Solarized, etc.)

#### 3.2 Extension Settings (~3h)
- [ ] Define `contributes.configuration` in `package.json`:
  ```json
  {
    "anywhereTerminal.shell.macOS": { "type": "string", "default": "" },
    "anywhereTerminal.shell.args": { "type": "array", "default": [] },
    "anywhereTerminal.scrollback": { "type": "number", "default": 10000 },
    "anywhereTerminal.fontSize": { "type": "number", "default": 0 },
    "anywhereTerminal.cursorBlink": { "type": "boolean", "default": true },
    "anywhereTerminal.defaultCwd": { "type": "string", "default": "" }
  }
  ```
- [ ] Read settings via `workspace.getConfiguration('anywhereTerminal')`
- [ ] Listen for setting changes: `workspace.onDidChangeConfiguration`
- [ ] Apply setting changes to active sessions

#### 3.3 Performance Optimization (~3h)
- [ ] _(Base 8ms buffering + flow control already done in Phase 1 task 1.6)_
- [ ] Evaluate adaptive output buffering:
  - Consider dynamic interval adjustment based on output throughput
  - Monitor and tune high/low watermark values based on real-world usage
- [ ] Consider WebGL renderer addon (`@xterm/addon-webgl`):
  - DOM renderer first → WebGL upgrade attempt → DOM fallback if WebGL fails
  - Static class variable remembers WebGL failure across instances
  - Evaluate if WebGL works in VS Code webview context
- [ ] Profile memory usage per terminal instance
- [ ] Add output buffer size limits with overflow handling

#### 3.4 Advanced Keyboard Handling (~3h)
- [ ] Implement comprehensive `attachCustomKeyEventHandler`:
  - Cmd+C: copy/SIGINT logic
  - Cmd+V: paste
  - Cmd+K: clear terminal
  - Cmd+A: select all (if supported)
  - Ctrl+Tab: switch terminal tab
  - Escape: deselect / pass to shell
- [ ] Ensure VS Code shortcuts not consumed by terminal propagate correctly
- [ ] Test with modifier keys on macOS (Cmd, Ctrl, Option, Shift)

#### 3.5 Context Menu (~2h)
- [ ] Implement right-click context menu in webview:
  - Copy
  - Paste
  - Select All
  - Clear Terminal
  - Separator
  - New Terminal
  - Kill Terminal

#### 3.6 Status & Feedback (~2h)
- [ ] Show terminal process name in tab title (e.g., "zsh", "node", "python")
- [ ] Show exit code when process exits: `[Process exited with code 0]`
- [ ] Visual indicator for active/running vs exited terminals

#### 3.7 Error Handling (~2h)
- [ ] Handle PTY spawn failure gracefully (show error in webview)
- [ ] Handle node-pty not found (VS Code version incompatibility)
- [ ] Handle shell not found (invalid shell path)
- [ ] Retry mechanism for transient failures

#### 3.8 Testing (~3h)
- [ ] Test with multiple VS Code themes (Dark+, Light+, Monokai, etc.)
- [ ] Test all keyboard shortcuts
- [ ] Test configuration changes in real-time
- [ ] Stress test with heavy output (npm install, docker build, tail -f)
- [ ] Test TUI programs: vim, htop, lazygit, fzf

### Phase 3 Acceptance Criteria
- [ ] Terminal seamlessly matches any VS Code theme
- [ ] All settings work and apply in real-time
- [ ] Keyboard shortcuts work correctly on macOS
- [ ] Performance is smooth even with heavy output
- [ ] Context menu works

---

## Phase 4 - Packaging & Release (Week 7-8)

### Goal
Package, test, and publish a production-quality extension to the VS Code Marketplace.

### Tasks

#### 4.1 Bundling & Packaging (~3h)
- [ ] Finalize esbuild configuration:
  - Extension bundle: `out/extension.js` (Node.js CJS)
  - Webview bundle: `media/webview.js` (browser IIFE)
- [ ] Ensure node-pty is correctly externalized
- [ ] Configure `.vscodeignore`:
  ```
  .vscode/**
  src/**
  node_modules/**
  !media/**
  !out/**
  ```
- [ ] Test `vsce package` produces valid `.vsix`
- [ ] Test install from `.vsix` on clean VS Code

#### 4.2 Platform-Specific Builds (macOS only for MVP) (~2h)
- [ ] Since we use VS Code's built-in node-pty, no platform builds needed initially
- [ ] If vendoring node-pty later:
  - `vsce package --target darwin-x64`
  - `vsce package --target darwin-arm64`

#### 4.3 README & Documentation (~3h)
- [ ] Write comprehensive README.md:
  - Features overview with screenshots/GIFs
  - Installation instructions
  - How to open terminal in each location
  - How to move view to Secondary Sidebar
  - Configuration reference
  - Known limitations
  - Keyboard shortcuts reference
- [ ] Create extension icon (128x128 PNG)
- [ ] Add CHANGELOG.md for first release

#### 4.4 Marketplace Metadata (~1h)
- [ ] Configure `package.json`:
  - `displayName`: "AnyWhere Terminal"
  - `description`: clear and searchable
  - `categories`: ["Other"]
  - `keywords`: ["terminal", "sidebar", "panel", "anywhere", "xterm"]
  - `repository`: GitHub URL
  - `icon`: path to icon
  - `galleryBanner`: colors

#### 4.5 CI/CD (GitHub Actions) (~3h)
- [ ] Create `.github/workflows/ci.yml`:
  - Trigger: push to main, pull requests
  - Steps: install, lint, type-check, build, package
- [ ] Create `.github/workflows/release.yml`:
  - Trigger: tag `v*`
  - Steps: build, `vsce package`, create GitHub release with `.vsix` artifact
  - Optional: auto-publish to Marketplace via `VSCE_PAT`

#### 4.6 Final Testing (~3h)
- [ ] Install from `.vsix` on clean macOS (Intel)
- [ ] Install from `.vsix` on clean macOS (Apple Silicon)
- [ ] Test with VS Code Stable and VS Code Insiders
- [ ] Test workspace with special characters in path
- [ ] Test with multiple workspaces open
- [ ] Verify no errors in Extension Host output

### Phase 4 Acceptance Criteria
- [ ] Clean `.vsix` installs and works on macOS (both architectures)
- [ ] README is clear and complete with visuals
- [ ] CI/CD pipeline passes
- [ ] Extension published to Marketplace (or ready to publish)

---

## Phase 5 - Split View (Terminal Pane Splitting)

### Goal
Allow users to **split terminal panes** horizontally and vertically within each view (sidebar, panel, editor). Each split pane contains its own terminal session. Panes can be recursively split and resized via drag handles, similar to VS Code's editor split functionality.

### Tasks

#### 5.1 Split Layout Data Model (~3h)
- [x] Design a tree-based layout model (binary split tree):
  - `SplitNode`: either a `LeafNode` (contains terminal sessionId) or `BranchNode` (contains direction + two children)
  - `BranchNode`: `{ direction: 'horizontal' | 'vertical', children: [SplitNode, SplitNode], ratio: number }`
  - `LeafNode`: `{ sessionId: string }`
- [x] Store layout tree per view in webview state
- [x] Serialize/deserialize layout for state persistence

#### 5.2 Split Container UI (~5h)
- [x] Create `SplitContainer` component that renders the split tree recursively
- [x] Each leaf renders a terminal (xterm.js instance) in its own container div
- [x] Branch nodes render two children separated by a resize handle (divider)
- [x] CSS: use flexbox or CSS grid for split layout
  - Horizontal split: children stacked top-to-bottom
  - Vertical split: children side-by-side left-to-right
- [x] Each terminal container must support `FitAddon` independently

#### 5.3 Resize Handles (Drag to Resize) (~4h)
- [x] Implement drag handles between split panes
- [x] On mousedown → track mousemove → update split ratio → on mouseup stop
- [x] Minimum pane size constraint (e.g., 80px) to prevent collapsing
- [x] Cursor changes on hover (col-resize / row-resize)
- [x] Re-fit all affected terminals after resize

#### 5.4 Split Actions & Commands (~3h)
- [x] Add commands:
  - `anywhereTerminal.splitHorizontal` — split active terminal horizontally
  - `anywhereTerminal.splitVertical` — split active terminal vertically
  - `anywhereTerminal.closeSplitPane` — close active pane (unsplit)
- [x] Add split buttons to tab bar or terminal toolbar (split-horizontal icon, split-vertical icon)
- [x] Context menu entries for split actions
- [x] Keyboard shortcuts (e.g., Cmd+\ for vertical split, Cmd+Shift+\ for horizontal)

#### 5.5 Focus Management (~2h)
- [x] Track which pane is "active" (focused)
- [x] Visual indicator for active pane (border highlight or subtle background change)
- [x] Click on a pane to focus it
- [x] Active pane receives keyboard input
- [x] Tab bar reflects the active pane's session

#### 5.6 Message Protocol Updates (~2h)
- [ ] Update resize messages to include sessionId (each pane resizes independently)
- [ ] Route input to the focused pane's session
- [ ] Handle output routing to correct pane container
- [ ] New messages:
  - `{ type: 'splitTerminal', direction: 'horizontal' | 'vertical', sessionId: string }`
  - `{ type: 'closeSplitPane', sessionId: string }`

#### 5.7 Integration & Edge Cases (~3h)
- [ ] When a pane is closed, restructure the tree (promote sibling to parent's position)
- [ ] When the last pane is closed, handle gracefully (create new default terminal or close view)
- [ ] Resize all terminals when the overall view resizes (sidebar width change, etc.)
- [ ] Persist split layout across webview hide/show cycles
- [ ] Test recursive splitting: split → split again → split again → close inner panes

### Phase 5 Acceptance Criteria
- [ ] Can split any terminal pane horizontally or vertically
- [ ] Can recursively split (split a split)
- [ ] Drag handles resize panes smoothly
- [ ] Each pane has its own independent terminal session
- [ ] Focus management works correctly
- [ ] Closing a pane restructures layout properly
- [ ] Layout survives view hide/show cycles

---

## Risk Register

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| VS Code changes internal node-pty path | Extension breaks | Medium | Detect path dynamically, add fallback paths, consider vendoring |
| WebGL renderer doesn't work in webview | Reduced performance | Low | Fallback to DOM/Canvas renderer |
| postMessage IPC too slow for heavy output | UI lag | Low | Aggressive buffering, adaptive intervals |
| `contribSecondarySideBar` API changes | Cannot register secondary sidebar directly | Medium | "Move View" workaround always works |
| Keyboard shortcut conflicts with VS Code | UX friction | Medium | Use `when` clause contexts, test thoroughly |
| Memory leaks from xterm.js instances | Extension instability | Medium | Proper disposal, testing with profiler |
| Flow control watermarks miscalibrated | PTY stalls or memory exhaustion | Medium | Tune watermarks (100K/5K) empirically, add monitoring metrics |

---

## Dependency Summary

### Runtime Dependencies
| Package | Purpose | Bundle Target |
|---------|---------|---------------|
| `@xterm/xterm` | Terminal emulator UI | Webview |
| `@xterm/addon-fit` | Auto-resize terminal | Webview |
| `@xterm/addon-web-links` | Clickable URLs in terminal output | Webview |
| `@xterm/addon-webgl` | GPU-accelerated rendering (Phase 3) | Webview |
| `node-pty` | PTY process spawning | Extension (external - from VS Code) |

### Dev Dependencies
| Package | Purpose |
|---------|---------|
| `esbuild` | Bundler |
| `typescript` | Language |
| `@types/vscode` | VS Code API types |
| `@types/node` | Node.js types |
| `@vscode/vsce` | Extension packaging |
| `eslint` | Linting |
