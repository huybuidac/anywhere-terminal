# Discovery: add-commands-sidebar-lifecycle

## Workstreams

| # | Workstream | Used | Justification |
|---|---|---|---|
| 1 | Memory Recall | Yes | Checked for prior decisions on commands, secondary sidebar, lifecycle |
| 2 | Architecture Snapshot | Yes | Mapped src/ structure, SessionManager, TerminalViewProvider, extension.ts |
| 3 | Internal Patterns | Yes | Read existing command registration, provider patterns, scrollback cache |
| 4 | External Research | No | No novel libraries — all VS Code Extension API |
| 5 | Documentation | No | Design docs already comprehensive |
| 6 | Constraint Check | Yes | Read package.json for existing commands, engines, activation events |

## Key Findings

### Commands Registration (Task 2.6)
- **Current state**: Only `anywhereTerminal.newTerminalInEditor` is registered in package.json and extension.ts
- **Gap**: 5 additional commands needed (newTerminal, killTerminal, clearTerminal, focusSidebar, focusPanel)
- **Pattern**: Commands registered via `vscode.commands.registerCommand()` in `extension.ts`, declared in `package.json` `contributes.commands`
- **View toolbar**: Need `menus.view/title` entries for + (new) and trash (kill) icons

### Secondary Sidebar (Task 2.5)
- **VS Code API status**: `contribSecondarySideBar` is still a proposed API (REQUIREMENT.md §6.1 notes this for VS Code 1.104+). Extension targets `^1.107.0`.
- **Decision**: Use "Move View" approach — document instructions for users. Add a `moveToSecondary` command that focuses the view and executes `workbench.action.moveView`.
- **No new view container needed** — user drags existing sidebar view to secondary sidebar.

### View Lifecycle Resilience (Task 2.7)
- **Current state**: `retainContextWhenHidden: true` is already set for both sidebar and panel views
- **Scrollback cache**: Already implemented in SessionManager (`appendToScrollback`, `scrollbackCache`, `scrollbackSize`, `SCROLLBACK_MAX_SIZE = 512KB`)
- **Visibility handling**: `onDidChangeVisibility` already wired in TerminalViewProvider — sends `viewShow` message
- **Dispose handling**: `onDidDispose` already calls `destroyAllForView(viewId)`
- **Gap**: Missing scrollback replay on webview re-creation (the `ready` handler always creates a new session instead of restoring existing ones). Need to detect existing sessions and send `restore` messages.
- **Gap**: Missing pause/resume output flushing on visibility changes (OutputBuffer doesn't have pause/resume for view-level visibility)

## Gap Analysis

| Have | Need |
|---|---|
| 1 command registered (newTerminalInEditor) | 6 additional commands + 1 moveToSecondary |
| Commands in extension.ts | Command declarations in package.json contributes.commands |
| No view/title menus | Menu entries for new terminal (+) and kill terminal (trash) |
| retainContextWhenHidden=true | Already set — primary lifecycle strategy |
| Scrollback cache in SessionManager | Scrollback replay on webview re-creation |
| onDidChangeVisibility sends viewShow | Pause/resume output flushing on visibility |
| onDidDispose calls destroyAllForView | Already implemented |
| No secondary sidebar support | moveToSecondary command + user documentation |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Secondary sidebar API | "Move View" approach | Proposed API not finalized; user can drag view |
| Scrollback replay trigger | Detect existing sessions in `onReady` | If sessions exist for viewId, send restore instead of creating new |
| Output pause on hide | Add view-level visibility tracking to SessionManager | OutputBuffer already has pause/resume via flow control; extend for view visibility |
| Command scope | All 6 commands from REQUIREMENT.md FR-40..FR-45 + moveToSecondary | Complete the command surface area |

## Risks & Constraints

| Risk | Level | Mitigation |
|---|---|---|
| Secondary sidebar API may change | LOW | Using stable "Move View" approach, not proposed API |
| Scrollback replay may show stale data | LOW | Cache is continuously updated; join and write is atomic |
| Output pause/resume interaction with flow control | LOW | View-level pause is orthogonal to flow control pause |

## Open Questions

None — all questions resolved via design docs and codebase analysis.
