# Discovery: add-status-feedback-error-handling

## Workstreams

| # | Workstream | Used? | Justification |
|---|---|---|---|
| 1 | Memory Recall | Yes | Checked for prior decisions |
| 2 | Architecture Snapshot | Yes | Mapped affected files |
| 3 | Internal Patterns | Yes | Read existing error handling, message protocol, tab bar |
| 4 | External Research | No | No novel libraries or APIs |
| 5 | Documentation | No | Existing design docs are comprehensive |
| 6 | Constraint Check | No | No new dependencies |

## Key Findings

### Status & Feedback (3.6)

1. **Process name in tab title**: `TerminalSession.name` is static ("Terminal N"). node-pty's `process` property (available on the pty object) returns the current foreground process name. Need to poll or listen for title changes. xterm.js has no built-in process name detection — this must come from the PTY side. node-pty does NOT have a `process` property on all platforms. Alternative: use OSC title sequences (programs like zsh set `\e]0;title\a`). xterm.js Terminal has `onTitleChange` event that fires when the shell sets the window title via OSC escape sequences. This is the standard approach.

2. **Exit code display**: Already implemented in webview `main.ts` line 1102. The `ExitMessage` is sent from `SessionManager` on PTY exit. The webview writes the ANSI-styled exit message. ✅ Done.

3. **Visual indicator for exited terminals**: The `TerminalInstance.exited` flag exists (line 44-46 of main.ts). Tab bar currently shows only name — no visual state indicator. Need to pass `exited` state to `renderTabBar` and style accordingly.

### Error Handling (3.7)

4. **PTY spawn failure**: `TerminalViewProvider.onReady()` catches errors and sends `ErrorMessage` to webview. But the webview only logs to console (line 1264). Need to display errors in the webview UI (toast/banner).

5. **node-pty not found**: `PtyLoadError` is thrown by `PtyManager.loadNodePty()`. Caught in `onReady()`. Error message sent to webview but not displayed to user visually.

6. **Shell not found**: `ShellNotFoundError` thrown by `PtyManager.detectShell()`. Same catch path as above.

7. **Retry mechanism**: Design doc §6.2 describes retry for transient webview message failures. `SessionManager.createSession()` does NOT have retry logic for spawn failures — the design doc says no retry for spawn (§6.3). Retry is only for `postMessage` transient failures. Current `safePostMessage` is fire-and-forget without retry.

## Gap Analysis

| Have | Need |
|---|---|
| Static tab names ("Terminal N") | Dynamic process name from OSC title sequences |
| Exit message in terminal output | Visual indicator on tab (dimmed/icon) |
| `exited` flag on TerminalInstance | Pass exited state to tab bar rendering |
| Error types defined | Display errors in webview UI (not just console.log) |
| `safePostMessage` (fire-and-forget) | Retry wrapper for transient failures |
| Error catch in onReady | Error catch in createTab/requestSplitSession handlers too |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Process name source | OSC title sequences via xterm.js `onTitleChange` | Standard mechanism, works with zsh/bash/fish. No polling needed. |
| Tab exited indicator | Dim tab text + italic + "(exited)" suffix | Lightweight CSS change, clear visual signal |
| Error display in webview | Inline error banner in terminal container | More visible than toast, contextual to the terminal |
| Retry scope | postMessage only, not PTY spawn | Per design doc §6.3 — spawn failures are configuration issues |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| OSC title not set by all shells | LOW | Fallback to "Terminal N" — no regression |
| Error banner layout conflicts | LOW | Use absolute positioning over terminal container |
