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
        Rendering: fitAddon active
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
    participant TM as TabManager
    participant MH as MessageHandler
    participant Ext as Extension Host
    participant SM as SessionManager
    participant PTY as New PtySession

    User->>WV: Click "+" button in tab bar

    Note over Ext: _canCreateTerminal():<br/>validate slot availability<br/>(max terminal limit check)

    WV->>TM: handleAddTab()
    TM->>MH: send({ type: 'createTab' })
    MH->>Ext: postMessage({ type: 'createTab' })

    Ext->>SM: createSession(viewId, webview)
    SM->>SM: findAvailableNumber() → 2
    SM->>PTY: spawn('/bin/zsh', { cols, rows, cwd })
    SM->>SM: sessions.set(id, session)
    SM->>SM: viewSessions.get(viewId).push(id)
    SM-->>Ext: sessionId = 'xyz-456'

    Ext->>WV: postMessage({ type: 'tabCreated', tabId: 'xyz-456', name: 'Terminal 2' })

    WV->>TM: addTab('xyz-456', 'Terminal 2')
    Note over TM: 1. Create tab element in tab bar
    Note over TM: 2. Create container div for xterm

    WV->>WV: createTerminal('xyz-456', 'Terminal 2', isActive: true)
    Note over WV: 3. new Terminal() instance
    Note over WV: 4. terminal.open(container)
    Note over WV: 5. requestAnimationFrame →<br/>fitAddon.fit() → terminal.focus()

    WV->>TM: switchTab('xyz-456')
    Note over TM: 6. Hide previous tab's container
    Note over TM: 7. Show new tab's container
    Note over TM: 8. Update tab bar active state
    Note over TM: 9. Focus new terminal

    WV->>Ext: postMessage({ type: 'switchTab', tabId: 'xyz-456' })
    Ext->>SM: switchActiveSession(viewId, 'xyz-456')

    Note over Ext: Send stateUpdate for reconciliation
    Ext->>WV: postMessage({ type: 'stateUpdate', tabs, activeTabId })
```

### Max Terminal Limit

Before creating a new terminal, the extension checks `_canCreateTerminal()` to validate slot availability:

```typescript
private _canCreateTerminal(): boolean {
  const maxTabs = this.configManager.get('maxTabs', 10);
  const currentCount = this.sessionManager.getSessionCountForView(this.viewId);
  if (currentCount >= maxTabs) {
    vscode.window.showWarningMessage(
      `Maximum terminal limit (${maxTabs}) reached for this view.`
    );
    return false;
  }
  return true;
}
```

### Tab Focus Management

When a new tab is created, focus is managed using `requestAnimationFrame` to ensure the DOM is ready:

```typescript
requestAnimationFrame(() => {
  fitAddon.fit();
  terminal.focus();
});
```

This pattern ensures the terminal container has been laid out before fitting and focusing.

## Switch Tab Flow

```mermaid
sequenceDiagram
    actor User
    participant WV as WebView
    participant TM as TabManager
    participant Ext as Extension Host
    participant SM as SessionManager

    Note over WV: Currently active: Terminal 2 (xyz-456)

    User->>WV: Click tab "Terminal 1"
    WV->>TM: switchTab('abc-123')

    Note over TM: 1. Hide Terminal 2 container<br/>(display: none)
    Note over TM: 2. Show Terminal 1 container<br/>(display: block)
    Note over TM: 3. Update tab bar UI<br/>(active class)
    
    WV->>WV: fitAddon.fit() on Terminal 1
    Note over WV: Resize needed: container dimensions<br/>may have changed while tab was hidden
    WV->>WV: Terminal 1 xterm.focus()

    WV->>Ext: postMessage({ type: 'switchTab', tabId: 'abc-123' })
    Ext->>SM: switchActiveSession(viewId, 'abc-123')
    Note over SM: Update activeSessionId for this view

    WV->>Ext: postMessage({ type: 'resize', tabId: 'abc-123', cols, rows })
    Note over Ext: Resize PTY to match current container size<br/>(may have changed since last active)
```

### Resize-on-Switch Detail

When switching tabs, the newly active tab may need a resize because the container dimensions could have changed while the tab was hidden (e.g., the user resized the sidebar while a different tab was active). The `fitAddon.fit()` call recalculates cols/rows based on current container dimensions and emits a resize message if they differ from the previous values.

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
    participant TM as TabManager
    participant Ext as Extension Host
    participant SM as SessionManager
    participant PTY as PtySession

    User->>WV: Click "x" on Terminal 1 tab

    alt Only one tab remaining
        Note over WV: Optionally: prevent closing last tab<br/>OR close and show "No terminals" placeholder
    end

    WV->>TM: closeTab('abc-123')
    TM->>Ext: postMessage({ type: 'closeTab', tabId: 'abc-123' })

    Note over Ext: Queue destroySession() call<br/>(Promise chain serialization<br/>prevents race conditions)

    Ext->>SM: destroySession('abc-123')
    Note over SM: Add to _terminalBeingKilled Set<br/>(prevents infinite kill↔onExit loop)
    SM->>PTY: session.pty.kill()
    Note over PTY: Send SIGHUP to shell process<br/>Shell and child processes terminate
    SM->>SM: sessions.delete('abc-123')
    SM->>SM: usedNumbers.delete(1) → number 1 available again
    SM->>SM: viewSessions.get(viewId).remove('abc-123')
    SM->>SM: _terminalBeingKilled.delete('abc-123')

    Ext->>WV: postMessage({ type: 'tabRemoved', tabId: 'abc-123' })

    Note over Ext: Send stateUpdate for reconciliation
    Ext->>WV: postMessage({ type: 'stateUpdate', tabs, activeTabId })

    WV->>TM: removeTab('abc-123')
    Note over TM: 1. Remove tab element from tab bar
    Note over TM: 2. Dispose xterm instance<br/>(terminal.dispose())
    Note over TM: 3. Remove container div from DOM
    Note over TM: 4. If closed tab was active:<br/>→ focus next/last available tab

    opt Was active tab
        TM->>TM: switchTab(nextTabId)
        Note over TM: Auto-focus: next tab if available,<br/>otherwise last tab
    end
```

### Operation Queue for Tab Close

Tab close operations are serialized through a Promise chain to prevent race conditions (pattern from reference project):

```typescript
private _operationQueue: Promise<void> = Promise.resolve();

closeTab(tabId: string): void {
  this._operationQueue = this._operationQueue.then(async () => {
    await this.sessionManager.destroySession(tabId);
    this.webview.postMessage({ type: 'tabRemoved', tabId });
  });
}
```

This ensures that if multiple tabs are closed rapidly (e.g., "close all"), each destroy completes before the next begins.

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

### State Sync After Mutations

After tab mutations (create, close), the extension sends a `stateUpdate` message so the WebView can reconcile its state:

```typescript
// After create or close
webview.postMessage({
  type: 'stateUpdate',
  tabs: this.sessionManager.getTabsForView(viewId),
  activeTabId: this.sessionManager.getActiveSessionId(viewId),
});
```

This ensures the WebView's tab state matches the extension's session state, even if messages were lost or delivered out of order.

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
