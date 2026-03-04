# Change: Implement IPC Messaging (Task 1.6)

## Why
The TerminalViewProvider has stub message handlers (TODO comments) and no output buffering. Without this, the terminal cannot function — keystrokes can't reach the PTY and PTY output can't reach the webview. This is the critical integration layer connecting the already-implemented PtySession (task 1.4) and webview (task 1.5).

## Appetite
S (≤1d) — All designs are documented, message types exist, webview handling is complete. This is primarily wiring + one new class (OutputBuffer).

## Scope
- **In**:
  - Create `OutputBuffer` class (8ms flush, 64KB threshold, flow control)
  - Wire TerminalViewProvider message handlers to PtySession
  - Update extension.ts to pass PtyManager dependencies
  - Unit tests for OutputBuffer
- **Out**:
  - SessionManager (Phase 2, task 2.3)
  - Multi-tab support (Phase 2, task 2.4)
  - Scrollback cache (Phase 2, task 2.7)
  - Editor area terminal (Phase 2, task 2.2)
- **Cut list**: Scrollback cache on dispose (can buffer output only while view is alive)

## What Changes
- **New**: `src/session/OutputBuffer.ts` — output buffering + flow control
- **Modified**: `src/providers/TerminalViewProvider.ts` — wire stubs to PtySession + OutputBuffer
- **Modified**: `src/extension.ts` — pass PtyManager deps to provider

## Capabilities
- **New**: `specs/output-buffer/spec.md` — OutputBuffer with flush + flow control
- **Modified**: `specs/message-handler/spec.md` — TerminalViewProvider message wiring (delta)

## UI Impact & E2E
- **User-visible UI behavior affected?** YES — terminal will become functional (keystrokes work, output appears)
- **E2E required?** NOT REQUIRED
- **Justification**: Phase 1 terminal functionality cannot be E2E tested until all Phase 1 tasks are complete (1.1-1.7). Individual tasks are tested with unit tests. E2E is task 1.8 (Manual Testing).
- **Target user journeys**: N/A for this task

## Risk Level
LOW — All designs are documented, no new dependencies, no architectural decisions needed. OutputBuffer follows VS Code's proven pattern.

## Impact
- Affected specs: `message-handler`, `flow-control` (existing), `output-buffer` (new)
- Affected code: `src/session/OutputBuffer.ts` (new), `src/providers/TerminalViewProvider.ts`, `src/extension.ts`

## Open Questions
- None
