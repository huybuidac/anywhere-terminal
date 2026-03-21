# Theme Integration — Detailed Design

## 1. Overview

AnyWhere Terminal renders xterm.js inside VS Code webviews. VS Code's theme engine automatically injects CSS custom properties (variables) into the webview's `:root` element, reflecting the user's active color theme. Our **ThemeManager** reads these CSS variables at runtime using `getComputedStyle()`, constructs an xterm.js `ITheme` object, and applies it to every terminal instance.

This approach ensures the terminal always matches the user's VS Code theme — including third-party themes — without hardcoding any color values.

### Reference Sources
- VS Code: `src/vs/workbench/contrib/terminal/browser/xterm/xtermTerminal.ts` (theme building)
- VS Code: `src/vs/workbench/contrib/terminal/common/terminalColorRegistry.ts` (CSS variable definitions)
- VS Code: `src/vs/workbench/contrib/terminal/browser/terminalInstance.ts` (font resolution)
- xterm.js: `ITheme` interface documentation

---

## 2. CSS Variable Mapping

VS Code registers terminal-specific color contributions in `terminalColorRegistry.ts`. These are injected into webview `:root` as CSS custom properties. The ThemeManager reads all of them and maps them to xterm.js `ITheme` properties.

### 2.1 ANSI Color Mapping Table

| CSS Variable | xterm.js `ITheme` Property | ANSI Code | Description |
|---|---|---|---|
| `--vscode-terminal-ansiBlack` | `theme.black` | 0 | Black |
| `--vscode-terminal-ansiRed` | `theme.red` | 1 | Red |
| `--vscode-terminal-ansiGreen` | `theme.green` | 2 | Green |
| `--vscode-terminal-ansiYellow` | `theme.yellow` | 3 | Yellow |
| `--vscode-terminal-ansiBlue` | `theme.blue` | 4 | Blue |
| `--vscode-terminal-ansiMagenta` | `theme.magenta` | 5 | Magenta |
| `--vscode-terminal-ansiCyan` | `theme.cyan` | 6 | Cyan |
| `--vscode-terminal-ansiWhite` | `theme.white` | 7 | White |
| `--vscode-terminal-ansiBrightBlack` | `theme.brightBlack` | 8 | Bright Black (Gray) |
| `--vscode-terminal-ansiBrightRed` | `theme.brightRed` | 9 | Bright Red |
| `--vscode-terminal-ansiBrightGreen` | `theme.brightGreen` | 10 | Bright Green |
| `--vscode-terminal-ansiBrightYellow` | `theme.brightYellow` | 11 | Bright Yellow |
| `--vscode-terminal-ansiBrightBlue` | `theme.brightBlue` | 12 | Bright Blue |
| `--vscode-terminal-ansiBrightMagenta` | `theme.brightMagenta` | 13 | Bright Magenta |
| `--vscode-terminal-ansiBrightCyan` | `theme.brightCyan` | 14 | Bright Cyan |
| `--vscode-terminal-ansiBrightWhite` | `theme.brightWhite` | 15 | Bright White |

### 2.2 Special Color Mapping Table

| CSS Variable | xterm.js `ITheme` Property | Description |
|---|---|---|
| `--vscode-terminal-background` | `theme.background` | Terminal default background (fallback, see §3) |
| `--vscode-terminal-foreground` | `theme.foreground` | Terminal default text color |
| `--vscode-terminalCursor-foreground` | `theme.cursor` | Cursor color |
| `--vscode-terminalCursor-background` | `theme.cursorAccent` | Cursor accent (outline) color |
| `--vscode-terminal-selectionBackground` | `theme.selectionBackground` | Text selection highlight |
| `--vscode-terminal-selectionForeground` | `theme.selectionForeground` | Selected text color |
| `--vscode-terminal-inactiveSelectionBackground` | `theme.selectionInactiveBackground` | Selection highlight when terminal is unfocused |

#### Scrollbar Properties

The theme also sets scrollbar properties to hide the xterm scrollbar visuals (a 1px overview ruler lane is kept for FitAddon width math):

