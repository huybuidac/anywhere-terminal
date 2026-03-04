# Change: Implement node-pty Integration (PLAN.md Task 1.4)

## Why
The extension needs a PTY backend to spawn shell processes and communicate with them. Without this, the terminal webview has no shell to connect to. This is the critical backend piece that bridges the Extension Host to actual OS shell processes.

## Appetite
S (<=1d) — design is fully documented, patterns are clear from VS Code source, scope is narrow (2 files + 1 error types file).

## Scope
- **In**:
  - `PtyManager` singleton: load node-pty from VS Code internals, detect shell, build environment, resolve CWD
  - `PtySession` class: wrap a single PTY process with spawn/write/resize/kill + graceful shutdown
  - Error types: `PtyLoadError`, `ShellNotFoundError`, `SpawnError`, `CwdNotFoundError`
  - Shell detection with fallback chain (macOS only)
  - esbuild compatibility (`module.require` pattern for dynamic require)
- **Out**:
  - SessionManager (Phase 2, task 2.3)
  - Output buffering / flow control (task 1.6)
  - Wiring PTY to TerminalViewProvider message handler (task 1.6)
  - Windows/Linux shell detection
  - Shell integration injection (VS Code-specific feature, out of MVP scope)

- **Cut list**: Drop CWD validation from user config setting (simplify to workspace root or $HOME only)
- **Deferred**:
  - User config for shell (`anywhereTerminal.shell.macOS`, `anywhereTerminal.shell.args`) → Phase 3, task 3.2
  - User config for CWD (`anywhereTerminal.defaultCwd`) → Phase 3, task 3.2
  - Spawn fallback chain (retry with next shell on failure) → task 1.6 (SessionManager wiring)
  - User-facing error display in terminal → task 1.6 (SessionManager wiring)

## What Changes
- New file `src/pty/PtyManager.ts` — singleton for node-pty loading, shell detection, env building, CWD resolution
- New file `src/pty/PtySession.ts` — wraps a single PTY process with lifecycle management
- New file `src/types/errors.ts` — custom error classes for PTY-related failures

## Capabilities
- **New**: `specs/pty-integration/spec.md`

## UI Impact & E2E
- **User-visible UI behavior affected?** NO
- **E2E required?** NOT REQUIRED
- **Justification**: Pure backend/infrastructure — no UI changes. PTY processes are spawned and managed entirely in the Extension Host. No webview or UI interaction involved.

## Risk Level
MEDIUM — Dynamic require of VS Code internal `node-pty` is the main risk (path may vary across VS Code versions). Design already includes fallback paths and has been validated by reference projects.

## Impact
- Affected specs: None existing (new capability)
- Affected code: `src/pty/` (new), `src/types/errors.ts` (new)

## Open Questions
- [x] Should we validate shell executables with `fs.accessSync(path, X_OK)` or just `fs.existsSync`? → Design says both (existsSync + mode check). Follow design.
- [x] Should `PtySession` own its output buffer? → No, per design, output buffering is a separate concern (task 1.6). PtySession exposes `onData` event only.
