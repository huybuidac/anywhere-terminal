# AnyWhere Terminal – Technical Research

## 1. Idea overview

AnyWhere Terminal is a VS Code extension that lets you create independent terminals that can be displayed simultaneously in the Primary Sidebar, Secondary Sidebar (with a user move action), and Bottom Panel, using a custom UI (xterm.js) instead of just moving the built‑in Integrated Terminal around.[web:13][web:37]

Core architecture:
- `WebviewViewProvider` creates custom webview views in Sidebar/Panel.
- xterm.js renders the terminal UI inside the webview.
- node-pty on the extension host spawns real shells (bash/zsh/powershell, etc.).[web:21][web:58]
- `postMessage` is used as a two‑way bridge between the webview and the extension host.
- Terminal resize events (cols/rows) are synchronized between xterm.js and node-pty.

---

## 2. Feasibility with the VS Code API

### 2.1 WebviewViewProvider and placement

- VS Code lets you contribute **view containers** and **views** to:
  - The Activity Bar (Primary Sidebar) via `viewsContainers.activitybar`.
  - The Panel via `viewsContainers.panel`.[web:13]
- Views with `type: "webview"` implemented via `WebviewViewProvider` can be displayed in these containers.[web:20][web:13]
- The Secondary Sidebar (Auxiliary Bar) is currently not a view container that an extension can target directly in `package.json`; views can only be moved there by the **user** via drag and drop or the “Move View” command.[web:10][web:13]

Conclusion:
- It is fully feasible to have:
  - One or more terminal views in the Primary Sidebar.
  - One or more terminal views in the Panel.
- To have a view in the Secondary Sidebar, the extension needs to guide the user to “Move View”. You cannot guarantee placing a view into the Secondary Sidebar purely from code.

### 2.2 node-pty in VS Code extensions

- node-pty is a popular PTY library and is what VS Code itself uses for its integrated terminal.[web:21][web:26]
- VS Code allows extensions to use native modules, but that requires:
  - Building against the correct Electron/Node ABI used by VS Code.[web:15][web:18]
  - Shipping binaries for the OS/architectures you want to support, or reusing VS Code’s own build.

Two main strategies:

1. **Reuse VS Code’s built‑in node-pty (recommended for early stages)**
   - A common pattern is to dynamically require the `node-pty` that lives in VS Code’s `node_modules.asar` bundle:[web:18]

   ```ts
   import * as path from 'node:path';
   import * as vscode from 'vscode';

   // @ts-ignore
   const requireFunc = typeof __webpack_require__ === 'function'
     ? __non_webpack_require__
     : require;

   const modulePath = path.join(
     vscode.env.appRoot,
     'node_modules.asar',
     'node-pty',
   );

   export const spawnPty: typeof import('node-pty').spawn =
     requireFunc(modulePath).spawn;
   ```

   - Pros: no native build pipeline, no separate binaries to ship.
   - Cons: not public API; may break if VS Code changes its internal layout.[web:18]

2. **Vendor your own node-pty (more official, more complex)**
   - Build node-pty using `@electron/rebuild` or similar tools that match VS Code’s Electron version.[web:15]
   - Mark `node-pty` as external in esbuild/webpack so its `.node` binaries are not bundled; ensure the `node-pty` folder is included in the `.vsix`.[web:3][web:9][web:18]

### 2.3 Is postMessage fast enough for terminal I/O?

- xterm.js + node-pty over WebSocket is widely used for web terminals and is fast enough for real shells and TUIs, even though WebSocket is slower than local `postMessage`.[web:5][web:58]
- VS Code’s `webview.postMessage` is backed by Chromium’s messaging and is used by many extensions for real‑time UIs (previews, dashboards, etc.).[web:20]

Best practices:
- Buffer node-pty output and flush at small intervals (e.g. ~16 ms) to avoid message spam.
- Debounce resize events (~50–100 ms).
- Use simple string payloads for the terminal stream to avoid heavy JSON structures.

Conclusion: with reasonable batching, performance is sufficient for real‑world terminal usage.

---

## 3. Existing solutions & references

### 3.1 Existing extensions

- **Secondary Terminal** (s-hiraoku.vscode-sidebar-terminal):
  - Marketplace description: a full‑featured terminal inside the VS Code sidebar with navigation, session restore, AI agent detection, etc.[web:37][web:23]
  - Proves that the “terminal in sidebar” model is practical and in demand.

- **vscode-sidebar-terminal (agusmakmun)**:
  - Repository shows how to use the Webview View API to create a view in the sidebar and interact with VS Code’s default terminal.[web:30][web:32]
  - Useful for understanding `viewsContainers`, `views` configuration and high‑level extension structure.