| xterm.js `ITheme` Property | Value | Description |
|---|---|---|
| `theme.overviewRulerBorder` | `'transparent'` | Hide overview ruler border |
| `theme.scrollbarSliderBackground` | `'transparent'` | Hide scrollbar slider |
| `theme.scrollbarSliderHoverBackground` | `'transparent'` | Hide scrollbar hover state |
| `theme.scrollbarSliderActiveBackground` | `'transparent'` | Hide scrollbar active state |

> **Note:** The cursor foreground variable uses `terminalCursor` (no hyphen before "Cursor"), not `terminal-cursor`. This is a VS Code naming convention difference.

---

## 3. Location-Aware Background Color

### Problem

VS Code's built-in terminal uses different background colors depending on where the terminal is rendered. This is handled by `TerminalInstanceColorProvider` in VS Code's codebase. When `--vscode-terminal-background` is not explicitly set by the theme (many themes omit it), the terminal should blend into its container rather than showing a mismatched background.

### Background Color Resolution Chain

The location-specific variable is tried **first**, then `--vscode-terminal-background` as fallback, then a hardcoded default. This ensures the terminal blends into its container.

```mermaid
flowchart TD
    A["Determine background color"] --> B{"Location-specific\nCSS var set?"}
    B -->|"Non-empty"| C["Use location-specific var\n(panel/sidebar/editor)"]
    B -->|"Empty/unset"| D{"terminal-background\nCSS var set?"}
    D -->|"Non-empty"| E["Use --vscode-terminal-background"]
    D -->|"Empty/unset"| F["Use hardcoded fallback: #1e1e1e"]
    C --> G["Apply to theme.background"]
    E --> G
    F --> G
```

### Location-to-Variable Mapping

| Terminal Location | Fallback CSS Variable | VS Code Component |
|---|---|---|
| Bottom Panel | `--vscode-panel-background` | Panel container |
| Primary Sidebar | `--vscode-sideBar-background` | Sidebar container |
| Secondary Sidebar | `--vscode-sideBar-background` | Same as primary sidebar |
| Editor Area | `--vscode-editor-background` | Editor container |

### Implementation

The location is initially set to `"sidebar"` (the default) and updated dynamically via `inferLocationFromSize()` in `ResizeCoordinator` based on the container's aspect ratio (`width > height * 1.2` → `"panel"`, otherwise `"sidebar"`). The `"editor"` location is set from the `data-terminal-location` body attribute.

```typescript
type TerminalLocation = 'panel' | 'sidebar' | 'editor';

const LOCATION_BACKGROUND_MAP: Record<TerminalLocation, string> = {
  panel: '--vscode-panel-background',
  sidebar: '--vscode-sideBar-background',
  editor: '--vscode-editor-background',
};

// In ThemeManager.getTheme():
const background =
  get(LOCATION_BACKGROUND_MAP[this.location]) ??  // Location-specific first
  get('--vscode-terminal-background') ??            // Then terminal-specific
  '#1e1e1e';                                        // Then hardcoded fallback
```

---

## 4. Theme Change Detection

### Mechanism

VS Code signals theme changes by toggling CSS classes on `document.body`. The webview body element always has one of:

| Body Class | Theme Kind | Description |
|---|---|---|
| `vscode-dark` | Dark theme | Dark background, light text |
| `vscode-light` | Light theme | Light background, dark text |
| `vscode-high-contrast` | High contrast dark | Accessibility theme |
| `vscode-high-contrast-light` | High contrast light | Accessibility theme (VS Code 1.74+) |

When the user switches themes (e.g., via `Ctrl+K Ctrl+T`), VS Code updates the body class and re-injects all CSS variables. Our ThemeManager watches for this class change using a `MutationObserver`.

### Detection Flow

```mermaid
sequenceDiagram
    participant User
    participant VSCode as VS Code Theme Engine
    participant Body as document.body
    participant MO as MutationObserver
    participant TM as ThemeManager
    participant XT as xterm.js Instances

    User->>VSCode: Switch theme (Ctrl+K Ctrl+T)
    VSCode->>Body: Update class: "vscode-dark" → "vscode-light"
    VSCode->>Body: Re-inject all CSS variables on :root

    Body->>MO: MutationRecord (attributeName: 'class')
    MO->>TM: Callback fires

    TM->>TM: getComputedStyle(documentElement)
    TM->>TM: Build new ITheme object

    loop Each terminal instance
        TM->>XT: terminal.options.theme = newTheme
        Note over XT: xterm.js re-renders with<br/>new colors immediately
    end
```

