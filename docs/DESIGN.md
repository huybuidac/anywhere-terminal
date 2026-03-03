# AnyWhere Terminal - System Design

## 1. Architecture Overview

AnyWhere Terminal follows a **3-layer architecture** with strict separation between the VS Code Extension Host (backend), the IPC Bridge (transport), and the WebView (frontend).

```mermaid
graph TB
    subgraph VSCode["VS Code Window"]
        subgraph Surfaces["UI Surfaces"]
            subgraph PS["Primary Sidebar"]
                WV1["WebviewViewProvider<br/>(xterm.js)"]
            end
            subgraph EA["Editor Area"]
                WV2["WebviewPanel<br/>(xterm.js)"]
            end
            subgraph SS["Secondary Sidebar"]
                WV3["WebviewViewProvider<br/>(xterm.js)"]
            end
            subgraph BP["Bottom Panel"]
                WV4["WebviewViewProvider<br/>(xterm.js)"]
            end
        end

        IPC["postMessage IPC Bridge"]

        subgraph EH["Extension Host (Node.js)"]
            SM["SessionManager"]
            subgraph Sessions["PTY Sessions"]
                S1["Session 1<br/>(PTY)"]
                S2["Session 2<br/>(PTY)"]
                S3["Session 3<br/>(PTY)"]
            end
            subgraph Shells["OS Shell Processes"]
                SH1["/bin/zsh"]
                SH2["/bin/bash"]
                SH3["/bin/zsh"]
            end
        end
    end

    WV1 <--> IPC
    WV2 <--> IPC
    WV3 <--> IPC
    WV4 <--> IPC
    IPC <--> SM
    SM --> S1
    SM --> S2
    SM --> S3
    S1 --- SH1
    S2 --- SH2
    S3 --- SH3
```

---

## 2. Component Design

### 2.1 Component Diagram

```mermaid
graph TB
    subgraph ExtHost["Extension Host (Node.js)"]
        EXT["extension.ts<br/>(activate)"]
        
        EXT --> TVP["TerminalViewProvider<br/>- resolveView()<br/>- handleMessage()<br/>- sendMessage()"]
        EXT --> TEP["TerminalEditorProvider<br/>- createPanel()<br/>- handleMessage()<br/>- sendMessage()"]
        EXT --> SM["SessionManager<br/>- sessions: Map‹id, Session›<br/>- createSession(viewId, opts)<br/>- destroySession(id)<br/>- getSessionsForView(viewId)<br/>- switchActiveSession(viewId, id)"]
        
        SM --> PS["PtySession<br/>- id: string<br/>- pty: IPty<br/>- outputBuffer<br/>- scrollbackCache<br/>- spawn() / write(data)<br/>- resize(c,r) / kill()<br/>- flush()"]
        
        SM --> PM["PtyManager<br/>- loadNodePty()<br/>- spawnShell()<br/>- detectShell()"]
        
        EXT --> CM["ConfigManager<br/>- getConfig()<br/>- onChange()"]
    end

    subgraph WebView["WebView (Browser Sandbox)"]
        TM["TerminalManager<br/>- terminals[]<br/>- activeId<br/>- createTerminal<br/>- switchTerminal<br/>- destroyTerm"]
        TAB["TabManager<br/>- tabs[]<br/>- activeTabId<br/>- createTab() / switchTab()<br/>- closeTab() / renderTabs()"]
        IH["InputHandler<br/>- keyHandler()<br/>- clipboard()<br/>- imeHandling()"]
        THM["ThemeManager<br/>- readCssVars()<br/>- applyTheme()<br/>- watchChanges()"]
        RH["ResizeHandler<br/>- fitAddon<br/>- observer<br/>- debounce()"]
        MH["MessageHandler<br/>- send() / receive()<br/>- queue[]"]
        
        TM --> IH
        TM --> TAB
        TM --> RH
        TM --> MH
    end

    TVP <-.->|postMessage| MH
    TEP <-.->|postMessage| MH
```

### 2.2 File Structure

