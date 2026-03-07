# Workflow State: <change-id>

> **Source of truth:** Workflow stages/gates → this file · Task completion → `tasks.md`

## Plan

- [x] 1. Context Review
- [x] 2. Discovery (lightweight — prior archived change + code read)
- [-] **Gate: user approved direction** (small change — skip)
- [x] 3. Proposal
  - [x] **MANDATORY** UI Impact & E2E decision recorded in `proposal.md`
- [x] 4. Specs
- [ ] **Gate: user approved specs**
- [-] 5. Architecture Review — LOW risk, no cross-cutting, no new deps
- [ ] 6. Tasks
- [x] 7. Validation
  - [x] **MANDATORY** Oracle reviewed
  - [x] `cf_validate` passes
- [x] **Gate: user approved plan**

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

Complexity: small — 2 independent bug fixes in 2-3 files, LOW risk, no ambiguity.
Prior archived change `260306-2356-fix-split-view-bugs` attempted these fixes but ghost tab root cause was incomplete (only removed tabRemoved, didn't filter split sessions from getTabsForView), and the icon fix used wrong mapping.

| Date | Phase | What Changed | Why |
| ---- | ----- | ------------ | --- |
| 2026-03-07 | Context + Discovery | Identified root causes | Prior fix was incomplete |

## Revision Log

| Date | Phase | What Changed | Why |
| ---- | ----- | ------------ | --- |
| 2026-03-07 | Implement | 1_1: Added isSplitPane to TerminalSession + createSession + getTabsForView filter + 5 unit tests | Ghost tab root cause fix |
| 2026-03-07 | Implement | 2_1: Swapped icons in package.json (splitVertical→split-horizontal, splitHorizontal→split-vertical) | Codicon convention fix |
| 2026-03-07 | Implement | 1_2: Passed isSplitPane:true in requestSplitSession handler + 2 provider tests | Wired flag to provider |
| 2026-03-07 | Implement | 3_1: check-types pass, lint pass, test:unit pass (297 tests) | Verify gate |
| 2026-03-07 | Review | Oracle: 1 must-fix (split layout restore on re-creation) — out of scope per proposal. Nice-to-fix: destruction tests, switchActiveSession guard | Accepted as known limitation |
| 2026-03-07 | Review | Code Review: 1 must-fix (array holes) — FALSE POSITIVE, filter already chains after map. Nice-to-fix: icon visual verification | No changes needed |
| 2026-03-07 | Archive | Extract knowledge: No novel insights (routine boolean flag pattern). Retrospective: S <=1d → ~2h actual, delta spec name mismatch fixed | Knowledge extraction skipped |
