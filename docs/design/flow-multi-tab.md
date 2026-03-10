# Flow: Multi-Tab Lifecycle

> Part of [DESIGN.md](../DESIGN.md) - Section 3.5

## Overview

Each terminal view (sidebar, panel, editor) can host multiple terminal tabs. Each tab corresponds to an independent PTY session. This document covers the full lifecycle: create, switch, close, and the data routing between tabs.

> **Cross-references**: [session-manager.md](session-manager.md) | [message-protocol.md](message-protocol.md)

## Tab State Machine

```mermaid
stateDiagram-v2
    [*] --> Created: createTab command

    Created --> Active: First tab / switchTab
    Active --> Background: switchTab to another
    Background --> Active: switchTab back
    Active --> Closing: closeTab command
    Background --> Closing: closeTab command
    Closing --> [*]: PTY killed, DOM removed

    state Active {
        [*] --> Rendering
        Rendering: xterm.js visible (display: block)
        Rendering: Receives PTY output in real-time
        Rendering: Has keyboard focus
        Rendering: Resize-aware (via ResizeCoordinator)
    }

    state Background {
        [*] --> Hidden
        Hidden: xterm.js hidden (display: none)
        Hidden: Still receives PTY output (term.write)
        Hidden: No keyboard focus
        Hidden: No resize events
    }
```

## Create Tab Flow

```mermaid
sequenceDiagram
    actor User
    participant WV as WebView
    participant Ext as Extension Host
    participant SM as SessionManager
    participant PTY as New PtySession

    User->>WV: Click "+" button in tab bar

    WV->>Ext: postMessage({ type: 'createTab' })

    Ext->>SM: createSession(viewId, webview)
    SM->>SM: findAvailableNumber() → 2
    SM->>PTY: spawn('/bin/zsh', { cols, rows, cwd })
    SM->>SM: sessions.set(id, session)
    SM->>SM: viewSessions.get(viewId).push(id)
    SM-->>Ext: sessionId = 'xyz-456'

    Ext->>WV: postMessage({ type: 'tabCreated', tabId: 'xyz-456', name: 'Terminal 2' })

    Note over WV: MessageRouter dispatches to onTabCreated
    WV->>WV: TerminalFactory.createTerminal('xyz-456', 'Terminal 2', config, false)
    Note over WV: 1. Create container div
    Note over WV: 2. new Terminal() + loadAddon(FitAddon, WebLinksAddon, WebGL)
    Note over WV: 3. terminal.open(container)
    Note over WV: 4. setTimeout(0) → fitTerminal() → terminal.focus()

    WV->>WV: switchTab('xyz-456')
    Note over WV: 5. Hide previous tab via SplitTreeRenderer
    Note over WV: 6. Show new tab container
    Note over WV: 7. requestAnimationFrame → fitAllAndFocus()
    Note over WV: 8. Update tab bar

    WV->>Ext: postMessage({ type: 'switchTab', tabId: 'xyz-456' })
```

### Tab Focus Management

When a new tab is created, focus is managed using `requestAnimationFrame` to ensure the DOM is ready:

```typescript
requestAnimationFrame(() => {
  factory.fitAllAndFocus(tabId, instance);
});
```

This pattern ensures the terminal container has been laid out before fitting and focusing.

## Switch Tab Flow

```mermaid
sequenceDiagram
    actor User
    participant WV as WebView
    participant Ext as Extension Host
    participant SM as SessionManager

    Note over WV: Currently active: Terminal 2 (xyz-456)

    User->>WV: Click tab "Terminal 1"
    WV->>WV: switchTab('abc-123')

    Note over WV: 1. SplitTreeRenderer.hideTabContainer(current)
    Note over WV: 2. SplitTreeRenderer.showTabContainer('abc-123')
    Note over WV: 3. requestAnimationFrame →<br/>fitAllAndFocus('abc-123')
    Note over WV: 4. Update tab bar UI

    WV->>Ext: postMessage({ type: 'switchTab', tabId: 'abc-123' })
    Ext->>SM: switchActiveSession(viewId, 'abc-123')
    Note over SM: Update activeSessionId for this view

    WV->>Ext: postMessage({ type: 'resize', tabId: 'abc-123', cols, rows })
    Note over Ext: Resize PTY to match current container size<br/>(may have changed since last active)
```

### Resize-on-Switch Detail

When switching tabs, the newly active tab may need a resize because the container dimensions could have changed while the tab was hidden (e.g., the user resized the sidebar while a different tab was active). `factory.fitAllAndFocus()` calls `XtermFitService.fitTerminal()` on all leaf terminals in the tab's split tree, recalculating cols/rows and emitting resize messages for any that changed.

### Background Tab Output

```mermaid
flowchart TD
    A["PTY 1 output<br/>(background tab)"] --> B["SessionManager routes by tabId"]
    B --> C["postMessage({ type:'output',<br/>tabId: 'abc-123', data })"]
    C --> D["WebView receives message"]
    D --> E["terminals.get('abc-123')"]
    E --> F["terminal.write(data)"]
    
    Note1["Note: xterm.js processes writes<br/>even when container is display:none.<br/>Scrollback buffer is maintained.<br/>When tab becomes active,<br/>all output is already rendered."]
    
    style Note1 fill:#333,stroke:#666,color:#ccc
```

## Close Tab Flow

