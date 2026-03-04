# theme-manager Specification

## Purpose
TBD
## Requirements

### Requirement: CSS Variable Theme Reading

The webview SHALL read VS Code CSS variables from `:root` via `getComputedStyle(document.documentElement)` to build an xterm.js `ITheme` object. It MUST map:
- 16 ANSI color variables (`--vscode-terminal-ansiBlack` through `--vscode-terminal-ansiBrightWhite`)
- `--vscode-terminal-background`, `--vscode-terminal-foreground`
- `--vscode-terminalCursor-foreground`, `--vscode-terminal-selectionBackground`
- Empty CSS variable values SHALL be treated as `undefined` (let xterm.js use defaults)

#### Scenario: Theme object built from CSS variables
- **Given** the VS Code theme sets `--vscode-terminal-ansiRed` to `#cd3131`
- **When** `getXtermTheme()` is called
- **Then** the returned theme object has `red: '#cd3131'`

### Requirement: Location-Aware Background Fallback

When `--vscode-terminal-background` is empty, the theme MUST fall back to a location-specific variable:
- Panel → `--vscode-panel-background`
- Sidebar → `--vscode-sideBar-background`
- Editor → `--vscode-editor-background`
- If all are empty, fall back to `#1e1e1e`

The location MUST be determined from the `init` message config or defaulted to `'panel'`.

#### Scenario: Sidebar terminal uses sidebar background
- **Given** `--vscode-terminal-background` is empty and `--vscode-sideBar-background` is `#252526`
- **When** theme is built for location `'sidebar'`
- **Then** `theme.background` is `#252526`

### Requirement: Theme Change Detection

The webview SHALL watch for theme changes via `MutationObserver` on `document.body` attributes (filter: `class`). When the body class changes (e.g., `vscode-dark` → `vscode-light`):
- Re-read all CSS variables
- Re-apply the theme to all terminal instances via `terminal.options.theme`

#### Scenario: Theme switch applies immediately
- **Given** two terminals exist with dark theme applied
- **When** the user switches to a light theme (body class changes to `vscode-light`)
- **Then** both terminals have their `theme` option updated with new colors from CSS variables

