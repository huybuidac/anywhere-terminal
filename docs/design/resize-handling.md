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
    B --> C["Debounce 100ms\n(ResizeCoordinator)"]
    C --> D{"More resize\nevents?"}
    D -->|"Yes (within 100ms)"| C
    D -->|"No (100ms elapsed)"| E["requestAnimationFrame"]
    E --> F["XtermFitService.fitTerminal()\nusing getBoundingClientRect()"]
    F --> G{"Dimensions\nchanged?"}
    G -->|No| H["Return null (no-op)"]
    G -->|Yes| I["terminal.resize(cols, rows)"]
    I --> J["terminal.onResize fires"]
    J --> K["Immediate postMessage\n{type:'resize', cols, rows}"]
    K --> L["Extension Host:\nSessionManager.resizeSession()"]
    L --> M["pty.resize(cols, rows)"]
```

> **Key difference from the original design**: The debounce is between the ResizeObserver and the fit operation, not between `onResize` and `postMessage`. Once `fitTerminal()` runs and changes dimensions, `terminal.onResize` fires and `postMessage` is sent immediately.

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

### Actual Implementation: XtermFitService

The custom `fitTerminal()` in `XtermFitService` replaces `FitAddon.fit()`. It uses `getBoundingClientRect()` for actual rendered pixel dimensions (not `getComputedStyle()` which can return stale values during CSS flex layout transitions):

```typescript
function fitTerminal(terminal: Terminal, parentElement: HTMLElement): { cols: number; rows: number } | null {
  const core = (terminal as any)._core;
  const dims = core?._renderService?.dimensions;
  if (!dims || dims.css.cell.width === 0 || dims.css.cell.height === 0) return null;

  const parentRect = parentElement.getBoundingClientRect();
  if (parentRect.width === 0 || parentRect.height === 0) return null;

  // Account for xterm element padding and scrollbar
  const scrollbarWidth = terminal.options.scrollback === 0 ? 0 : terminal.options.overviewRuler?.width || 14;
  const availableWidth = parentRect.width - paddingLeft - paddingRight - scrollbarWidth;
  const availableHeight = parentRect.height - paddingTop - paddingBottom;

  const cols = Math.max(2, Math.floor(availableWidth / dims.css.cell.width));
  const rows = Math.max(1, Math.floor(availableHeight / dims.css.cell.height));

  if (terminal.rows === rows && terminal.cols === cols) return null;

  core?._renderService?.clear();
  return { cols, rows };
}
```

This is the **only module** that accesses xterm private APIs (`_core`, `_renderService`). If xterm updates break internals, only this file needs fixing.

---

## 5. Visibility-Triggered Resize

### Problem

When a terminal view is hidden (sidebar collapsed, tab switched), its container has zero or incorrect dimensions. If a resize event fires while hidden, `fitTerminal()` would calculate 0 columns/0 rows (and return null). When the view becomes visible again, the terminal must be re-fitted to its actual container size.

### Visibility Handling Flow

```mermaid
sequenceDiagram
    participant User
    participant VSCode as VS Code
    participant WV as WebView
    participant RC as ResizeCoordinator
    participant XFS as XtermFitService
    participant EXT as Extension Host

    User->>VSCode: Collapse sidebar
    Note over WV: Container dimensions → 0×0
    Note over RC: ResizeObserver fires with 0×0
    RC->>RC: pendingResize = true (skip fit)

    Note over WV: retainContextWhenHidden = true<br/>WebView DOM stays alive<br/>but container invisible

    User->>VSCode: Expand sidebar
    Note over WV: Container gets real dimensions

    VSCode->>WV: { type: 'viewShow' }

    RC->>RC: pendingResize = true? → flush
    RC->>RC: requestAnimationFrame
    RC->>XFS: fitTerminal(instance) for each leaf
    XFS->>XFS: getBoundingClientRect() + calculate cols/rows

    Note over XFS: terminal.onResize fires<br/>with correct dimensions

    WV->>EXT: { type: 'resize', cols, rows }
    EXT->>EXT: pty.resize(cols, rows)
    Note over EXT: PTY now has correct<br/>terminal dimensions
```

### Implementation: ResizeCoordinator

There is one `ResizeCoordinator` instance (not per-terminal). It observes the shared `#terminal-container` element and fits all leaf terminals in the active tab's split tree:

```typescript
class ResizeCoordinator {
  private pendingResize = false;
  private fitTimeout: number | undefined;
  private splitFitTimeout: number | undefined;
  private observer: ResizeObserver | undefined;

  constructor(
    private fitTerminal: (instance: FittableInstance) => void,
    private getState: () => { activeTabId, terminals, tabLayouts },
    private onLocationChange: (location: TerminalLocation) => void,
  ) {}

  setup(container: HTMLElement): void {
    this.observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) {
          this.pendingResize = true;
          return;
        }
        this.onLocationChange(inferLocationFromSize(width, height));
        this.debouncedFit();
      }
    });
    this.observer.observe(container);
  }

  debouncedFit(): void {
    clearTimeout(this.fitTimeout);
    this.fitTimeout = window.setTimeout(() => {
      requestAnimationFrame(() => this.fitAllTerminals());
    }, 100);
  }

  debouncedFitAllLeaves(tabId: string): void {
    clearTimeout(this.splitFitTimeout);
    this.splitFitTimeout = window.setTimeout(() => {
      // Fit all leaves in the tab's split tree
    }, 100);
  }

  onViewShow(): void {
    if (this.pendingResize) {
      this.pendingResize = false;
      requestAnimationFrame(() => {
        // Fit all leaves in active tab
      });
    }
  }
}
```

