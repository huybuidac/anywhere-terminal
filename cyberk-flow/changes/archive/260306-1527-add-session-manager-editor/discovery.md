# Discovery: add-session-manager-editor

## Workstreams

| # | Workstream | Used | Justification |
|---|---|---|---|
| 1 | Memory Recall | Yes | Checked for prior decisions via cf_new context |
| 2 | Architecture Snapshot | Yes | Mapped src/ structure, read all providers and session code |
| 3 | Internal Patterns | Yes | Read PtySession, OutputBuffer, PtyManager, both providers |
| 4 | External Research | Skipped | No novel libraries — all patterns are in design docs |
| 5 | Documentation | Yes | Read all 6 design docs + REQUIREMENT.md |
| 6 | Constraint Check | Skipped | No new dependencies |

## Key Findings

### Current State (Phase 1)
- `TerminalViewProvider` manages a single PTY session per view (sidebar/panel)
- `TerminalEditorProvider` manages a single PTY session per editor panel
- Both providers duplicate PTY lifecycle logic: spawn, wire events, cleanup
- Phase 2 comments (`// Phase 2: sessionManager.createSession()`) exist in both providers for `createTab`, `switchTab`, `closeTab`, `clear` message handlers
- `extension.ts` creates providers without a shared SessionManager

### Design Docs Coverage
- `docs/design/session-manager.md` — Complete design with data model, lifecycle state machine, operation queue, kill tracking, number recycling, scrollback cache, public interface
- `docs/design/webview-provider.md` — Shows how TerminalEditorProvider should use SessionManager (§7)
- `docs/design/message-protocol.md` — All message types defined, tab management messages ready
- `docs/design/flow-initialization.md` — Shows SessionManager in the init flow

### Existing Components to Reuse
- `PtySession` — wraps single PTY process, already tested
- `OutputBuffer` — per-session buffering + flow control, already tested
- `PtyManager` — shell detection, node-pty loading, already tested
- Message types in `src/types/messages.ts` — all tab management messages defined
- Error types in `src/types/errors.ts` — `SessionNotFoundError` already exists

## Gap Analysis

| Have | Need |
|---|---|
| Single PTY per view | Multi-session per view via SessionManager |
| Direct PTY management in providers | Delegated to SessionManager |
| No operation queue | Promise-chain serialization for destructive ops |
| No kill tracking | `terminalBeingKilled` Set for re-entrant protection |
| No number recycling | Gap-filling algorithm for terminal names |
| No scrollback cache | Ring buffer for view restore |
| Phase 2 stubs in providers | Full SessionManager integration |
| Editor provider creates own PTY | Editor provider delegates to SessionManager |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| SessionManager pattern | Class extending Disposable | Matches VS Code conventions, design doc spec |
| Operation queue | Promise chain serialization | From design doc, prevents race conditions |
| HTML generation sharing | Extract to shared utility function | Both providers use identical HTML generation |
| Editor viewId format | `editor-${crypto.randomUUID()}` | From design doc, unique per panel |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| Refactoring providers may break existing functionality | MEDIUM | Comprehensive unit tests for SessionManager; providers keep same external API |
| Operation queue complexity | LOW | Well-documented pattern from VS Code reference |
| Scrollback cache memory | LOW | Configurable max size with FIFO eviction |

## Open Questions

None — design docs are comprehensive and unambiguous.
