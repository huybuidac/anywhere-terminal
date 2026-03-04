# Workflow State: add-unit-tests

> **Source of truth:** Workflow stages/gates → this file · Task completion → `tasks.md`

## Plan

- [x] 1. Context Review
- [x] 2. Discovery
- [ ] **Gate: user approved direction**
- [x] 3. Proposal
  - [x] **MANDATORY** UI Impact & E2E decision recorded in `proposal.md`
- [x] 4. Specs
- [x] **Gate: user approved specs**
- [-] 5. Architecture Review _(SKIPPED: LOW risk, test-only change, no new architecture)_
  - [-] Design doc created (or skip reason noted)
  - [-] Spikes completed (if HIGH risk items exist)
- [-] **Gate: architecture reviewed** _(skipped — LOW risk)_
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
  - [x] Lint (2 warnings — env var naming in test data, acceptable)
  - [x] Test
  - [-] E2E (N/A per proposal)
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
| 2026-03-04 | Context Review | Scaffolded change, read all source files | Initial setup |
| 2026-03-04 | Discovery | Inventoried testable logic, compared frameworks | Inform test strategy |
| 2026-03-04 | Proposal | Defined scope S, cut TerminalViewProvider/webview | Focus on testable pure logic |
| 2026-03-04 | Specs | 4 spec files, 16 requirements, 20 scenarios | Cover PtyManager, PtySession, errors |
| 2026-03-04 | Tasks | 7 tasks across 3 tracks (A, B, C) | Execution plan ready |
| 2026-03-04 | Validation | Oracle approved with minor notes; cf_validate 0 errors | Final check |
| 2026-03-04 | Implement | 1_1 Install Vitest + config + scripts | vitest.config.mts, package.json updated |
| 2026-03-04 | Implement | 1_2, 1_3 vscode mock + node-pty mock | src/test/__mocks__/ created |
| 2026-03-04 | Implement | 2_1, 3_1 PtyManager + PtySession tests | 51 tests passing |
| 2026-03-04 | Implement | 4_1 Error class tests | 28 tests, 100% coverage on errors.ts |
| 2026-03-04 | Implement | 5_1 Coverage config + project.md | 80% threshold, all passing (94.5% actual) |
| 2026-03-04 | Review | Oracle: 0 must-fix, 4 nice-to-fix; Code Review: approve, 1 fix | Fixed: env restore, tightened 3 assertions |
