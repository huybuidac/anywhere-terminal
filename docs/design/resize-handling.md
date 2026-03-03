# Resize Handling — Detailed Design

## 1. Overview

Terminal resize is one of the most performance-sensitive operations in a terminal emulator. **Horizontal resize (column change) is expensive** because it triggers text reflow — every line in the scrollback buffer must be re-wrapped. During a user drag gesture (resizing the sidebar edge or panel divider), dozens of resize events fire per second, each potentially triggering a full reflow.

This document covers our resize strategy: how we observe container dimension changes, debounce expensive operations, calculate DPI-aware dimensions, and propagate resize events through the full pipeline from the webview to the PTY process.

### Reference Sources
- VS Code: `src/vs/workbench/contrib/terminal/browser/xterm/xtermTerminal.ts` (getXtermScaledDimensions)
- VS Code: `src/vs/workbench/contrib/terminal/browser/terminalResizeDebouncer.ts` (smart debounce)
- xterm.js: `FitAddon` documentation
- Reference project: `webview/main.ts` (ResizeObserver + debounce)

---

## 2. VS Code's Smart Resize Strategy

VS Code implements a sophisticated resize debouncing strategy in `terminalResizeDebouncer.ts` that adapts based on terminal state. Understanding this helps justify our simplified approach.

### VS Code's Decision Matrix

```mermaid
flowchart TD
    A["Resize event received"] --> B{"Terminal\nvisible?"}
    B -->|No| C["Defer to requestIdleCallback\n(resize when browser idle)"]
    B -->|Yes| D{"Scrollback\nbuffer size?"}
    D -->|"< 200 lines"| E["Resize immediately\n(reflow is cheap)"]
    D -->|">= 200 lines"| F{"What changed?"}
    F -->|"Rows only"| G["Resize immediately\n(no reflow needed)"]
    F -->|"Columns changed"| H["Debounce 100ms\n(reflow is expensive)"]

    style C fill:#553,stroke:#aa6
    style E fill:#354,stroke:#6a6
    style G fill:#354,stroke:#6a6
    style H fill:#543,stroke:#a66
```

### Why Column Changes Are Expensive

| Dimension Change | Cost | Reason |
|---|---|---|
| Rows increase | Cheap | Just add empty rows at bottom |
| Rows decrease | Cheap | Remove rows from bottom (content scrolls up) |
| Columns change | Expensive | Every line in scrollback must be re-wrapped. A 10,000-line scrollback means 10,000 line-wrap recalculations |

### VS Code Constants

| Constant | Value | Source |
|---|---|---|
| Small buffer threshold | 200 lines | `terminalResizeDebouncer.ts` |
| Column debounce time | 100ms | `terminalResizeDebouncer.ts` |
| Row debounce time | 0ms (immediate) | `terminalResizeDebouncer.ts` |

---

## 3. Our MVP Resize Design

For MVP, we use a simplified approach: a single 100ms debounce on all resize events. This is a pragmatic compromise that avoids the complexity of VS Code's multi-path strategy while still preventing excessive reflows during drag operations.

### Resize Pipeline

```mermaid
flowchart TD
    A["User drags sidebar edge\nor panel divider"] -->|"Many rapid\nresize events"| B["ResizeObserver\ncallback fires"]
    B --> C["fitAddon.fit()"]
    C --> D["xterm calculates\nnew cols/rows"]
    D --> E{"Dimensions\nchanged?"}
    E -->|No| F["Stop\n(no-op)"]
    E -->|Yes| G["terminal.onResize fires\n{cols, rows}"]
    G --> H["Debounce 100ms"]
    H --> I{"More resize\nevents?"}
    I -->|"Yes (within 100ms)"| H
    I -->|"No (100ms elapsed)"| J["postMessage\n{type:'resize', cols, rows}"]
    J --> K["Extension Host:\nSessionManager.resizeSession()"]
    K --> L["pty.resize(cols, rows)"]
```

### Design Rationale

| Aspect | VS Code Approach | Our MVP Approach | Rationale |
|---|---|---|---|
| Debounce strategy | Adaptive (row/col/buffer-aware) | Fixed 100ms for all | Simpler, good enough for MVP. Column changes are 100ms in VS Code too. |
| Hidden terminal | requestIdleCallback | No resize until shown | retainContextWhenHidden keeps DOM alive but hidden terminals don't resize. |
| Small buffer optimization | Immediate for <200 lines | Not implemented | Minor optimization, can add in Phase 2. |
| Row-only optimization | Immediate row changes | Not implemented | Can add in Phase 2 by comparing previous cols. |