```
src/
├── extension.ts                    # Entry point, activate/deactivate
├── providers/
│   ├── TerminalViewProvider.ts     # WebviewViewProvider for sidebar/panel
│   └── TerminalEditorProvider.ts   # WebviewPanel for editor area
├── session/
│   ├── SessionManager.ts          # Central session registry
│   └── PtySession.ts              # Single PTY session wrapper
├── pty/
│   └── PtyManager.ts              # node-pty loader and shell detection
├── config/
│   └── ConfigManager.ts           # Settings reader
├── types/
│   └── messages.ts                # Shared message type definitions
└── webview/
    ├── main.ts                    # Webview entry point
    ├── terminal/
    │   ├── TerminalManager.ts     # xterm.js instance management
    │   └── InputHandler.ts        # Keyboard/clipboard handling
    ├── ui/
    │   ├── TabManager.ts          # Tab bar UI
    │   └── ThemeManager.ts        # Theme integration
    └── utils/
        ├── ResizeHandler.ts       # FitAddon + debounced resize
        └── MessageHandler.ts      # postMessage wrapper
media/
├── webview.js                     # Bundled webview code
├── webview.css                    # Additional styles (if needed)
└── icon.svg                       # Extension icon
```

---

## 3. Data Flow & Sequence Diagrams

Detailed data flow diagrams are documented in separate files for maintainability:

| Flow | Document | Description |
|------|----------|-------------|
| Terminal Initialization | [flow-initialization.md](design/flow-initialization.md) | WebView creation → PTY spawn → first prompt |
| User Input Round-Trip | [flow-user-input.md](design/flow-user-input.md) | Keystroke → PTY → output with flow control |
| Clipboard (Copy/Paste) | [flow-clipboard.md](design/flow-clipboard.md) | Cmd+C/V handling, SIGINT vs copy |
| View Collapse/Expand | [flow-view-lifecycle.md](design/flow-view-lifecycle.md) | retainContextWhenHidden, scrollback cache |
| Multi-Tab Lifecycle | [flow-multi-tab.md](design/flow-multi-tab.md) | Create, switch, close tabs with operation queue |

---

## 4. Message Protocol

> Full specification: [design/message-protocol.md](design/message-protocol.md)

The extension and webview communicate via `postMessage` using discriminated union types. 8 message types flow from WebView → Extension (`ready`, `input`, `resize`, `createTab`, `switchTab`, `closeTab`, `clear`, `ack`) and 8 from Extension → WebView (`init`, `output`, `exit`, `tabCreated`, `tabRemoved`, `restore`, `configUpdate`, `error`).

---

## 5. Component Designs

Detailed component designs are documented in separate files:

| Component | Document | Description |
|-----------|----------|-------------|
| PtyManager | [design/pty-manager.md](design/pty-manager.md) | node-pty loading, shell detection, spawn config |
| SessionManager | [design/session-manager.md](design/session-manager.md) | Session lifecycle, operation queue, kill tracking |
| Output Buffering | [design/output-buffering.md](design/output-buffering.md) | Two-layer buffering, flow control (100K/5K watermarks) |
| xterm.js Integration | [design/xterm-integration.md](design/xterm-integration.md) | Terminal setup, addon loading, renderer selection |
| Theme Integration | [design/theme-integration.md](design/theme-integration.md) | CSS variable mapping, location-aware background |
| Resize Handling | [design/resize-handling.md](design/resize-handling.md) | Smart resize, debouncing, DPI-aware dimensions |
| Keyboard & Input | [design/keyboard-input.md](design/keyboard-input.md) | Custom key handler, clipboard, IME, bracketed paste |
| WebView Provider | [design/webview-provider.md](design/webview-provider.md) | WebviewViewProvider lifecycle, CSP, ready handshake |
| Error Handling | [design/error-handling.md](design/error-handling.md) | Error categories, fallback chains, user notifications |
| Build System | [design/build-system.md](design/build-system.md) | Dual-target esbuild, dependencies, packaging |

---

## 6. Build System

> Full specification: [design/build-system.md](design/build-system.md)

