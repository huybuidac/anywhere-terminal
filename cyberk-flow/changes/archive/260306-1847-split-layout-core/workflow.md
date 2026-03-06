# Workflow State: split-layout-core

> **Source of truth:** Workflow stages/gates → this file · Task completion → `tasks.md`

## Plan

- [x] 1. Context Review
- [x] 2. Discovery
- [x] **Gate: user approved direction** _(fastlane: auto-approved)_
- [x] 3. Proposal
  - [x] **MANDATORY** UI Impact & E2E decision recorded in `proposal.md`
- [x] 4. Specs
- [x] **Gate: user approved specs** _(fastlane: auto-approved)_
- [x] 5. Architecture Review _(skip if LOW risk + no cross-cutting + no new deps)_
  - [x] Design doc created (or skip reason noted)
  - [-] Spikes completed (if HIGH risk items exist) — N/A, no HIGH risk items
- [x] **Gate: architecture reviewed** _(fastlane: auto-approved)_
- [x] 6. Tasks
- [x] 7. Validation
  - [x] **MANDATORY** Oracle reviewed: plan completeness, task deps, gaps, parallelization _(never skip)_
  - [x] `cf_validate` passes (or errors justified)
- [x] **Gate: user approved plan** _(fastlane: auto-approved)_

## Implement

<!-- RULE: After completing each task, immediately mark it [x] in tasks.md AND log in Revision Log below. -->
- [x] All tasks in tasks.md are complete (update tasks.md after EACH task)
- [x] Verify Gate — run commands from `project.md` § Commands, **MUST execute and observe pass** _(mark `[-]` if N/A)_:
  - [x] Type check
  - [x] Lint
  - [x] Test
  - [-] E2E — N/A per project.md
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

- Complexity: **standard** — cross-cutting change touching data model, UI rendering, and resize handling across multiple modules
- Fastlane: auto-chose binary split tree model because it matches VS Code's GridView pattern and is simpler than n-ary trees for a 2-pane split
- Fastlane: auto-chose flexbox CSS layout because it's the standard approach for split views and matches the existing codebase style
- Fastlane: auto-chose pointer events (mousedown/mousemove/mouseup) for resize handles because it's the standard DOM drag pattern

### Retrospective
- **Estimate vs Actual**: Appetite was ≤3d, took ~1d (fastlane efficiency)
- **What worked**: Binary split tree model was the right choice, parallel task execution, Oracle feedback caught real bugs early
- **What to improve**: Knowledge extraction tool had filename length issues, could benefit from shorter titles

## Revision Log

| Date | Phase | What Changed | Why |
| ---- | ----- | ------------ | --- |
| 2026-03-07 | Context Review | Scaffolded change, classified as standard | Cross-cutting: data model + UI + resize |
| 2026-03-07 | Discovery | Analyzed VS Code GridView/SplitView patterns, existing codebase | Inform data model and resize handle design |
| 2026-03-07 | Proposal | Wrote proposal.md | Define scope and appetite |
| 2026-03-07 | Specs | Wrote 3 spec files (data-model, container-ui, resize-handles) | 10 requirements total |
| 2026-03-07 | Architecture Review | Wrote design.md with integration diagrams | MEDIUM risk, no spikes needed |
| 2026-03-07 | Tasks | Wrote tasks.md with 7 tasks across 3 tracks | Dependency graph validated |
| 2026-03-07 | Validation | Oracle review → revised tasks for persistence, pointercancel, handle assertions | Address oracle feedback |
| 2026-03-07 | Validation | cf_validate passes (1 warning fixed) | Plan approved (fastlane) |
| 2026-03-07 | Implement | Tasks 1_1, 1_2 (Track A) + 2_1, 2_2 (Track B) completed in parallel | SplitModel types/utils + SplitContainer renderer + tests |
| 2026-03-07 | Implement | Tasks 3_1, 3_2 (Track C) completed | SplitResizeHandle drag logic + tests |
| 2026-03-07 | Implement | Task 3_3 completed — main.ts integration + split.css | tabLayouts state, persistence, debouncedFit for all leaves |
| 2026-03-07 | Implement | Verify gate passed: type-check ✅, lint ✅, test (266 pass) ✅, E2E N/A | All gates green |
| 2026-03-07 | Review | Oracle: 4 must-fix — #1,3,4 by-design (infra for future split commands), #2 real bug (ratio not persisted) | Fixed #2: added updateBranchRatio + wired into onRatioChange |
| 2026-03-07 | Review | Code Review + Oracle round 2: must-fix branch index mismatch (pre-order vs DOM in-order) | Fixed: added data-branch-index attr stamped during rendering |
| 2026-03-07 | Archive | Knowledge extraction + retrospective completed | Skipped cf_learn due to filename length issues, recorded retrospective |
