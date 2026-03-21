# Workflow State: add-cmd-delete-shortcut

> **Source of truth:** Workflow stages/gates → this file · Task completion → `tasks.md`

## Plan

- [x] 1. Context Review
- [x] 2. Discovery
- [-] **Gate: user approved direction** — trivial, auto-proceed
- [x] 3. Proposal (inline — see Notes)
  - [x] **MANDATORY** UI Impact & E2E decision: NO UI change, E2E NOT REQUIRED
- [-] 4. Specs — skip (trivial)
- [-] **Gate: user approved specs** — skip (trivial)
- [-] 5. Architecture Review — skip (LOW risk, no cross-cutting, no new deps)
- [-] **Gate: architecture reviewed** — skip (trivial)
- [x] 6. Tasks
- [x] 7. Validation — trivial, skip oracle + cf_validate (no specs)
- [x] **Gate: user approved plan**

## Implement

- [x] All tasks in tasks.md are complete
- [x] Verify Gate:
  - [x] Type check
  - [x] Lint
  - [x] Test
  - [-] E2E — N/A
- [x] Review — Oracle (0 must-fix, 1 nice-to-fix: comment wording — fixed)
- [-] Review — Code Review — skipped per user request
- [x] **Gate: all tasks done + verify passed**

## Archive

- [x] Post-merge sanity check
- [x] Extract knowledge + retrospective
- [x] Apply deltas: `cf_apply` — N/A (no specs created for trivial change)
- [x] Archive change: `cf_archive`

## Notes

Complexity: trivial — single case added to existing switch statement in InputHandler.ts

**Proposal (inline):**
- **Why**: Cmd+Delete (Cmd+Backspace) is a standard macOS shortcut for deleting to beginning of line. Terminal users expect this to kill the current input line.
- **Appetite**: S <=1d (30 min actual)
- **Scope**: Add `case "backspace"` to `createKeyEventHandler` switch that sends `\x15` (Ctrl+U = Unix kill-line) via `terminal.paste()`. Add unit test.
- **Cut**: No new interface methods needed. `terminal.paste("\x15")` reuses existing TerminalLike interface.
- **Risk**: LOW
- **UI Impact & E2E**: NO — terminal shortcut only, E2E NOT REQUIRED

## Revision Log

| Date | Phase | What Changed | Why |
| ---- | ----- | ------------ | --- |
| 2026-03-07 | Context Review | Classified as trivial | Single case in existing switch |
| 2026-03-07 | Discovery | Found InputHandler.ts pattern | Existing shortcuts use same pattern |
| 2026-03-07 | Proposal | Inline proposal in Notes | Trivial complexity |
| 2026-03-07 | Tasks | Wrote tasks.md | 2 tasks, 1 track |
| 2026-03-08 | Implement | Fixed paste→postMessage | Oracle caught bracketed paste issue; user confirmed ^U printed literally |
| 2026-03-08 | Verify | All gates pass | 355 tests, type check clean, lint clean |
