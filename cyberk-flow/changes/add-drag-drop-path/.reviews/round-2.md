# Review Round 2 — add-drag-drop-path

**Date:** 2026-03-20T04:31:07Z
**Reviewable Lines:** 527
**Agents Spawned:** cf-review-logic (openai/gpt-5.4), cf-review-contracts (openai/gpt-5.4), cf-review-frontend (openai/gpt-5.4)
**Agents Skipped:** cf-review-data-security (no DB/storage/auth/API surface changes)

## VERDICT: WARN

**Blocking:** 0 | **Warnings:** 3 | **Suggestions:** 0

## Findings

### [W1] Explorer context command does not target the actual active terminal PTY
- Severity: WARN
- Priority: P1
- Agent: orchestrator
- File: `src/extension.ts:323`
- Evidence: `anywhereTerminal.insertPath` routes through `provider.getActiveSessionId()`, but `TerminalViewProvider.getActiveSessionId()` still reads `sessionManager.getTabsForView()`, and that API explicitly excludes split-pane sessions (`src/session/SessionManager.ts:47`, `src/session/SessionManager.ts:267-281`). When a tab is split, the focused child pane is never surfaced to the extension host, so the command still writes to the root tab session instead of the active pane PTY.
- Impact: Explorer context-menu insertion can send paths to the wrong PTY whenever the active terminal tab is split, violating the change spec's “active pane's PTY” requirement and the feature's primary UX.
- Status: pending
- Triage: ""

### [W2] Shift modifier is not enforced on drop
- Severity: WARN
- Priority: P1
- Agent: cf-review-frontend
- File: `src/webview/DragDropHandler.ts:209`
- Evidence: `onDrop()` always extracts paths and posts `{ type: "input" }` when `dataTransfer` contains a path, but it never checks `e.shiftKey`. `onDragOver()` also always calls `preventDefault()`, so ordinary drops are accepted even when the overlay is telling the user to hold Shift.
- Impact: Users can accidentally inject file paths during a normal drag/drop instead of only during the explicit Shift+drag gesture promised by the proposal, spec, and tip banner.
- Status: pending
- Triage: ""

### [W3] Change artifacts still promise Finder/OS drag support that the implementation cannot provide
- Severity: WARN
- Priority: P4
- Agent: orchestrator
- File: `cyberk-flow/changes/add-drag-drop-path/specs/drag-drop-path-insertion/spec.md:49`
- Evidence: The proposal now cuts Finder/OS file-manager drag support, but the staged spec/tasks still keep `dataTransfer.files.path` in the required extraction order and still include a Finder/File.path scenario. Source comments in `src/webview/DragDropHandler.ts:2-4` also continue to say OS file-manager drops are supported.
- Impact: The saved intent is still inconsistent with the implemented scope, so future reviewers and maintainers will inherit incorrect acceptance criteria for what this feature supports.
- Status: pending
- Triage: ""