Dual-target esbuild configuration: Extension Host bundle (Node.js, CJS) and WebView bundle (Browser, IIFE). `node-pty` and `vscode` are externalized from the extension bundle. The webview bundle includes xterm.js and all addons as a self-contained IIFE.

---

## 7. Performance Design

### 7.1 Output Buffering Strategy

```mermaid
flowchart TD
    A["PTY Output Stream<br/>(pty.onData)"] --> B["Output Buffer (string)"]
    B --> C{Flush condition?}
    C -->|"Timer: every 8ms (~120fps)"| D["Flush to WebView"]
    C -->|"Size: buffer > 64KB"| D
    C -->|"Exit: pty.onExit"| D
    D --> E["webview.postMessage(<br/>{ type: 'output', data })"]
    E --> F["Reset buffer to ''"]
    F --> B
```

See [output-buffering.md](design/output-buffering.md) for the complete two-layer buffering and flow control design (100K high watermark / 5K low watermark).

### 7.2 Resize Debouncing

```mermaid
flowchart TD
    A["User drags sidebar edge"] -->|"many rapid resize events"| B["ResizeObserver callback"]
    B --> C["fitAddon.fit()"]
    C --> D["Get new cols/rows"]
    D --> E["Debounce 100ms"]
    E --> F{Stable?}
    F -->|No, more events| B
    F -->|Yes| G["postMessage({ type: 'resize', cols, rows })"]
    G --> H["Extension Host:<br/>pty.resize(cols, rows)"]
```

### 7.3 Rendering Pipeline

```mermaid
flowchart LR
    A["Extension Host"] -->|"output data<br/>(buffered)"| B["WebView"]
    B --> C["xterm.write(data)"]
    C --> D{Rendering Engine}
    D --> E["DOM Renderer<br/>(default)"]
    D --> F["WebGL Renderer<br/>(addon-webgl)"]
    D --> G["Canvas Renderer<br/>(addon-canvas)"]
```

---

## 8. Theme Integration

```mermaid
flowchart TD
    A["VS Code Theme Engine"] -->|"Injects CSS variables<br/>into webview :root"| B[":root CSS Variables<br/>--vscode-terminal-background<br/>--vscode-terminal-foreground<br/>--vscode-terminalCursor-foreground<br/>--vscode-terminal-ansiBlack/Red/Green/...<br/>--vscode-editor-font-family<br/>--vscode-editor-font-size<br/>(16 ANSI colors total)"]
    B --> C["ThemeManager"]
    C --> D["1. On init: read all CSS vars<br/>→ build xterm theme object"]
    C --> E["2. Apply to xterm:<br/>terminal.options.theme = {...}"]
    C --> F["3. MutationObserver on body class:<br/>'vscode-dark' ↔ 'vscode-light'<br/>→ re-read & re-apply theme"]
    C --> G["4. Font: read font-family<br/>→ apply to terminal.options.fontFamily"]
```

See [theme-integration.md](design/theme-integration.md) for the complete theme design including location-aware background colors.

---

## 9. View Placement Strategy

### 9.1 Supported Locations and APIs

| Location | API | Registration | Notes |
|----------|-----|-------------|-------|
| **Primary Sidebar** | `WebviewViewProvider` | `viewsContainers.activitybar` | Fully supported |
| **Bottom Panel** | `WebviewViewProvider` | `viewsContainers.panel` | Fully supported |
| **Editor Area** | `WebviewPanel` | `createWebviewPanel()` | Opens as editor tab |
| **Secondary Sidebar** | `WebviewViewProvider` | `viewsContainers.secondarySidebar` (proposed) OR user "Move View" | Proposed API in VS Code 1.104+ |

### 9.2 Provider Reuse Pattern

```mermaid
graph TD
    TVP["TerminalViewProvider<br/>(single class, multiple instances)"]
    TEP["TerminalEditorProvider<br/>(separate class)"]

    TVP --> R1["registerWebviewViewProvider<br/>(sidebar)"]
    TVP --> R2["registerWebviewViewProvider<br/>(panel)"]
    TVP --> R3["registerWebviewViewProvider<br/>(secondary*)"]

    R1 --> V1["resolveWebviewView<br/>→ unique viewId<br/>→ own sessions"]
    R2 --> V2["resolveWebviewView<br/>→ unique viewId<br/>→ own sessions"]
    R3 --> V3["resolveWebviewView<br/>→ unique viewId<br/>→ own sessions"]

    TEP --> V4["createWebviewPanel()<br/>→ opens in editor area<br/>→ own session per tab"]

    style R3 stroke-dasharray: 5 5
    style V3 stroke-dasharray: 5 5
```

