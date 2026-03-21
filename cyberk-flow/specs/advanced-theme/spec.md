# advanced-theme Specification

## Purpose
TBD
## Requirements

### Requirement: high-contrast-support

The ThemeManager SHALL detect high-contrast themes via `document.body` class and ensure correct rendering.

- When body has class `vscode-high-contrast` or `vscode-high-contrast-light`, the theme MUST still render correctly
- Missing ANSI color CSS variables (common in high-contrast themes) SHALL result in `undefined` values in the ITheme object, allowing xterm.js to use its built-in defaults
- The `minimumContrastRatio` terminal option SHALL be set to `7` for high-contrast themes (vs `4.5` for normal themes) to ensure WCAG AAA compliance

#### Scenario: High-contrast theme applies higher contrast ratio
- Given the user switches to a high-contrast theme
- When the MutationObserver fires
- Then all terminal instances have `minimumContrastRatio` set to 7

#### Scenario: Missing ANSI colors in high-contrast theme
- Given a high-contrast theme does not define `--vscode-terminal-ansiBlue`
- When `getXtermTheme()` is called
- Then the returned theme has `blue: undefined` and xterm.js uses its default

### Requirement: font-config-application

The webview `applyConfig()` function SHALL apply `fontFamily` from config updates in addition to existing `fontSize`, `cursorBlink`, and `scrollback` fields.

- When `config.fontFamily` is a non-empty string, it SHALL be applied to `terminal.options.fontFamily`
- When `config.fontFamily` is empty string, the webview SHALL fall back to reading `--vscode-editor-font-family` CSS variable, then `'monospace'`
- After fontFamily changes, `fitAddon.fit()` MUST be called (font metrics affect cell dimensions)

#### Scenario: fontFamily applied from config update
- Given a terminal is active
- When a `configUpdate` message arrives with `{ fontFamily: "JetBrains Mono" }`
- Then all terminal instances have `fontFamily` set to "JetBrains Mono" and are re-fitted