---

## 4. DPI-Aware Dimension Calculation

### Problem

On high-DPI displays (Retina, 4K), `window.devicePixelRatio` is >1 (typically 2 on Retina). The physical pixel count of the container is larger than the CSS pixel count. For sub-pixel accuracy in calculating how many terminal columns and rows fit in the container, we must account for this scaling.

### VS Code's Approach (getXtermScaledDimensions)

From `xtermTerminal.ts`, VS Code computes scaled dimensions:

```typescript
/**
 * Calculate terminal dimensions accounting for device pixel ratio.
 * This ensures sub-pixel accuracy on high-DPI displays.
 *
 * From VS Code: xtermTerminal.ts getXtermScaledDimensions()
 */
function getScaledDimensions(
  terminal: Terminal,
  container: HTMLElement
): { cols: number; rows: number } | undefined {
  const dpr = window.devicePixelRatio;

  // Get cell dimensions from xterm's internal measurements
  const cellWidth = terminal.options.fontSize! * 0.6; // approximate
  const cellHeight = terminal.options.fontSize! * 1.2; // approximate

  // If xterm has rendered, use actual measurements
  const core = (terminal as any)._core;
  if (!core?._renderService?.dimensions) {
    return undefined; // Terminal not yet rendered
  }

  const actualCellWidth = core._renderService.dimensions.css.cell.width;
  const actualCellHeight = core._renderService.dimensions.css.cell.height;

  // Scale container dimensions to device pixels, then divide by scaled cell size
  const scaledContainerWidth = container.clientWidth * dpr;
  const scaledContainerHeight = container.clientHeight * dpr;
  const scaledCellWidth = actualCellWidth * dpr;
  const scaledCellHeight = actualCellHeight * dpr;

  const cols = Math.floor(scaledContainerWidth / scaledCellWidth);
  const rows = Math.floor(scaledContainerHeight / scaledCellHeight);

  return { cols: Math.max(cols, 1), rows: Math.max(rows, 1) };
}
```

### Dimension Calculation Flow

```mermaid
flowchart TD
    subgraph Inputs["Inputs"]
        CW["container.clientWidth\n(CSS pixels)"]
        CH["container.clientHeight\n(CSS pixels)"]
        DPR["window.devicePixelRatio\n(e.g., 2.0 on Retina)"]
        CELL_W["Cell width\n(from xterm renderer)"]
        CELL_H["Cell height\n(from xterm renderer)"]
    end

    subgraph Scale["Scale to Device Pixels"]
        SW["scaledWidth =\nclientWidth × DPR"]
        SH["scaledHeight =\nclientHeight × DPR"]
        SCW["scaledCellWidth =\ncellWidth × DPR"]
        SCH["scaledCellHeight =\ncellHeight × DPR"]
    end

    subgraph Calc["Calculate Grid"]
        COLS["cols = floor(\nscaledWidth / scaledCellWidth)"]
        ROWS["rows = floor(\nscaledHeight / scaledCellHeight)"]
    end

    subgraph Clamp["Clamp"]
        MIN["max(cols, 1)\nmax(rows, 1)"]
    end

    CW --> SW
    DPR --> SW
    DPR --> SH
    CH --> SH
    CELL_W --> SCW
    DPR --> SCW
    CELL_H --> SCH
    DPR --> SCH
    SW --> COLS
    SCW --> COLS
    SH --> ROWS
    SCH --> ROWS
    COLS --> MIN
    ROWS --> MIN
```

### MVP Approach

For MVP, we rely on `FitAddon.fit()` which already handles DPI-aware calculations internally. The scaled dimension logic is relevant if we need to:
- Pre-calculate dimensions before the terminal is rendered
- Implement custom dimension logic for edge cases
- Override FitAddon behavior for specific scenarios

---

## 5. Visibility-Triggered Resize

### Problem

When a terminal view is hidden (sidebar collapsed, tab switched), its container has zero or incorrect dimensions. If a resize event fires while hidden, `fitAddon.fit()` would calculate 0 columns/0 rows. When the view becomes visible again, the terminal must be re-fitted to its actual container size.

### Visibility Handling Flow

