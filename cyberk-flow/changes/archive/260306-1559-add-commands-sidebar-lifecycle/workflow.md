# Workflow State: add-commands-sidebar-lifecycle

> **Source of truth:** Workflow stages/gates → this file · Task completion → `tasks.md`

## Plan

- [x] 1. Context Review
- [x] 2. Discovery
- [x] **Gate: user approved direction**
- [x] 3. Proposal
  - [x] **MANDATORY** UI Impact & E2E decision recorded in `proposal.md`
- [x] 4. Specs
- [x] **Gate: user approved specs**
- [x] 5. Architecture Review _(skip if LOW risk + no cross-cutting + no new deps)_
  - [x] Design doc created (or skip reason noted)
  - [-] Spikes completed (if HIGH risk items exist) — N/A, no HIGH risk items
- [x] **Gate: architecture reviewed** _(if applicable)_
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

Complexity: standard — 3 capabilities (commands registration, secondary sidebar, view lifecycle resilience), 10+ files affected across package.json, extension.ts, providers, session manager. Cross-cutting concerns between PTY lifecycle and webview lifecycle.

Fastlane: auto-chose direction — commands registration is straightforward from REQUIREMENT.md FR-40..FR-45; secondary sidebar uses "Move View" approach since `contribSecondarySideBar` is still proposed API per REQUIREMENT.md §6.1; view lifecycle resilience follows existing design in flow-view-lifecycle.md with retainContextWhenHidden=true as primary strategy and scrollback cache as fallback.

Fastlane: auto-approved specs — all specs align with existing design docs and extend existing patterns.

Fastlane: skipped architecture review design doc — LOW risk, no new dependencies, patterns follow existing codebase conventions. All capabilities extend existing SessionManager/TerminalViewProvider patterns.

Fastlane: auto-approved plan — 10 tasks across 3 tracks, appetite M (<=3d).

**Retrospective:**
- **Estimate vs Actual**: Appetite was M (<=3d), took ~1 day
- **What worked**: Fastlane mode enabled rapid progression through all stages; existing design patterns provided clear implementation path; comprehensive test coverage caught issues early
- **What to improve**: Could have batched some smaller tasks for efficiency; secondary sidebar implementation was simpler than anticipated

## Revision Log

| Date | Phase | What Changed | Why |
| ---- | ----- | ------------ | --- |
| 2026-03-06 | Context Review | Scaffolded change, classified as standard | 3 capabilities, 10+ files, cross-cutting |
| 2026-03-06 | Discovery | Completed codebase analysis | Identified existing patterns, gaps, and design alignment |
| 2026-03-06 | Proposal | Defined scope and appetite M | 3 sub-tasks ~7h total |
| 2026-03-06 | Specs | Created 3 spec files | commands-registration, secondary-sidebar, view-lifecycle-resilience |
| 2026-03-06 | Architecture Review | Skipped — LOW risk | No new deps, follows existing patterns |
| 2026-03-06 | Tasks | Created 10 tasks across 3 tracks | Dependency-aware parallel execution |
| 2026-03-06 | Validation | Oracle review + cf_validate passed | Plan complete and validated |
| 2026-03-06 | Implement | Task 1_1: Declared all commands and menus in package.json | 7 commands, 2 menu entries, 4 activation events |
| 2026-03-06 | Implement | Task 2_1: Added pauseOutput/resumeOutput/updateWebview to OutputBuffer | 7 new tests pass |
| 2026-03-06 | Implement | Task 1_2: Added getActiveSessionId() to TerminalViewProvider | 3 new tests pass |
| 2026-03-06 | Implement | Task 2_2: Added view-level visibility methods to SessionManager | 8 new tests pass |
| 2026-03-06 | Implement | Task 1_3: Registered all 6 command handlers in extension.ts | Commands wired with getFocusedProvider helper |
| 2026-03-06 | Implement | Task 2_3: Implemented scrollback replay in onReady | Re-creation detection, restore messages |
| 2026-03-06 | Implement | Task 3_1: Registered moveToSecondary command | Focuses sidebar then opens Move View dialog |
| 2026-03-06 | Implement | Task 2_4: Wired visibility pause/resume + PTY-anchored dispose | 4 new tests pass |
| 2026-03-06 | Implement | Task 4_1: Verify gate passed | check-types, lint, test:unit all pass (225 tests) |
| 2026-03-06 | Archive | Committed changes | feat: add-commands-sidebar-lifecycle — Commands, secondary sidebar, and view lifecycle resilience (c7a932a) |
| 2026-03-06 | Archive | Post-commit sanity check passed | 18 files changed as expected, verify gates already passed |