### MutationObserver Setup

```typescript
function watchThemeChanges(onThemeChange: () => void): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'class'
      ) {
        onThemeChange();
        break;
      }
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });

  return observer;
}
```

### Edge Cases

1. **Rapid theme switching**: If the user rapidly toggles themes, multiple `MutationObserver` callbacks fire. The theme re-read is fast (synchronous `getComputedStyle`), so no debouncing is needed — each application just overwrites the previous.

2. **High contrast themes**: These themes may not define all 16 ANSI colors. When a CSS variable is unset, `getPropertyValue()` returns `''`. We leave those properties undefined in the ITheme object, letting xterm.js fall back to its built-in defaults.

3. **Custom CSS in settings**: Users can override terminal colors via `workbench.colorCustomizations`. These are reflected in the CSS variables and picked up automatically.

---

## 5. Font Resolution

### Font Size Resolution Chain

The terminal font size follows a priority chain, matching VS Code's built-in terminal behavior:

```mermaid
flowchart TD
    A["Determine font size"] --> B{"anywhereTerminal.fontSize\nset and > 0?"}
    B -->|Yes| C["Use anywhereTerminal.fontSize"]
    B -->|No / 0| D{"terminal.integrated.fontSize\nset and > 0?"}
    D -->|Yes| E["Use terminal.integrated.fontSize"]
    D -->|No / 0| F{"editor.fontSize\nset and > 0?"}
    F -->|Yes| G["Use editor.fontSize"]
    F -->|No / 0| H["Default: 14"]
    C --> I["Clamp to range [6, 100]"]
    E --> I
    G --> I
    H --> I
    I --> J["Apply to terminal.options.fontSize"]
```

### Font Family Resolution Chain

```mermaid
flowchart TD
    A["Determine font family"] --> B{"anywhereTerminal.fontFamily\nset?"}
    B -->|Yes| C["Use configured fontFamily"]
    B -->|No| D{"terminal.integrated.fontFamily\nset?"}
    D -->|Yes| E["Use terminal.integrated.fontFamily"]
    D -->|No| F{"editor.fontFamily\nset?"}
    F -->|Yes| G["Use editor.fontFamily"]
    F -->|No| H["Default: 'monospace'"]
    C --> I["Apply to terminal.options.fontFamily"]
    E --> I
    G --> I
    H --> I
```

### Font Resolution Implementation

Font settings are read from VS Code configuration on the extension host side (not from CSS variables), because `terminal.integrated.fontSize` and `editor.fontSize` are not exposed as CSS variables in webviews.

```typescript
function resolveFontSize(): number {
  const config = vscode.workspace.getConfiguration();

  const awtFontSize = config.get<number>('anywhereTerminal.fontSize', 0);
  if (awtFontSize > 0) return clamp(awtFontSize, 6, 100);

  const terminalFontSize = config.get<number>('terminal.integrated.fontSize', 0);
  if (terminalFontSize > 0) return clamp(terminalFontSize, 6, 100);

  const editorFontSize = config.get<number>('editor.fontSize', 0);
  if (editorFontSize > 0) return clamp(editorFontSize, 6, 100);

  return 14;
}

function resolveFontFamily(): string {
  const config = vscode.workspace.getConfiguration();

  const awtFamily = config.get<string>('anywhereTerminal.fontFamily', '');
  if (awtFamily) return awtFamily;

  const terminalFamily = config.get<string>('terminal.integrated.fontFamily', '');
  if (terminalFamily) return terminalFamily;

  const editorFamily = config.get<string>('editor.fontFamily', '');
  if (editorFamily) return editorFamily;

  return 'monospace';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
```

The resolved font values are sent to the webview as part of the `init` and `configUpdate` messages.

---

## 6. Complete Theme Building Function

### getXtermTheme()

This function runs in the webview context and reads all CSS variables to construct the xterm.js theme object.