> *Secondary sidebar uses same provider, different viewId. Dashed = proposed API.

---

## 10. Error Handling

```mermaid
flowchart TD
    subgraph E1["1. PTY Spawn Failure"]
        E1C["Cause: invalid shell path, permissions"]
        E1H["Handle: show error in webview, offer retry"]
        E1F["Fallback: /bin/zsh → /bin/bash → /bin/sh"]
    end

    subgraph E2["2. node-pty Load Failure"]
        E2C["Cause: VS Code version incompatible"]
        E2H["Handle: show error notification"]
        E2M["Message: 'AnyWhere Terminal requires<br/>VS Code >= 1.109.0'"]
    end

    subgraph E3["3. PTY Process Crash"]
        E3C["Cause: shell crashes, OOM, SIGKILL"]
        E3H["Handle: show '[Process exited]' in terminal"]
        E3I["Isolate: other terminals unaffected"]
    end

    subgraph E4["4. WebView Communication Failure"]
        E4C["Cause: webview disposed during message"]
        E4H["Handle: try/catch postMessage, log warning"]
        E4CL["Cleanup: destroy orphaned PTY sessions"]
    end

    subgraph E5["5. Output Buffer Overflow"]
        E5C["Cause: extremely rapid output (e.g., yes)"]
        E5H["Handle: cap buffer, drop oldest chunks"]
        E5U["UX: terminal stays responsive"]
    end
```

See [error-handling.md](design/error-handling.md) for the complete error handling design including error categories, fallback chains, and user notification patterns.

---

## 11. Security Considerations

### 11.1 WebView Content Security Policy

```
Content-Security-Policy:
  default-src 'none';                    # Block all by default
  style-src ${webview.cspSource}         # Allow VS Code webview styles
           'unsafe-inline';              # Allow inline styles for xterm
  script-src 'nonce-${nonce}';           # Only nonce-tagged scripts
  font-src ${webview.cspSource};         # Allow VS Code fonts
  img-src ${webview.cspSource};          # Allow webview images
```

### 11.2 PTY Security

- Shell spawned with user's environment (`process.env`)
- Working directory defaults to workspace root
- No elevated privileges
- PTY processes are children of the Extension Host process
- All PTY processes killed on extension deactivation

---

## 12. Testing Strategy

### 12.1 Unit Tests
- `SessionManager`: session CRUD, number recycling, cleanup
- `PtyManager`: shell detection, node-pty loading
- `ConfigManager`: setting reads, defaults, changes
- Message protocol: serialization/deserialization

### 12.2 Integration Tests
- Extension activation/deactivation
- WebView creation and message flow
- PTY spawn and I/O round-trip
- View lifecycle (create, hide, show, dispose)

### 12.3 Manual Test Matrix

| Test Case | Sidebar | Panel | Editor | Secondary |
|-----------|---------|-------|--------|-----------|
| Shell prompt appears | [ ] | [ ] | [ ] | [ ] |
| `ls -la` output correct | [ ] | [ ] | [ ] | [ ] |
| Resize works | [ ] | [ ] | [ ] | [ ] |
| Copy/paste works | [ ] | [ ] | [ ] | [ ] |
| Ctrl+C interrupts | [ ] | [ ] | [ ] | [ ] |
| Multi-tab works | [ ] | [ ] | [ ] | [ ] |
| vim opens and works | [ ] | [ ] | [ ] | [ ] |
| Theme matches | [ ] | [ ] | [ ] | [ ] |
| Collapse/expand recovery | [ ] | [ ] | [ ] | [ ] |
| Heavy output (`find /`) | [ ] | [ ] | [ ] | [ ] |