- Other sample sidebar webview extensions (e.g. `denyocrworld/vscode-extension-with-sidebar-webview`, `KumarVariable/vscode-extension-sidebar-html`) demonstrate how to create WebviewViews and manage HTML/JS assets.[web:31][web:33]

### 3.2 xterm.js + node-pty integration examples

- Web terminal tutorials using xterm.js + node-pty + WebSocket follow the pattern:
  - Frontend (xterm.js) sends keypresses → server.
  - Server forwards them to node-pty.
  - node-pty output is streamed back to the client and rendered by xterm.[web:5][web:58]
- Several Electron terminal examples also use xterm.js + node-pty in a way that is very close to how a VS Code webview would communicate via `postMessage`.[web:58][web:27]

These patterns confirm that the xterm.js ↔ node-pty ↔ transport bridge architecture is industry standard.

---

## 4. Main technical challenges

### 4.1 Bundling node-pty with esbuild

If you use VS Code’s node-pty:
- Mark `node-pty` as external in esbuild to avoid bundling it.
- Use the dynamic require from `vscode.env.appRoot/node_modules.asar/node-pty` shown above.[web:18]

Example esbuild script:

```jsonc
{
  "scripts": {
    "bundle": "esbuild ./src/extension.ts --bundle --outfile=out/main.js --external:vscode --external:node-pty --format=cjs --platform=node"
  }
}
```
[web:3][web:9]

If you vendor your own node-pty:
- Build the native module for the correct Electron version.[web:15]
- Include `node_modules/node-pty` (or a similar path) in the `.vsix` and do not ignore it in `.vscodeignore`.[web:3][web:18]
- `require('node-pty')` will then load it at runtime.

### 4.2 Webview ↔ node-pty bridge & lifecycle

Extension side skeleton:

```ts
import * as vscode from 'vscode';
import { spawnPty } from './pty';

interface TerminalSession {
  id: string;
  pty: import('node-pty').IPty;
  view?: vscode.WebviewView;
}

const sessions = new Map<string, TerminalSession>();

export function activate(context: vscode.ExtensionContext) {
  const provider = new AnywhereTerminalViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'anywhereTerminal.sidebarPrimary',
      provider,
    ),
    vscode.window.registerWebviewViewProvider(
      'anywhereTerminal.panel',
      provider,
    ),
  );
}

class AnywhereTerminalViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly extUri: vscode.Uri) {}

  resolveWebviewView(
    view: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extUri, 'media')],
    };

    view.webview.html = getHtml(view.webview, this.extUri);

    const sessionId = createSession(view);

    view.webview.onDidReceiveMessage((msg) => {
      const session = sessions.get(sessionId);
      if (!session) return;

      switch (msg.type) {
        case 'data':
          session.pty.write(msg.data);
          break;
        case 'resize':
          session.pty.resize(msg.cols, msg.rows);
          break;
        case 'dispose':
          disposeSession(sessionId);
          break;
      }
    });

    view.onDidDispose(() => {
      disposeSession(sessionId);
    });
  }
}

function createSession(view: vscode.WebviewView): string {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

  const pty = spawnPty(shell, [], {
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: process.env,
  });

  const session: TerminalSession = { id, pty, view };
  sessions.set(id, session);

  pty.onData((data) => {
    session.view?.webview.postMessage({ type: 'data', data });
  });

  pty.onExit(() => {
    session.view?.webview.postMessage({ type: 'exit' });
    sessions.delete(id);
  });

  return id;
}

function disposeSession(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  session.pty.kill();
  sessions.delete(id);
}
```

Webview side:

```js
const vscode = acquireVsCodeApi();

const term = new Terminal({ cursorBlink: true });
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);

term.open(document.getElementById('terminal'));

term.onData((data) => {
  vscode.postMessage({ type: 'data', data });
});

window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'data':
      term.write(msg.data);
      break;
    case 'exit':
      term.write('\r\n[process exited]\r\n');
      break;
  }
});

function fitAndNotify() {
  fitAddon.fit();
  const { cols, rows } = term;
  vscode.postMessage({ type: 'resize', cols, rows });
}

window.addEventListener('resize', () => fitAndNotify());
setTimeout(fitAndNotify, 0);
```

Lifecycle notes:
- Each WebviewView ↔ one PTY; clean up both whenever either side disposes/exits.
- To support session persistence later, store session metadata (ID, shell, cwd) in `workspaceState`.

### 4.3 Copy/paste, keybindings, interactions

