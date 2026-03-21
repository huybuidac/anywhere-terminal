# Review Round 1 — add-drag-drop-path

**Date:** 2026-03-19T23:27:33Z
**Reviewable Lines:** 384
**Agents Spawned:** cf-review-logic (openai/gpt-5.4), cf-review-frontend (openai/gpt-5.4)
**Agents Skipped:** cf-review-data-security (no DB/storage/auth/API surface changes), cf-review-contracts (no schema or API contract changes)

## VERDICT: WARN

**Blocking:** 0 | **Warnings:** 2 | **Suggestions:** 1

## Findings

### [W1] Explorer context command does not target the actual active terminal PTY
- Severity: WARN
- Priority: P1
- Agent: orchestrator
- File: `src/extension.ts:317`
- Evidence: The new `anywhereTerminal.insertPath` command resolves its destination via `getFocusedProvider().getActiveSessionId()`, but `TerminalViewProvider.getActiveSessionId()` only returns the active root tab from `getTabsForView()` and has no knowledge of split-pane focus or editor terminals.
- Impact: In split layouts the inserted path can go to the wrong PTY, and when an editor terminal is the active terminal the command can no-op or target a stale sidebar/panel session instead of the active terminal PTY promised by the change.
- Status: pending
- Triage: ""

### [W2] Change artifacts still promise Finder/OS drag support that the implementation cannot provide
- Severity: WARN
- Priority: P4
- Agent: orchestrator
- File: `cyberk-flow/changes/add-drag-drop-path/specs/drag-drop-path-insertion/spec.md:9`
- Evidence: The proposal/spec/tasks still describe successful OS file manager/Finder drops, while the same change's research/discovery notes conclude extension webviews cannot access native file paths for those drops and the implemented approach is effectively Explorer Shift+drag plus Explorer context menu.
- Impact: The change is not compliant with its own saved intent/specs, leaving reviewers and future implementers with incorrect acceptance criteria.
- Status: pending
- Triage: ""

### [S1] No automated coverage for the extension-host insertPath routing path
- Severity: SUGGEST
- Priority: P5
- Agent: orchestrator
- File: `src/extension.ts:305`
- Evidence: The new command path is untested; the added test file exercises only `DragDropHandler` in jsdom and does not cover extension-host routing, multi-select command arguments, split-pane targeting, or editor-terminal behavior.
- Impact: The routing regression in W1 is easy to miss and future changes to command argument handling or session targeting will not be caught automatically.
- Status: pending
- Triage: ""
