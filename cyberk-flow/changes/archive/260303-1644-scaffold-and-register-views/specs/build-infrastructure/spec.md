# Spec: Build Infrastructure

## ADDED Requirements

### Requirement: Dual-Target esbuild Build

The build system SHALL produce two separate bundles from a single TypeScript codebase:
- **Extension bundle**: `dist/extension.js` — CJS format, Node.js platform, target `node18`, externals: `vscode` and `node-pty`
- **WebView bundle**: `media/webview.js` — IIFE format, browser platform, target `es2020`, no externals (all deps bundled)

Both targets MUST build in parallel via `esbuild.context()` in watch mode.

#### Scenario: Production build generates both bundles

Given the developer runs `node esbuild.js --production`
Then `dist/extension.js` MUST exist and be minified CJS
And `media/webview.js` MUST exist and be minified IIFE
And no sourcemaps are generated

#### Scenario: Watch mode rebuilds incrementally

Given the developer runs `node esbuild.js --watch`
When a file in `src/webview/` changes
Then only the webview bundle is rebuilt
And the extension bundle is not rebuilt

### Requirement: xterm.js Dependencies

The project SHALL declare xterm.js packages as `devDependencies` in `package.json`:
- `@xterm/xterm`
- `@xterm/addon-fit`
- `@xterm/addon-web-links`

These packages MUST NOT appear in `dependencies` (they are bundled into `media/webview.js` at build time).

#### Scenario: xterm packages are devDependencies only

Given `package.json` is inspected
Then `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links` appear in `devDependencies`
And they do NOT appear in `dependencies`

### Requirement: xterm CSS Copy

The build system SHALL copy `node_modules/@xterm/xterm/css/xterm.css` to `media/xterm.css` after each successful webview build.

The copy MUST be implemented as an esbuild plugin on the webview build context. The `media/` directory SHALL be created if it does not exist.

#### Scenario: xterm.css copied on build

Given `node esbuild.js` completes successfully
Then `media/xterm.css` exists and matches the content of `node_modules/@xterm/xterm/css/xterm.css`

### Requirement: TypeScript DOM Support

`tsconfig.json` SHALL include `"DOM"` in the `lib` array to support webview code that uses browser APIs (`document`, `window`, `ResizeObserver`, `navigator.clipboard`).

#### Scenario: TypeScript compiles webview code with DOM APIs

Given a `.ts` file in `src/webview/` references `document.getElementById`
Then `tsc --noEmit` SHALL not report an error

### Requirement: node-pty Externalization

The extension esbuild config SHALL list `node-pty` in the `external` array alongside `vscode`. This prevents esbuild from attempting to bundle the native module.

#### Scenario: node-pty is not bundled

Given the extension bundle is built
Then `dist/extension.js` does NOT contain inlined node-pty code
And `require('node-pty')` calls are preserved as-is in the output

### Requirement: Clean Packaging Config

A `.vscodeignore` file SHALL exist at the project root with rules that:
- Include: `dist/**`, `media/**`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`
- Exclude: `src/**`, `node_modules/**`, `docs/**`, `*.ts`, `tsconfig*.json`, `esbuild.js`, `.git/**`, `cyberk-flow/**`

#### Scenario: VSIX contains only required files

Given `vsce package` is run
Then the VSIX includes `dist/extension.js`, `media/webview.js`, `media/xterm.css`, `package.json`
And does NOT include `src/`, `node_modules/`, `docs/`, `cyberk-flow/`

### Requirement: Media Directory Structure

The project SHALL have a `media/` directory for webview build artifacts. Build-generated files (`webview.js`, `xterm.css`) SHOULD be gitignored.

#### Scenario: media directory exists after build

Given a fresh clone with `pnpm install && pnpm compile`
Then `media/webview.js` and `media/xterm.css` exist

### Requirement: Remove Leftover Dependencies

The `alchemy` package SHALL be removed from `dependencies` in `package.json`. The `dependencies` section SHOULD be empty (or removed entirely) since all runtime deps are either bundled or provided by VS Code.

#### Scenario: No leftover runtime dependencies

Given `package.json` is inspected
Then `alchemy` does NOT appear in `dependencies`
