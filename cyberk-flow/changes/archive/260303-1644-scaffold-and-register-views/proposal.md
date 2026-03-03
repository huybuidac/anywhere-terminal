# Proposal: scaffold-and-register-views

## Why

The extension is currently a hello-world boilerplate. To begin Phase 1 MVP (a working terminal in the sidebar), we need:
1. **Build infrastructure** — dual-target esbuild (extension + webview), xterm.js dependencies, TypeScript DOM support
2. **VS Code registration** — view container in Activity Bar, webview view for sidebar, activation event

Without these, no subsequent task (WebviewViewProvider, xterm.js integration, PTY) can proceed.

## Appetite

**S (<=1 day)** — ~3 hours total (2h scaffolding + 1h view registration)

## Scope Boundaries

### In Scope
- Add xterm.js packages as devDependencies (`@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`)
- Update esbuild.js to dual-target build (extension CJS + webview IIFE)
- Add xterm.css copy plugin to esbuild
- Update tsconfig.json to include DOM lib
- Create `media/` directory structure
- Create `.vscodeignore` for clean VSIX packaging
- Add `viewsContainers.activitybar` entry in package.json
- Add `views.anywhereTerminal` webview view entry
- Add activation event `onView:anywhereTerminal.sidebar`
- Clean up leftover `alchemy` dependency and hello world command
- Externalize `node-pty` in esbuild

### Explicitly Cut
- WebviewViewProvider implementation (task 1.3)
- Webview HTML/JS code (task 1.5)
- node-pty integration (task 1.4)
- Panel view container (Phase 2, task 2.1)
- Commands registration beyond activation (task 2.6)
- Extension settings/configuration (Phase 3)

## Capability List

1. **Build Infrastructure** — dual-target esbuild producing `dist/extension.js` and `media/webview.js`
2. **View Registration** — sidebar terminal view visible in Activity Bar with proper icon

## Impact

- **Developers**: Can run `pnpm compile` / `pnpm watch` and get both extension and webview bundles
- **Users**: Will see AnyWhere Terminal icon in Activity Bar (view will be empty until task 1.3+)

## Risk Rating

**LOW** — All changes are configuration/scaffolding. No runtime behavior, no user data, no external services.

## UI Impact & E2E

**NO** — This change is pure infrastructure (build config, package.json metadata). No user-visible UI behavior beyond an empty view container. E2E is **NOT REQUIRED**.
