# Change: Implement WebviewViewProvider (PLAN.md Task 1.3)

## Why
The sidebar terminal view needs a fully functional `TerminalViewProvider` that generates secure webview HTML, handles the ready handshake, wires up message handlers, and manages the view lifecycle — replacing the current placeholder stub in `extension.ts`.

## Appetite
M (≤3d)

## Scope
- **In**:
  - Extract `TerminalViewProvider` into dedicated file `src/providers/TerminalViewProvider.ts`
  - Implement `resolveWebviewView()` with proper webview options, CSP, nonce, HTML generation
  - Implement `getHtmlForWebview()` with nonce-based CSP, resource URIs, terminal container
  - Define shared message types in `src/types/messages.ts`
  - Wire `onDidReceiveMessage` router for Phase 1 messages (ready, input, resize, ack)
  - Wire `onDidDispose` and `onDidChangeVisibility` handlers
  - Update `extension.ts` to import and register the new provider
- **Out**:
  - PTY integration (task 1.4)
  - xterm.js webview code (task 1.5)
  - IPC messaging + flow control logic (task 1.6)
  - Theme integration (task 1.6a)
  - Multi-tab UI / tab management messages (Phase 2)
  - Editor area provider (Phase 2)
  - SessionManager / PtyManager implementation (task 1.4+)
- **Cut list**: TerminalEditorProvider (Phase 2), configUpdate/restore messages (Phase 2-3)

## What Changes
- **NEW** `src/providers/TerminalViewProvider.ts` — Full WebviewViewProvider implementation
- **NEW** `src/types/messages.ts` — Shared message type definitions (discriminated unions)
- **MODIFIED** `src/extension.ts` — Import and register TerminalViewProvider (remove inline class)

## Capabilities
- **New**: none (design already exists in `docs/design/webview-provider.md`, `docs/design/message-protocol.md`)
- **Modified**: none

## UI Impact & E2E
- **User-visible UI behavior affected?** YES — the webview HTML content changes (from placeholder to proper terminal container structure)
- **E2E required?** NOT REQUIRED — No user-visible interactive behavior yet; the webview renders a container div but xterm.js and PTY are wired in subsequent tasks. This task establishes the infrastructure.
- **Justification**: The webview still shows a static container (no functional terminal). Interactive behavior (input, output, resize) requires tasks 1.4-1.6 to be complete. Manual F5 testing verifies HTML loads without CSP errors.

## Risk Level
LOW — Straightforward VS Code API usage, no new dependencies, design is fully documented.

## Impact
- Affected specs: (new) webview-provider
- Affected code: `src/extension.ts`, `src/providers/TerminalViewProvider.ts`, `src/types/messages.ts`

## Open Questions
- (none — design is comprehensive in docs/design/webview-provider.md)