```mermaid
sequenceDiagram
    actor User
    participant WV as WebView
    participant Ext as Extension Host
    participant SM as SessionManager
    participant PTY as PtySession

    User->>WV: Click "x" on Terminal 1 tab

    WV->>Ext: postMessage({ type: 'closeTab', tabId: 'abc-123' })

    Ext->>SM: destroySession('abc-123')
    Note over SM: Add to _terminalBeingKilled Set<br/>(prevents infinite kill↔onExit loop)
    SM->>PTY: session.pty.kill()
    Note over PTY: Send SIGHUP to shell process<br/>Shell and child processes terminate
    SM->>SM: sessions.delete('abc-123')
    SM->>SM: usedNumbers.delete(1) → number 1 available again
    SM->>SM: viewSessions.get(viewId).remove('abc-123')
    SM->>SM: _terminalBeingKilled.delete('abc-123')

    Ext->>WV: postMessage({ type: 'tabRemoved', tabId: 'abc-123' })

    Note over WV: MessageRouter dispatches to onTabRemoved
    WV->>WV: removeTerminal('abc-123')
    Note over WV: 1. Dispose xterm instance (terminal.dispose())
    Note over WV: 2. Remove container div from DOM
    Note over WV: 3. Delete from store + flowControl
    Note over WV: 4. SplitTreeRenderer.removeTab() for cleanup

    alt Was active tab and other tabs exist
        WV->>WV: switchTab(lastRemainingTabId)
    end
    alt Was active tab and no tabs remain
        WV->>Ext: postMessage({ type: 'createTab' })
        Note over WV: Auto-request new tab<br/>when last tab is closed
    end
```

### Kill Tracking: `_terminalBeingKilled`

To prevent an infinite loop between `kill()` and `onExit()`, the SessionManager tracks terminals being killed:

```typescript
private _terminalBeingKilled = new Set<string>();

async destroySession(id: string): Promise<void> {
  if (this._terminalBeingKilled.has(id)) return;
  this._terminalBeingKilled.add(id);
  
  try {
    const session = this.sessions.get(id);
    if (session) {
      session.pty.kill();
      // ... cleanup
    }
  } finally {
    this._terminalBeingKilled.delete(id);
  }
}
```

Without this guard, `kill()` triggers `onExit()`, which might call `destroySession()` again.

### Split Pane Lifecycle

Split pane operations (create, close, restructure) are handled by `SplitTreeRenderer`. When a tab has split panes:
- Closing a split pane removes it from the split tree and restructures the layout
- The `WebviewStateStore` persists layout state via `vscode.setState()`
- `ResizeCoordinator.debouncedFitAllLeaves()` refits all remaining panes after restructure

### Auto-Create on Last Tab Close

When the last tab is closed, the webview automatically requests a new tab:

```typescript
if (remaining.length > 0) {
  switchTab(remaining[remaining.length - 1]);
} else {
  store.activeTabId = null;
  vscode.postMessage({ type: 'createTab' });
}
```

## Tab Number Recycling

```mermaid
flowchart LR
    subgraph Before["State: 3 terminals"]
        T1["Terminal 1 ✓"]
        T2["Terminal 2 ✓"]
        T3["Terminal 3 ✓"]
    end

    Before -->|"Close Terminal 2"| After

    subgraph After["State: 2 terminals"]
        T1b["Terminal 1 ✓"]
        T3b["Terminal 3 ✓"]
    end

    After -->|"Create new terminal"| Final

    subgraph Final["State: 3 terminals"]
        T1c["Terminal 1 ✓"]
        T2c["Terminal 2 ✓ (recycled!)"]
        T3c["Terminal 3 ✓"]
    end
```

### Number Recycling Algorithm

```typescript
private findAvailableNumber(): number {
  // Scan 1..MAX for first unused number
  for (let i = 1; i <= MAX_TABS; i++) {
    if (!this.usedNumbers.has(i)) {
      this.usedNumbers.add(i);
      return i;
    }
  }
  // Fallback: use size + 1
  return this.usedNumbers.size + 1;
}
```

## Data Routing Architecture

```mermaid
flowchart TB
    subgraph View["Single WebView (e.g., Sidebar)"]
        TabBar["Tab Bar: [Term 1] [Term 2*] [Term 3] [+]"]
        XT1["xterm #1<br/>(hidden)"]
        XT2["xterm #2<br/>(visible, active)"]
        XT3["xterm #3<br/>(hidden)"]
    end

    subgraph ExtHost["Extension Host"]
        SM2["SessionManager"]
        PTY1["PTY Session 1<br/>tabId: abc"]
        PTY2["PTY Session 2<br/>tabId: xyz"]
        PTY3["PTY Session 3<br/>tabId: def"]
    end

    PTY1 -->|"{ output, tabId: abc }"| XT1
    PTY2 -->|"{ output, tabId: xyz }"| XT2
    PTY3 -->|"{ output, tabId: def }"| XT3

    XT2 -->|"{ input, tabId: xyz }"| PTY2

    Note["Only the active tab (Term 2)<br/>sends input. All tabs receive output."]

    style XT2 fill:#2a5,color:#fff
    style PTY2 fill:#2a5,color:#fff
    style TabBar fill:#333,color:#fff
```

**Key principle**: All tabs receive output simultaneously (so scrollback is up-to-date), but only the active tab sends input (keyboard focus).

## Keyboard Shortcut: Ctrl+Tab

```mermaid
flowchart TD
    A["User presses Ctrl+Tab"] --> B["document keydown handler"]
    B --> C["e.ctrlKey && e.key === 'Tab'"]
    C --> D["e.preventDefault()"]
    D --> E["Get current tab index"]
    E --> F["nextIndex = (current + 1) % tabs.length"]
    F --> G["switchTab(tabs[nextIndex].id)"]
```

Ctrl+Shift+Tab cycles in reverse order.