- xterm.js supports copy/paste, selection, context menu, and many standard key combinations out of the box as long as the terminal element has focus and you do not block the default browser events.[web:8][web:24]
- Inside a webview, `Ctrl/Cmd+C/V` behavior follows browser rules; xterm.js hooks into them for clipboard handling.
- You can add a custom context menu inside the webview (Copy, Paste, Select All, Clear) and map these to xterm’s APIs.
- If you need deeper integration with VS Code (e.g. share the editor clipboard), you can postMessage back to the extension host and call `vscode.commands.executeCommand('editor.action.clipboardCopyAction')`, but most use cases work fine with xterm’s own clipboard handling.

### 4.4 Theming – matching VS Code themes

- VS Code injects theme CSS variables into webviews, e.g. `--vscode-editor-foreground`, `--vscode-terminal-foreground`, `--vscode-terminal-background`, etc.[web:42][web:53][web:54]
- You can use them directly in the webview’s CSS:

```css
html, body {
  height: 100%;
}

.terminal-root {
  height: 100%;
  background-color: var(--vscode-terminal-background, #000);
  color: var(--vscode-terminal-foreground, #fff);
}

.xterm {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: var(--vscode-editor-font-size, 13px);
}
```

- Also use the `vscode-light`, `vscode-dark`, and `vscode-high-contrast` classes on `<body>` for additional tweaks if needed.[web:42]

### 4.5 Session lifecycle management

- Maintain a mapping `viewId` → `sessionId` so you know which session is attached to each view.
- Allow users to create multiple sessions within the same view (tabs or dropdown):
  - `webview → extension`: `createSession`, `switchSession(id)`, `killSession(id)`.
  - `extension → webview`: `sessionCreated`, `sessionList`, `sessionExited`.
- Clean up when:
  - The user closes a view.
  - The PTY exits (send a notification to the webview, allow creating a new session in the same view).

---

## 5. Development plan (overview)

### Phase 1 – MVP (1 terminal in 1 sidebar view)

- Scaffold the extension (TypeScript, esbuild).
- Contribute `viewsContainers.activitybar` + a `anywhereTerminal.sidebarPrimary` view.
- Integrate a simple xterm.js terminal in the webview and connect it to node-pty (reusing VS Code’s built‑in node-pty).
- Handle basic I/O and resize.

### Phase 2 – Multi-location

- Add `viewsContainers.panel` and the `anywhereTerminal.panel` view.
- Each view instance ↔ one PTY.
- Guide users to use “Move View” to place a view into the Secondary Sidebar.

### Phase 3 – Polish & advanced features

- Theming: apply `--vscode-terminal-*` variables with configuration overrides.
- Settings: default shell, scrollback, font, behavior.
- Multiple sessions/tabs per view.
- Session persistence via `workspaceState`.

### Phase 4 – Release & CI/CD

- Finalize bundling with esbuild, use `vsce package` and publish.[web:3]
- Write README, screenshots, and usage guide.
- Set up GitHub Actions: build, test, package, and optionally publish on tags.

---

## 6. Dependencies, APIs, and tooling

### 6.1 npm packages

Core:
- `vscode` – VS Code extension API typings.[web:20]
- `xterm` + addons (`xterm-addon-fit`, optional `xterm-addon-web-links`, `xterm-addon-search`, `xterm-addon-serialize`).[web:8][web:24]
- `node-pty` – PTY backend.[web:21]

Tooling:
- `esbuild` – bundler.[web:3][web:9]
- `typescript`, `@types/node`.
- `vsce` – extension packaging and publishing.[web:3]
- Optional: `@electron/rebuild` if you decide to build node-pty yourself.[web:15]

### 6.2 VS Code APIs to know well

- Webview & Webview View:
  - `WebviewViewProvider`, `registerWebviewViewProvider`, `WebviewView`, `Webview.postMessage`, `webview.onDidReceiveMessage`.[web:20]
- Views / layout:
  - `viewsContainers`, `views` contribution points; behavior of Activity Bar, Panel, Secondary Sidebar.[web:13][web:10]
- Theming:
  - Theme Color reference and webview CSS variables.[web:54][web:42][web:53]
  - `vscode.window.onDidChangeActiveColorTheme` if you want to push theme info into the webview via messages.
- State & configuration:
  - `ExtensionContext.globalState`, `ExtensionContext.workspaceState`.
  - `workspace.getConfiguration('anywhereTerminal')`.

### 6.3 Dev tools & debugging

- Extension Development Host (F5) with a `launch.json` that runs esbuild as a `preLaunchTask`.[web:20]
- `Developer: Open Webview Developer Tools` to debug xterm.js and your front‑end JS.
- `console.log` on the extension side (Debug Console) and in the webview (DevTools console).
- Cross‑platform testing (Windows, macOS, Linux), because node-pty and shells behave differently on each platform.[web:21]
