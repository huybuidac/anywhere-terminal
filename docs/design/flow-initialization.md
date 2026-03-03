# Flow: Terminal Initialization

> Part of [DESIGN.md](../DESIGN.md) - Section 3.1

## Overview

This diagram shows the complete initialization sequence when a user opens an AnyWhere Terminal view for the first time. It covers WebView creation, PTY spawning, and the first shell prompt appearing.

> **Cross-references**: [pty-manager.md](pty-manager.md) | [session-manager.md](session-manager.md) | [webview-provider.md](webview-provider.md) | [output-buffering.md](output-buffering.md)

## Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant VSCode as VS Code
    participant Ext as Extension Host
    participant SM as SessionManager
    participant PM as PtyManager
    participant PTY as PtySession
    participant WV as WebView

    User->>VSCode: Click AnyWhere Terminal icon in Activity Bar
    VSCode->>Ext: resolveWebviewView(webviewView, context, token)

    Note over Ext: 1. Configure webview options
    Ext->>WV: enableScripts = true
    Ext->>WV: retainContextWhenHidden = true
    Ext->>WV: localResourceRoots = [media/]

    Note over Ext: 2. Generate HTML with CSP + nonce
    Ext->>WV: webviewView.webview.html = getHtmlForWebview()

    Note over WV: 3. Browser loads HTML document
    Note over WV: 4. Load xterm.css stylesheet
    Note over WV: 5. Execute webview.js (nonce-verified)
    Note over WV: 6. new Terminal() → xterm.js instance<br/>(constructor cached at module level)
    Note over WV: 7. new FitAddon() → resize addon
    Note over WV: 8. Set up ResizeObserver on container
    Note over WV: 9. Set up message listener
    Note over WV: 9a. Set up pre-launch input queue

    WV->>Ext: 10. postMessage({ type: 'ready' })

    Ext->>SM: 11. createSession(viewId, webview)

    SM->>PM: 12a. loadNodePty() (lazy, cached at module level)
    alt node-pty load failure
        PM-->>SM: Error: cannot load node-pty
        SM-->>Ext: Load failure
        Ext->>WV: postMessage({ type: 'error', message })
        Note over WV: Show error notification:<br/>"AnyWhere Terminal requires<br/>VS Code >= 1.109.0"
    end

    SM->>PM: 12b. detectShell()
    Note over PM: validateShell(path):<br/>check file exists & is executable
    PM-->>SM: { shell, args }

    SM->>PTY: 13. new PtySession()
    PTY->>PTY: 14. pty.spawn(shell, args, { cols:80, rows:30, cwd })

    alt PTY spawn failure
        PTY-->>SM: Spawn error (invalid shell path, permissions)
        SM->>PM: Try fallback shell chain:<br/>/bin/zsh → /bin/bash → /bin/sh
        PM-->>SM: Next valid shell
        SM->>PTY: Retry spawn with fallback shell
    end

    Note over PTY: 15. Start output buffer flush timer (8ms)
    Note over PTY: 15a. Initialize flow control:<br/>reset unacknowledgedCharCount = 0
    PTY-->>SM: 16. Return sessionId

    Ext->>WV: 17. postMessage({ type: 'init', sessionId, tabs, config })

    Note over WV: 18. createTerminal(id, name, isActive)
    Note over WV: 19. terminal.open(container)
    Note over WV: 20. fitAddon.fit() → calculate cols/rows
    Note over WV: 21. applyTheme() from CSS variables
    Note over WV: 22. terminal.focus()
    Note over WV: 22a. Flush pre-launch input queue<br/>(keystrokes typed before PTY ready)

    WV->>Ext: 23. postMessage({ type: 'resize', cols, rows })
    Ext->>PTY: 24. pty.resize(cols, rows)

    Note over PTY: 25. Shell starts (zsh/bash)<br/>Outputs prompt string
    PTY->>PTY: 26. pty.onData(promptData)<br/>→ accumulate in outputBuffer

    Note over PTY: 27. 8ms flush timer fires
    PTY->>Ext: 28. Flush buffer
    Ext->>WV: 29. postMessage({ type: 'output', data: "user@mac ~ % " })

    Note over WV: 30. terminal.write(data)<br/>Shell prompt appears on screen!
```

## Key Implementation Notes

### WebView Options

| Option | Value | Reason |
|--------|-------|--------|
| `enableScripts` | `true` | Required for xterm.js to run |
| `retainContextWhenHidden` | `true` | Preserves terminal state when view is collapsed |
| `localResourceRoots` | `[media/]` | Restricts file access to bundled assets only |

### Lazy Loading (xterm.js)

The xterm.js `Terminal` constructor is imported and cached at module level in the webview bundle. This follows the VS Code pattern where the constructor reference is resolved once and reused across all terminal instances, avoiding repeated dynamic imports.

```typescript
// Cached at module level (loaded once)
import { Terminal } from '@xterm/xterm';
```

### Pre-Launch Input Queue

Keystrokes typed before the PTY process is ready are queued in a `pendingInput` array. When the PTY process starts and the first output arrives (or the `init` message is processed), the queue is flushed:

```typescript
// Before PTY ready: queue input
pendingInputQueue.push(data);

// On PTY ready: flush
pendingInputQueue.forEach(data => vscode.postMessage({ type: 'input', data, tabId }));
pendingInputQueue.length = 0;
```

This pattern comes from VS Code's `terminalProcessManager.ts` which ensures no keystrokes are lost during the startup window.

### Shell Detection & Validation

Shell detection includes a validation step that checks the shell binary exists before attempting to spawn:

```
detectShell() → candidate path
  → validateShell(path): fs.existsSync(path) && fs.accessSync(path, X_OK)
  → if invalid, try next in fallback chain
```

See [pty-manager.md](pty-manager.md) for the full shell detection algorithm.

### Flow Control Initialization

On first connection, the flow control subsystem resets the `unacknowledgedCharCount` to 0. This counter tracks how many bytes of output have been sent to the webview but not yet acknowledged. If it exceeds the high watermark (100K), PTY reads are paused. See [output-buffering.md](output-buffering.md) for the complete flow control design.

### Initialization Race Conditions

The `ready` message from the WebView is critical for synchronization. The Extension Host must **not** create a PTY session until the WebView signals it's ready to receive output. Otherwise, early PTY output would be lost.

```
Timeline:
  WebView loading...   |████████████|
  ready msg            |            |→
  PTY spawn            |            |  →→→|
  First output         |            |     |→→→→|
  term.write()         |            |     |    |→ visible!
```

### First Resize

The initial resize is important because the PTY starts with default dimensions (80x30). After `fitAddon.fit()` calculates the actual container size, the real cols/rows are sent to the PTY so the shell can correctly wrap text.

### Error Paths Summary

| Error | Detection | Recovery |
|-------|-----------|----------|
| node-pty load failure | `require()` throws | Show error notification with VS Code version requirement |
| PTY spawn failure | `spawn()` throws or exits immediately | Try fallback shell chain: `/bin/zsh` → `/bin/bash` → `/bin/sh` |
| Shell not found | `validateShell()` returns false | Skip to next candidate in fallback chain |
| WebView disposed during init | `postMessage()` throws | Destroy orphaned PTY session |
