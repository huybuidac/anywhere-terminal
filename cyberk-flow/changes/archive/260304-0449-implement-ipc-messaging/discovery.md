# Discovery: Implement IPC Messaging

## 1. Feature Summary

Implement the IPC messaging layer between Extension Host and WebView for Phase 1 MVP: output buffering (8ms flush, 64KB threshold), flow control (100K/5K watermarks with PTY pause/resume), and wiring the TerminalViewProvider's message stubs to PtySession so that a single terminal session works end-to-end in the sidebar.

## 2. Workstreams Used / Skipped

| Workstream           | Used? | Justification |
| -------------------- | ----- | ------------- |
| Memory Recall        | ✅    | Searched for IPC, output buffer, flow control context |
| Architecture Snapshot | ✅    | Mapped src/ structure, identified existing components |
| Internal Patterns    | ✅    | Read PtySession, PtyManager, webview/main.ts, TerminalViewProvider |
| External Patterns    | ⏭️    | All design patterns are documented in docs/design/ — no external research needed |
| Constraint Check     | ⏭️    | No new dependencies — OutputBuffer uses existing node-pty Pty interface |
| Documentation        | ⏭️    | Comprehensive design docs already exist in docs/design/ |

## 3. Memory Recall

### Key Findings
- Output buffering design is fully specified in `docs/design/output-buffering.md`
- Flow control uses VS Code's watermark pattern: 100K high / 5K low
- Message protocol is fully specified in `docs/design/message-protocol.md`
- TerminalViewProvider currently has stub handlers (TODO comments)
- Webview side (main.ts) is fully implemented — handles all message types, ack batching

## 4. Architecture Snapshot

### Relevant Files
| File | Purpose | Status |
| ---- | ------- | ------ |
| `src/types/messages.ts` | All message type definitions | ✅ Complete |
| `src/providers/TerminalViewProvider.ts` | WebviewViewProvider with message stubs | ⚠️ Stubs only |
| `src/webview/main.ts` | Webview entry — full message handling + ack | ✅ Complete |
| `src/pty/PtySession.ts` | PTY process wrapper (spawn/write/resize/kill) | ✅ Complete |
| `src/pty/PtyManager.ts` | node-pty loading, shell detection | ✅ Complete |
| `src/session/OutputBuffer.ts` | Output buffering + flow control | ❌ Does not exist |
| `src/extension.ts` | Extension entry point | ⚠️ No PTY integration |

### Entry Points
- Extension: `src/extension.ts` → creates `TerminalViewProvider`
- WebView: `src/webview/main.ts` → `bootstrap()` → sends `ready`

## 5. Internal Patterns

### Existing Implementations
| Component | Location | Pattern |
| --------- | -------- | ------- |
| PtySession | `src/pty/PtySession.ts` | Event callbacks (onData/onExit setters), graceful shutdown |
| PtyManager | `src/pty/PtyManager.ts` | Singleton cache, shell fallback chain |
| Webview ack batching | `src/webview/main.ts` | `ackChars()` function with ACK_BATCH_SIZE=5000 |
| Message validation | `src/providers/TerminalViewProvider.ts` | Shape check + switch/case routing |

### Reusable Patterns
- `PtySession` has `pause()`/`resume()` on the Pty interface — OutputBuffer will use these
- TerminalViewProvider already has the message router structure — just needs wiring
- Message types in `src/types/messages.ts` are complete and ready to use

## 8. Gap Analysis (Synthesized)

| Component | Have | Need | Gap Size |
| --------- | ---- | ---- | -------- |
| Message types | All 16 types defined | — | None |
| Webview message handling | Full implementation | — | None |
| Output buffering | Nothing | `OutputBuffer` class with 8ms flush + 64KB threshold | **New file** |
| Flow control | Pty pause/resume API | Watermark tracking + ack handling | **New (in OutputBuffer)** |
| TerminalViewProvider wiring | Stubs with TODOs | Connect to PtySession + OutputBuffer | **Modify** |
| Extension entry point | Creates provider only | Pass PTY deps to provider | **Modify** |

## 9. Key Decisions

| Decision | Options Considered | Chosen | Rationale |
| -------- | ------------------ | ------ | --------- |
| OutputBuffer ownership | In TerminalViewProvider vs. separate class | Separate `OutputBuffer` class | Design doc specifies `src/session/OutputBuffer.ts`; keeps buffering logic testable |
| Session management for Phase 1 | Full SessionManager vs. direct PTY in provider | Direct PTY in provider | SessionManager is Phase 2 (task 2.3); Phase 1 needs only 1 session per view |
| Where to hold PTY reference | TerminalViewProvider field | TerminalViewProvider field | Simplest for single-session Phase 1; refactor to SessionManager in Phase 2 |

## 11. Risks & Constraints
- **Must**: Output buffer flush timer must be cleaned up on dispose to prevent leaks
- **Must**: Flow control must handle webview disposal mid-stream (postMessage fails silently)
- **Should**: OutputBuffer should be testable in isolation (inject Pty + postMessage dependencies)

## 12. Open Questions
- None — design is fully documented and there is only one viable approach.
