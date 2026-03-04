# Spec: xterm-init

**Parent change**: implement-webview-terminal
**Design ref**: docs/design/xterm-integration.md

## ADDED Requirements

### Requirement: Webview Entry Point

`src/webview/main.ts` SHALL be the webview entry point that initializes the terminal application on `DOMContentLoaded`. It MUST:
- Acquire VS Code API via `acquireVsCodeApi()`
- Set up the message listener (`window.addEventListener('message', ...)`)
- Send `{ type: 'ready' }` to the extension host after initialization
- Store terminal instances in a `Map<string, TerminalInstance>` keyed by tab/session ID

#### Scenario: Webview bootstrap sequence
- **Given** the webview HTML is loaded by VS Code
- **When** `DOMContentLoaded` fires
- **Then** the webview acquires `vscode` API, registers the message listener, and sends `{ type: 'ready' }`

### Requirement: Terminal Instance Creation

The webview SHALL create an xterm.js `Terminal` instance when it receives an `init` message. Each terminal MUST:
- Be constructed with options: `scrollback` from config, `cursorBlink` from config, `fontSize` from config (or 14 default), `fontFamily` ('monospace' default), `cursorStyle: 'block'`, `macOptionClickForcesSelection: true`, `drawBoldTextInBrightColors: true`, `minimumContrastRatio: 4.5`
- Load `FitAddon` and `WebLinksAddon` before opening
- Call `terminal.open(container)` on a dedicated `<div>` element inside `#terminal-container`
- Call `fitAddon.fit()` via `setTimeout(0)` after opening
- Focus the active terminal after fit

#### Scenario: First terminal created on init
- **Given** the webview has sent `ready` and receives `{ type: 'init', tabs: [{ id: 'abc', name: 'Terminal 1', isActive: true }], config: { fontSize: 14, cursorBlink: true, scrollback: 10000 } }`
- **When** the init handler processes the message
- **Then** an xterm.js Terminal is created with the specified config, opened in a new container div, fitted, focused, and stored in the terminals map

### Requirement: Terminal Instance Interface

Each terminal instance SHALL conform to the `TerminalInstance` structure:
```typescript
interface TerminalInstance {
  id: string;
  name: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  webLinksAddon: WebLinksAddon;
  container: HTMLDivElement;
}
```

#### Scenario: Terminal instance structure
- **Given** a terminal is created from an init or tabCreated message
- **Then** the instance stored in the map MUST have all fields populated: `id`, `name`, `terminal`, `fitAddon`, `webLinksAddon`, `container`