```mermaid
sequenceDiagram
    participant User
    participant VSCode as VS Code
    participant WV as WebView
    participant RH as ResizeHandler
    participant FA as FitAddon
    participant EXT as Extension Host

    User->>VSCode: Collapse sidebar
    Note over WV: Container dimensions → 0×0
    Note over RH: ResizeObserver fires with 0×0
    RH->>RH: Ignore (width or height is 0)

    Note over WV: retainContextWhenHidden = true<br/>WebView DOM stays alive<br/>but container invisible

    User->>VSCode: Expand sidebar
    Note over WV: Container gets real dimensions

    VSCode->>WV: visibility change event

    RH->>RH: pendingResize = true
    RH->>FA: fitAddon.fit()
    FA->>FA: Measure container dimensions
    FA->>FA: Calculate cols/rows

    Note over FA: terminal.onResize fires<br/>with correct dimensions

    WV->>EXT: { type: 'resize', cols, rows }
    EXT->>EXT: pty.resize(cols, rows)
    Note over EXT: PTY now has correct<br/>terminal dimensions
```

### Implementation

```typescript
class ResizeHandler {
  private pendingResize = false;
  private resizeTimeout: number | undefined;
  private observer: ResizeObserver;

  constructor(
    private container: HTMLElement,
    private fitAddon: FitAddon,
    private onResize: (cols: number, rows: number) => void,
  ) {
    this.observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;

        // Skip if container is not visible (collapsed)
        if (width === 0 || height === 0) {
          this.pendingResize = true;
          return;
        }

        this.debouncedFit();
      }
    });

    this.observer.observe(container);
  }

  /**
   * Called when the view becomes visible again.
   * Flushes any pending resize that was deferred while hidden.
   */
  onViewShow(): void {
    if (this.pendingResize) {
      this.pendingResize = false;
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        this.fitAddon.fit();
      });
    }
  }

  private debouncedFit(): void {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = window.setTimeout(() => {
      this.fitAddon.fit();
    }, 100);
  }

  dispose(): void {
    this.observer.disconnect();
    clearTimeout(this.resizeTimeout);
  }
}
```

---

## 6. Initial Dimensions

### Problem

Before the webview container is measured (before `terminal.open()` and `fitAddon.fit()`), the PTY process needs initial dimensions. The PTY is spawned in the extension host before the webview reports its actual size.

### Default Dimensions

| Property | Default Value | Rationale |
|---|---|---|
| `cols` | 80 | Standard terminal width (POSIX default) |
| `rows` | 30 | Reasonable default height for sidebar/panel |

### Initial Dimension Flow

```mermaid
sequenceDiagram
    participant EXT as Extension Host
    participant PTY as node-pty
    participant WV as WebView
    participant FA as FitAddon

    Note over EXT: PTY spawned with default 80×30
    EXT->>PTY: spawn(shell, args, { cols: 80, rows: 30 })
    Note over PTY: Shell starts with 80×30

    EXT->>WV: { type: 'init', ... }

    WV->>WV: terminal.open(container)
    WV->>FA: fitAddon.fit()
    Note over FA: Measures container<br/>Actual size: 120×35

    WV->>EXT: { type: 'resize', cols: 120, rows: 35 }
    EXT->>PTY: pty.resize(120, 35)
    Note over PTY: Shell now has correct dimensions<br/>Programs re-render for 120×35
```

The brief window where the PTY has 80×30 dimensions (before the webview reports actual size) is typically imperceptible. The shell prompt renders once at 80 columns, then immediately re-renders at the correct width when the resize arrives.

---

## 7. Full Resize-to-PTY Pipeline

### End-to-End Sequence

```mermaid
sequenceDiagram
    participant DOM as Container DIV
    participant RO as ResizeObserver
    participant RH as ResizeHandler
    participant FA as FitAddon
    participant XT as xterm.Terminal
    participant MH as MessageHandler
    participant EXT as Extension Host
    participant SM as SessionManager
    participant PTY as node-pty

    DOM->>RO: Container dimensions change
    RO->>RH: ResizeObserver callback
    RH->>RH: Start/reset 100ms debounce timer

    Note over RH: 100ms passes with no new events...

    RH->>FA: fitAddon.fit()
    FA->>FA: Measure container<br/>Calculate cols/rows
    FA->>XT: Set terminal dimensions
    XT->>XT: Reflow text if cols changed
    XT->>MH: terminal.onResize({cols, rows})

    MH->>EXT: postMessage({<br/>  type: 'resize',<br/>  tabId: 'abc',<br/>  cols: 120, rows: 35<br/>})

    EXT->>SM: resizeSession('abc', 120, 35)
    SM->>SM: session = sessions.get('abc')
    SM->>SM: session.cols = 120<br/>session.rows = 35
    SM->>PTY: pty.resize(120, 35)
    Note over PTY: Kernel updates tty<br/>dimensions. Programs<br/>receive SIGWINCH.
```