```typescript
import type { ITheme } from '@xterm/xterm';

/**
 * Build an xterm.js ITheme object from VS Code's CSS variables.
 *
 * VS Code injects CSS custom properties into the webview :root element
 * matching the user's active color theme. We read these at runtime and
 * map them to the corresponding xterm.js theme properties.
 *
 * @param location - Where this terminal is rendered (panel, sidebar, editor).
 *                   Used to select the correct background fallback.
 * @returns Complete ITheme object for xterm.js
 */
// ThemeManager.getTheme() method — returns Record<string, string | undefined>
getTheme(): Record<string, string | undefined> {
  const style = getComputedStyle(document.documentElement);
  const get = (varName: string): string | undefined => {
    const value = style.getPropertyValue(varName).trim();
    return value || undefined;
  };

  // Background: location-specific → terminal-specific → hardcoded fallback
  const background =
    get(LOCATION_BACKGROUND_MAP[this.location]) ??
    get('--vscode-terminal-background') ??
    '#1e1e1e';

  const foreground =
    get('--vscode-terminal-foreground') ??
    get('--vscode-editor-foreground') ??
    '#cccccc';

  return {
    background,
    foreground,
    cursor: get('--vscode-terminalCursor-foreground'),
    cursorAccent: get('--vscode-terminalCursor-background'),
    selectionBackground: get('--vscode-terminal-selectionBackground'),
    selectionForeground: get('--vscode-terminal-selectionForeground'),
    selectionInactiveBackground: get('--vscode-terminal-inactiveSelectionBackground'),

    // Standard ANSI colors (0-7)
    black: get('--vscode-terminal-ansiBlack'),
    red: get('--vscode-terminal-ansiRed'),
    green: get('--vscode-terminal-ansiGreen'),
    yellow: get('--vscode-terminal-ansiYellow'),
    blue: get('--vscode-terminal-ansiBlue'),
    magenta: get('--vscode-terminal-ansiMagenta'),
    cyan: get('--vscode-terminal-ansiCyan'),
    white: get('--vscode-terminal-ansiWhite'),

    // Bright ANSI colors (8-15)
    brightBlack: get('--vscode-terminal-ansiBrightBlack'),
    brightRed: get('--vscode-terminal-ansiBrightRed'),
    brightGreen: get('--vscode-terminal-ansiBrightGreen'),
    brightYellow: get('--vscode-terminal-ansiBrightYellow'),
    brightBlue: get('--vscode-terminal-ansiBrightBlue'),
    brightMagenta: get('--vscode-terminal-ansiBrightMagenta'),
    brightCyan: get('--vscode-terminal-ansiBrightCyan'),
    brightWhite: get('--vscode-terminal-ansiBrightWhite'),

    // Hide scrollbar/overview ruler visuals
    overviewRulerBorder: 'transparent',
    scrollbarSliderBackground: 'transparent',
    scrollbarSliderHoverBackground: 'transparent',
    scrollbarSliderActiveBackground: 'transparent',
  };
}
```

---

## 7. Theme Application Pipeline

### Full Pipeline: Theme Engine → xterm.js Rendering

```mermaid
flowchart TD
    subgraph VSCode["VS Code Theme Engine"]
        TE["Active Color Theme<br/>(built-in or extension)"]
        CC["workbench.colorCustomizations<br/>(user overrides)"]
    end

    subgraph Injection["CSS Variable Injection"]
        TE --> INJ["Inject CSS vars into<br/>webview :root element"]
        CC --> INJ
    end

    subgraph WebView["WebView (ThemeManager)"]
        INJ --> GCS["getComputedStyle(<br/>document.documentElement)"]
        GCS --> READ["Read 20+ CSS variables"]
        READ --> BUILD["Build ITheme object"]
        LOC["Terminal location<br/>(panel/sidebar/editor)"] --> BUILD
        BUILD --> APPLY["terminal.options.theme = theme"]
    end

    subgraph XTerm["xterm.js Rendering"]
        APPLY --> RENDER["Re-render all cells<br/>with new colors"]
    end

    subgraph Watch["Theme Change Watch"]
        MO["MutationObserver<br/>on body.class"] --> |"class changes"| GCS
    end
```

### CSS Variable Reading Pipeline

