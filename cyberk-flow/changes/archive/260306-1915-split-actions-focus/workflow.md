# Workflow State: <change-id>

> **Source of truth:** Workflow stages/gates → this file · Task completion → `tasks.md`

## Plan

- [x] 1. Context Review
- [x] 2. Discovery
- [x] **Gate: user approved direction** (Fastlane: auto-approved)
- [x] 3. Proposal
  - [x] **MANDATORY** UI Impact & E2E decision recorded in `proposal.md`
- [x] 4. Specs
- [x] **Gate: user approved specs** (Fastlane: auto-approved)
- [x] 5. Architecture Review _(skip: LOW risk, no new deps, patterns exist in codebase)_
  - [x] Design doc created (or skip reason noted) — SKIPPED: LOW risk, all patterns exist
  - [-] Spikes completed (if HIGH risk items exist) — N/A
- [-] **Gate: architecture reviewed** — N/A (skipped)
- [x] 6. Tasks
- [x] 7. Validation
  - [x] **MANDATORY** Oracle reviewed: plan completeness, task deps, gaps, parallelization _(never skip)_
  - [x] `cf_validate` passes (or errors justified)
- [x] **Gate: user approved plan** (Fastlane: auto-approved)

## Implement

<!-- RULE: After completing each task, immediately mark it [x] in tasks.md AND log in Revision Log below. -->
- [x] All tasks in tasks.md are complete (update tasks.md after EACH task)
- [x] Verify Gate — run commands from `project.md` § Commands, **MUST execute and observe pass** _(mark `[-]` if N/A)_:
  - [x] Type check
  - [x] Lint
  - [x] Test
  - [-] E2E
- [x] Review — Oracle (correctness / architecture / security)
- [x] Review — Code Review (style / conventions / consistency)
- [x] **Gate: all tasks done + verify passed**

## Archive

- [x] Post-merge sanity check
- [x] Extract knowledge + retrospective
- [x] Apply deltas: `cf_apply` <!-- auto-ticked by script -->
- [x] Archive change: `cf_archive` <!-- auto-ticked by script -->

## Notes

Complexity: **standard** — cross-cutting change touching extension host (commands, package.json), IPC messages, and webview (split actions, focus tracking, CSS). 10+ files affected, new IPC message types, new commands.

Fastlane: auto-proceeding through all stages without user gates.

### Retrospective

**Estimate vs Actual**: Appetite was M (<=3d), took ~1 day
**What worked**: 
- Parallel task tracks enabled efficient implementation
- Existing patterns for commands, IPC, and DOM manipulation made implementation straightforward
- Oracle review caught important dependency issue early (1_1→1_2 removed)
- Code review caught PTY resource leak that would have been hard to debug later

**What to improve**: 
- Delta spec initially used MODIFIED instead of ADDED for new function, causing cf_apply failure
- Could have been more explicit about PTY cleanup requirements in original specs

## Revision Log

| Date | Phase | What Changed | Why |
| ---- | ----- | ------------ | --- |
| 2026-03-07 | Context Review | Scaffolded change, classified as standard | Cross-cutting split actions + focus management |
| 2026-03-07 | Discovery | Completed architecture snapshot, memory recall, internal patterns | All context gathered from codebase |
| 2026-03-07 | Proposal | Appetite M, E2E NOT REQUIRED | Webview extension, unit tests sufficient |
| 2026-03-07 | Specs | 5 capability specs written | split-commands, split-ipc-messages, split-model-remove, split-ui-controls, split-focus-management |
| 2026-03-07 | Architecture Review | Skipped | LOW risk, all patterns exist in codebase |
| 2026-03-07 | Tasks | 7 tasks across 3 tracks | Parallelized data model + IPC + manifest; sequential integration |
| 2026-03-07 | Validation | Oracle reviewed, cf_validate passed | Removed 1_1→1_2 dep per oracle; added activePaneId persistence/restore to 3_3 |
| 2026-03-07 | Implement | Tasks 1_1, 1_2, 2_1 complete | removeLeaf + tests (4 scenarios pass), IPC types added, package.json commands/keybindings/menus |
| 2026-03-07 | Implement | Tasks 3_1, 3_2, 3_3, 4_1 complete | Extension commands registered, IPC handlers wired, split/unsplit logic, focus management with persistence, all verify gates pass |
| 2026-03-07 | Archive | Sanity check complete | Implementation matches specs, all files accounted for |
| 2026-03-07 | Archive | Delta specs applied | 5 specs applied: +18 requirements total |
| 2026-03-07 | Archive | Knowledge extraction + retrospective | Retrospective recorded, knowledge extraction skipped (cf_learn filename issue) |
| 2026-03-07 | Archive | Change archived | Moved to archive/260306-1915-split-actions-focus/ |
