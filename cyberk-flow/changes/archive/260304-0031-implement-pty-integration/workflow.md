# Workflow State: <change-id>

> **Source of truth:** Workflow stages/gates → this file · Task completion → `tasks.md`

## Plan

- [x] 1. Context Review
- [x] 2. Discovery
- [ ] **Gate: user approved direction**
- [x] 3. Proposal
  - [x] **MANDATORY** UI Impact & E2E decision recorded in `proposal.md`
- [x] 4. Specs
- [ ] **Gate: user approved specs**
- [-] 5. Architecture Review — SKIPPED: design already exists in `docs/design/pty-manager.md` and `docs/design/error-handling.md`; MEDIUM risk but well-documented with VS Code reference patterns; no new external deps
  - [-] Design doc created — using existing `docs/design/pty-manager.md`
  - [-] Spikes completed — no HIGH risk items
- [-] **Gate: architecture reviewed** — N/A (using existing design)
- [x] 6. Tasks
- [x] 7. Validation
  - [x] **MANDATORY** Oracle reviewed: plan completeness, task deps, gaps, parallelization _(never skip)_
  - [x] `cf_validate` passes (or errors justified)
- [x] **Gate: user approved plan**

## Implement

<!-- RULE: After completing each task, immediately mark it [x] in tasks.md AND log in Revision Log below. -->
- [x] All tasks in tasks.md are complete (update tasks.md after EACH task)
- [x] Verify Gate — run commands from `project.md` § Commands, **MUST execute and observe pass** _(mark `[-]` if N/A)_:
  - [x] Type check
  - [x] Lint
  - [-] Test — no unit tests for this change (vscode API deps, see tasks.md notes)
  - [-] E2E — N/A per proposal
- [x] Review — Oracle (correctness / architecture / security)
- [x] Review — Code Review (style / conventions / consistency)
- [x] **Gate: all tasks done + verify passed**

## Archive

- [x] Post-merge sanity check
- [x] Extract knowledge + retrospective
- [x] Apply deltas: `cf_apply` <!-- auto-ticked by script -->
- [x] Archive change: `cf_archive` <!-- auto-ticked by script -->

## Notes

_(Key decisions, blockers, user feedback — persists across compaction)_

## Revision Log

| Date | Phase | What Changed | Why |
| ---- | ----- | ------------ | --- |
| 2026-03-04 | Plan | Created proposal, specs, tasks | Task 1.4 from PLAN.md — node-pty integration |
| 2026-03-04 | Plan | Skipped Architecture Review | Design already exists in docs/design/pty-manager.md, no new deps |
| 2026-03-04 | Plan | Oracle review completed, tasks updated | Fixed: ErrorCode as string enum, TERM_PROGRAM_VERSION via vscode API, explicit deferral of config/fallback-chain/CwdNotFoundError usage, test strategy clarified (N/A with justification — vscode API deps) |
| 2026-03-04 | Plan | cf_validate passed | No errors |
| 2026-03-04 | Impl | Tasks 1_1→3_1 completed | All 5 tasks done, type-check + lint pass |
| 2026-03-04 | Impl | Review round 1 | Oracle: 4 must-fix (shell args, kill stall, exit cleanup, env undefined). Code review: 2 must-fix (same + re-spawn guard) |
| 2026-03-04 | Impl | Fixed round 1 must-fix | Shell-specific args via getShellArgs(), grace timer 3s hard deadline, exit handler cleanup, env filtering, _hasSpawned flag |
| 2026-03-04 | Impl | Review round 2 | Both reviews: 0 must-fix. Nice-to-fix: timer idempotency — auto-fixed (_killSent flag) |
| 2026-03-04 | Impl | Renamed I-prefixed interfaces | Biome naming convention: IPty→Pty, IPtyForkOptions→PtyForkOptions, IEvent→PtyEvent |