```mermaid
flowchart LR
    subgraph Input["CSS :root"]
        V1["--vscode-terminal-ansiBlack: #000000"]
        V2["--vscode-terminal-ansiRed: #cd3131"]
        V3["...16 ANSI + 4 special..."]
        V4["--vscode-terminal-background: (empty)"]
    end

    subgraph Read["getComputedStyle"]
        G["getPropertyValue(varName).trim()"]
    end

    subgraph Transform["Transform"]
        T1["Non-empty → use value"]
        T2["Empty → undefined"]
        T3["Background empty →<br/>location fallback"]
    end

    subgraph Output["ITheme Object"]
        O["{ black: '#000',<br/>  red: '#cd3131',<br/>  ...,<br/>  background: panelBg }"]
    end

    V1 --> G
    V2 --> G
    V3 --> G
    V4 --> G
    G --> T1
    G --> T2
    G --> T3
    T1 --> O
    T2 --> O
    T3 --> O
```

---

## 8. Initialization Sequence

### Theme Application at Startup

```mermaid
sequenceDiagram
    participant EXT as Extension Host
    participant WV as WebView
    participant TM as ThemeManager
    participant XT as xterm.Terminal

    Note over EXT: resolveWebviewView() called
    EXT->>WV: Set webview.html (CSS vars already injected by VS Code)

    Note over WV: DOM loads, scripts execute

    WV->>TM: Initialize ThemeManager(location)
    TM->>TM: getXtermTheme(location)
    Note over TM: Read all CSS variables<br/>from :root

    TM->>TM: watchThemeChanges(callback)
    Note over TM: MutationObserver attached<br/>to document.body

    WV->>EXT: { type: 'ready' }
    EXT->>WV: { type: 'init', tabs, config }

    WV->>XT: new Terminal({ theme: currentTheme, ... })
    WV->>XT: terminal.open(container)
    Note over XT: Terminal renders with<br/>theme-matched colors

    Note over WV: Later: user switches theme...

    TM->>TM: MutationObserver fires
    TM->>TM: getXtermTheme(location)
    loop Each terminal instance
        TM->>XT: terminal.options.theme = newTheme
    end
```

---

## 9. ThemeManager Class

The `ThemeManager` is a concrete class (not an interface). It does **not** track individual terminals — instead, `applyToAll()` accepts an iterable of terminals from the caller. This keeps the ThemeManager decoupled from the state store.

```typescript
class ThemeManager {
  private location: TerminalLocation;
  private observer: MutationObserver | undefined;

  constructor(initialLocation: TerminalLocation = 'sidebar');

  /** Build theme from CSS variables. Returns Record<string, string | undefined>. */
  getTheme(): Record<string, string | undefined>;

  /** Get contrast ratio: 7 for high-contrast, 4.5 for normal themes. */
  getMinimumContrastRatio(): number;

  /** Apply theme + contrast ratio to all terminal instances. */
  applyToAll(terminals: Iterable<{ terminal: Terminal }>): void;

  /** Set body background for current location. */
  applyBodyBackground(): void;

  /** Update location. Returns true if changed. */
  updateLocation(location: TerminalLocation): boolean;

  /** Start MutationObserver on body class changes. */
  startWatching(onThemeChange: () => void): void;

  /** Disconnect MutationObserver. */
  dispose(): void;
}
```

### High-Contrast Theme Support

High-contrast themes are detected by checking for `vscode-high-contrast` or `vscode-high-contrast-light` CSS classes on `document.body`. When active:
- `getMinimumContrastRatio()` returns 7 (WCAG AAA) instead of 4.5 (WCAG AA)
- The higher ratio ensures text remains readable in high-contrast themes

---

## 10. File Location

```
src/webview/theme/ThemeManager.ts
```

### Dependencies
- `@xterm/xterm` — `Terminal` type
- Browser APIs — `getComputedStyle`, `MutationObserver`

### Dependents
- `main.ts` — creates ThemeManager, calls `applyToAll()`, `applyBodyBackground()`
- `TerminalFactory` — reads `getTheme()` and `getMinimumContrastRatio()` during terminal creation
- `ResizeCoordinator` — triggers `updateLocation()` via callback when container aspect ratio changes