### What Happens After pty.resize()

When `pty.resize(cols, rows)` is called:
1. The kernel updates the terminal device's window size (`struct winsize`)
2. The kernel sends `SIGWINCH` (window change) to the foreground process group
3. Programs like `vim`, `htop`, `less` catch SIGWINCH and re-render
4. The shell updates `$COLUMNS` and `$LINES`

---

## 8. Debounce Decision Tree

### When to Fit vs. When to Skip

```mermaid
flowchart TD
    A["ResizeObserver fires"] --> B{"Container\nvisible?"}
    B -->|"width=0 or height=0"| C["Set pendingResize=true\nSkip fit"]
    B -->|"Has dimensions"| D{"Active\nterminal?"}
    D -->|No| E["Skip fit\n(no terminal to resize)"]
    D -->|Yes| F["Clear previous timer"]
    F --> G["Start 100ms timer"]
    G --> H{"New resize\nwithin 100ms?"}
    H -->|Yes| F
    H -->|No| I["fitAddon.fit()"]
    I --> J{"Dimensions\nactually changed?"}
    J -->|No| K["No-op\n(onResize won't fire)"]
    J -->|Yes| L["onResize fires\npostMessage to extension"]

    style C fill:#553,stroke:#aa6
    style E fill:#553,stroke:#aa6
    style K fill:#553,stroke:#aa6
    style L fill:#354,stroke:#6a6
```

---

## 9. Edge Cases

### 1. Rapid Sidebar Drag

**Scenario**: User drags the sidebar edge continuously for 2 seconds.

**Handling**: ResizeObserver fires ~120 times. Each callback resets the 100ms debounce timer. Only the final resize (100ms after drag stops) triggers `fitAddon.fit()` and `pty.resize()`. The terminal "jumps" to the final size rather than reflowing text 120 times.

### 2. Font Size Change

**Scenario**: User changes `anywhereTerminal.fontSize` in settings.

**Handling**: Font size change is applied via `terminal.options.fontSize`. This changes cell dimensions, so `fitAddon.fit()` must be called afterward to recalculate cols/rows. The `configUpdate` handler explicitly calls fit after font changes.

### 3. Multiple Terminal Tabs

**Scenario**: 3 terminal tabs exist, only one is visible.

**Handling**: ResizeObserver is on the shared `#terminal-container` element. On resize, only the active terminal's `fitAddon.fit()` is called. Hidden terminals (display: none) get `pendingResize = true` and are fitted on tab switch.

### 4. Window Maximization

**Scenario**: User maximizes the VS Code window.

**Handling**: The container dimensions change in a single step (no drag). ResizeObserver fires once, debounce timer waits 100ms, then fit is called. The 100ms delay is imperceptible for a single resize event.

### 5. DevicePixelRatio Change

**Scenario**: User moves VS Code window between a Retina display (DPR=2) and an external monitor (DPR=1).

**Handling**: `window.devicePixelRatio` changes. FitAddon accounts for DPR internally. A `matchMedia('(resolution: ...)')` listener could trigger a re-fit, but this is an edge case deferred to Phase 2.

---

## 10. Interface Definition

```typescript
interface IResizeHandler {
  /**
   * Notify the handler that the view has become visible.
   * Triggers deferred resize if pending.
   */
  onViewShow(): void;

  /**
   * Force an immediate fit (no debounce).
   * Used after font size changes or tab switches.
   */
  fitImmediate(): void;

  /**
   * Get current terminal dimensions.
   */
  getDimensions(): { cols: number; rows: number };

  /**
   * Clean up the ResizeObserver and timers.
   */
  dispose(): void;
}
```

---

## 11. File Location

```
src/webview/utils/ResizeHandler.ts
```

### Dependencies
- `@xterm/addon-fit` — `FitAddon` for calculating and applying dimensions
- Browser APIs — `ResizeObserver`, `requestAnimationFrame`

### Dependents
- `TerminalWebviewApp` (main.ts) — creates ResizeHandler per terminal instance
- `TerminalManager` — calls `onViewShow()` on tab switch, `fitImmediate()` on config change
