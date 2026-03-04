# Workflow State: implement-ipc-messaging

> **Source of truth:** Workflow stages/gates → this file · Task completion → `tasks.md`

## Plan

- [x] 1. Context Review
- [x] 2. Discovery
- [x] **Gate: user approved direction**
- [x] 3. Proposal
  - [x] **MANDATORY** UI Impact & E2E decision recorded in `proposal.md`
- [x] 4. Specs
- [x] **Gate: user approved specs**
- [-] 5. Architecture Review — SKIP: LOW risk, no cross-cutting changes, no new dependencies
  - [-] Design doc created (or skip reason noted)
  - [-] Spikes completed (if HIGH risk items exist)
- [-] **Gate: architecture reviewed** — N/A (skipped)
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

- Phase 1 only needs single PTY session per view — no SessionManager yet (Phase 2 task 2.3)
- OutputBuffer is a new file; all other changes are modifications to existing files
- Webview side is already fully implemented — this change is extension-side only

## Revision Log

| Date | Phase | What Changed | Why |
| ---- | ----- | ------------ | --- |
| 2026-03-04 | Context Review | Scaffolded change, read all docs | Initial setup |
| 2026-03-04 | Discovery | Completed discovery, gap analysis | All context gathered from existing docs |
| 2026-03-04 | Proposal | Completed proposal — S appetite, LOW risk | Straightforward wiring + 1 new class |
| 2026-03-04 | Specs | Created output-buffer + ipc-wiring specs | 2 new capability specs with scenarios |
| 2026-03-04 | Tasks | Created 6 tasks across 3 tracks | Oracle review feedback incorporated |
| 2026-03-04 | Validation | Oracle review + cf_validate passed | Added PtySession pause/resume, ack clamping, defensive handling |
| 2026-03-04 | Implement | 1_1: Added pause()/resume() to PtySession + 5 tests | Flow control exposure for OutputBuffer |
| 2026-03-04 | Implement | 1_2: Created OutputBuffer class | 8ms flush, 64KB/100 chunk limits, 100K/5K watermarks, ack clamping |
| 2026-03-04 | Implement | 1_3: Wrote 20 unit tests for OutputBuffer | All spec scenarios covered + error handling |
| 2026-03-04 | Implement | 2_1: Wired TerminalViewProvider message handlers | ready/input/resize/ack connected to PtySession+OutputBuffer; defensive handling; cleanup |
| 2026-03-04 | Implement | 2_2: extension.ts verified — no changes needed | Constructor signature unchanged; PTY integration is internal to provider |
| 2026-03-04 | Implement | 3_1: All verify gates passed | check-types ✅, lint ✅ (2 pre-existing warnings), test:unit 104/104 ✅ |
| 2026-03-04 | Review R1 | Oracle + Code Review found 4 must-fix + 5 nice-to-fix | Session race, postMessage rejections, node-pty feature-detect, payload validation |
| 2026-03-04 | Review R1 Fix | Fixed all must-fix: sessionId guard, safePostMessage, typeof checks, payload validation | Also fixed nice-to-fix: setTimeout, dispose watermark skip, redundant flush |
| 2026-03-04 | Review R2 | Oracle found 1 must-fix: session setup race (refs set after callbacks) | Code Review: 0 must-fix — Approve |
| 2026-03-04 | Review R2 Fix | Moved _ptySession/_outputBuffer/_sessionId assignment before callback wiring | Prevents fast PTY exit from being missed |
| 2026-03-04 | Gate | All tasks done + verify passed + reviews clean | 107 tests, 0 must-fix from both reviews |
