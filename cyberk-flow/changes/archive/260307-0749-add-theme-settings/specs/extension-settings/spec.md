# Spec: extension-settings

**Parent change**: add-theme-settings
**Design ref**: docs/design/theme-integration.md#§5, docs/PLAN.md#§3.2

## ADDED Requirements

### Requirement: settings-schema

The extension SHALL define a `contributes.configuration` section in `package.json` with the following settings:

- `anywhereTerminal.shell.macOS` (string, default `""`) — Custom shell path for macOS. Empty string means auto-detect.
- `anywhereTerminal.shell.args` (array of strings, default `[]`) — Custom shell arguments. Empty array means use defaults.
- `anywhereTerminal.scrollback` (number, default `10000`) — Maximum scrollback buffer lines.
- `anywhereTerminal.fontSize` (number, default `0`) — Font size in pixels. 0 means inherit from VS Code.
- `anywhereTerminal.fontFamily` (string, default `""`) — Font family. Empty string means inherit from VS Code.
- `anywhereTerminal.cursorBlink` (boolean, default `true`) — Whether the cursor blinks.
- `anywhereTerminal.defaultCwd` (string, default `""`) — Default working directory. Empty string means workspace root or home.

#### Scenario: Settings appear in VS Code Settings UI
- Given the extension is installed
- When the user opens Settings and searches "anywhereTerminal"
- Then all 7 settings are visible with descriptions and correct default values

### Requirement: settings-reader

The extension host SHALL provide a `readTerminalSettings()` function that reads all `anywhereTerminal.*` settings via `workspace.getConfiguration('anywhereTerminal')` and returns a resolved configuration object.

- Font size resolution chain: `anywhereTerminal.fontSize` (if >0) → `terminal.integrated.fontSize` (if >0) → `editor.fontSize` (if >0) → 14
- Font size MUST be clamped to range [6, 100]
- Font family resolution chain: `anywhereTerminal.fontFamily` (if non-empty) → `terminal.integrated.fontFamily` (if non-empty) → `editor.fontFamily` (if non-empty) → `'monospace'`
- Shell resolution: `anywhereTerminal.shell.macOS` (if non-empty) → auto-detect via PtyManager.detectShell()
- CWD resolution: `anywhereTerminal.defaultCwd` (if non-empty and valid directory) → workspace root → home directory

#### Scenario: Font size inherits from editor when set to 0
- Given `anywhereTerminal.fontSize` is 0 and `editor.fontSize` is 16
- When `readTerminalSettings()` is called
- Then the resolved fontSize is 16

#### Scenario: Font size clamped to valid range
- Given `anywhereTerminal.fontSize` is 200
- When `readTerminalSettings()` is called
- Then the resolved fontSize is 100

#### Scenario: Invalid or missing settings use safe defaults
- Given `anywhereTerminal.scrollback` is not set (or set to an invalid value)
- When `readTerminalSettings()` is called
- Then the resolved scrollback is 10000 (the default)

### Requirement: settings-change-listener

The extension host SHALL listen for configuration changes via `workspace.onDidChangeConfiguration` and push updated config to all active webviews via `configUpdate` messages.

- The listener MUST check `e.affectsConfiguration('anywhereTerminal')` before processing
- The listener MUST also check `e.affectsConfiguration('editor.fontSize')`, `e.affectsConfiguration('editor.fontFamily')`, `e.affectsConfiguration('terminal.integrated.fontSize')`, and `e.affectsConfiguration('terminal.integrated.fontFamily')` since these affect font resolution
- Changed config SHALL be sent as a `ConfigUpdateMessage` with only the changed fields

#### Scenario: Changing fontSize pushes update to webview
- Given a terminal is active in the sidebar
- When the user changes `anywhereTerminal.fontSize` from 0 to 16
- Then a `configUpdate` message with `{ fontSize: 16 }` is sent to the sidebar webview

#### Scenario: Config changes apply to existing terminals
- Given terminals are active in sidebar and panel
- When the user changes `anywhereTerminal.cursorBlink` to false
- Then both sidebar and panel webviews receive `configUpdate` with `{ cursorBlink: false }`

#### Scenario: Unrelated config changes do not trigger updates
- Given a terminal is active
- When the user changes `editor.wordWrap` (unrelated setting)
- Then no `configUpdate` message is sent

### Requirement: settings-replace-hardcoded

Both `TerminalViewProvider.onReady()` and `TerminalEditorProvider.onReady()` SHALL use `readTerminalSettings()` instead of hardcoded `{ fontSize: 14, cursorBlink: true, scrollback: 10000 }` when constructing the `init` message config.

#### Scenario: Init message uses resolved settings
- Given `anywhereTerminal.scrollback` is set to 5000
- When a new terminal view is created
- Then the `init` message config contains `scrollback: 5000`

### Requirement: terminal-config-interface

The `TerminalConfig` interface SHALL be defined to include all terminal configuration fields:
```typescript
interface TerminalConfig {
  fontSize: number;
  cursorBlink: boolean;
  scrollback: number;
  fontFamily: string;
}
```

#### Scenario: fontFamily propagated in init message
- Given `anywhereTerminal.fontFamily` is "Fira Code"
- When a terminal is initialized
- Then the init message config contains `fontFamily: "Fira Code"`