### Split-Pane Resize

When a split resize handle is dragged, `debouncedFitAllLeaves(tabId)` is called (separate timer from `debouncedFit()` to avoid clobbering). This fits all leaf terminals in the tab's split tree after the drag settles.

### Location Inference

`inferLocationFromSize()` determines the terminal location based on container aspect ratio:

```typescript
private static inferLocationFromSize(width: number, height: number): TerminalLocation {
  return width > height * 1.2 ? 'panel' : 'sidebar';
}
```

This updates the ThemeManager's location for correct background color fallback when the view is moved between sidebar and panel.

---

## 6. Initial Dimensions

### Problem

Before the webview container is measured (before `terminal.open()` and `fitTerminal()`), the PTY process needs initial dimensions. The PTY is spawned in the extension host before the webview reports its actual size.

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
    WV->>WV: XtermFitService.fitTerminal()
    Note over WV: Measures container<br/>Actual size: 120×35

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
    participant RC as ResizeCoordinator
    participant XFS as XtermFitService
    participant XT as xterm.Terminal
    participant EXT as Extension Host
    participant SM as SessionManager
    participant PTY as node-pty

    DOM->>RO: Container dimensions change
    RO->>RC: ResizeObserver callback
    RC->>RC: inferLocationFromSize() → update theme location
    RC->>RC: Start/reset 100ms debounce timer

    Note over RC: 100ms passes with no new events...

    RC->>RC: requestAnimationFrame
    RC->>XFS: fitTerminal(terminal, parentElement)
    XFS->>XFS: getBoundingClientRect()<br/>Calculate cols/rows from cell dims
    XFS->>XT: terminal.resize(cols, rows)
    XT->>XT: Reflow text if cols changed
    XT->>EXT: terminal.onResize → postMessage({<br/>  type: 'resize',<br/>  tabId: 'abc',<br/>  cols: 120, rows: 35<br/>})

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
    H -->|No| I["fitTerminal()"]
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

**Handling**: ResizeObserver fires ~120 times. Each callback resets the 100ms debounce timer. Only the final resize (100ms after drag stops) triggers `fitTerminal()` and `pty.resize()`. The terminal "jumps" to the final size rather than reflowing text 120 times.

### 2. Font Size Change

**Scenario**: User changes `anywhereTerminal.fontSize` in settings.

**Handling**: Font size change is applied via `terminal.options.fontSize`. This changes cell dimensions, so `fitTerminal()` must be called afterward to recalculate cols/rows. The `TerminalFactory.applyConfig()` method explicitly calls `fitTerminal()` after font changes.

### 3. Multiple Terminal Tabs

**Scenario**: 3 terminal tabs exist, only one is visible.

**Handling**: ResizeObserver is on the shared `#terminal-container` element. On resize, `ResizeCoordinator.fitAllTerminals()` fits all leaf terminals in the active tab's split tree. Hidden tabs get `pendingResize = true` and are fitted when the view becomes visible via `onViewShow()`.

### 4. Window Maximization

**Scenario**: User maximizes the VS Code window.

**Handling**: The container dimensions change in a single step (no drag). ResizeObserver fires once, debounce timer waits 100ms, then fit is called. The 100ms delay is imperceptible for a single resize event.

### 5. DevicePixelRatio Change

**Scenario**: User moves VS Code window between a Retina display (DPR=2) and an external monitor (DPR=1).

**Handling**: `window.devicePixelRatio` changes. FitAddon accounts for DPR internally. A `matchMedia('(resolution: ...)')` listener could trigger a re-fit, but this is an edge case deferred to Phase 2.

---

## 10. Interface Definition

```typescript
// XtermFitService — pure function, no class
function fitTerminal(
  terminal: Terminal,
  parentElement: HTMLElement
): { cols: number; rows: number } | null;

// ResizeCoordinator — one instance, not per-terminal
class ResizeCoordinator {
  setup(container: HTMLElement): void;
  debouncedFit(): void;
  debouncedFitAllLeaves(tabId: string): void;
  onViewShow(): void;
  dispose(): void;
}
```

---

## 11. File Location

```
src/webview/resize/XtermFitService.ts   — Custom fitTerminal() using xterm _core._renderService
src/webview/resize/ResizeCoordinator.ts — ResizeObserver, debounce, visibility, location inference
```

### Dependencies
- `@xterm/xterm` — `Terminal` type (XtermFitService accesses `_core._renderService` private API)
- Browser APIs — `ResizeObserver`, `requestAnimationFrame`, `getBoundingClientRect()`

### Dependents
- `main.ts` — creates ResizeCoordinator, passes fitTerminal delegate
- `TerminalFactory` — calls `fitTerminal()` for individual terminal fits
- `SplitTreeRenderer` — calls `debouncedFitAllLeaves()` after split resize
