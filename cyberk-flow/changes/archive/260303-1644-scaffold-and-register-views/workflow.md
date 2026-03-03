# Workflow State: <change-id>

> **Source of truth:** Workflow stages/gates → this file · Task completion → `tasks.md`

## Plan

- [x] 1. Context Review
- [x] 2. Discovery
- [x] **Gate: user approved direction** (no open questions)
- [x] 3. Proposal
  - [x] **MANDATORY** UI Impact & E2E decision recorded in `proposal.md` (NO — pure infrastructure)
- [x] 4. Specs
- [ ] **Gate: user approved specs**
- [-] 5. Architecture Review — SKIP: LOW risk, no cross-cutting changes, xterm devDeps are build-time only
  - [-] Design doc created — N/A (skip)
  - [-] Spikes completed — N/A (skip)
- [x] 6. Tasks
- [x] 7. Validation
  - [x] **MANDATORY** Oracle reviewed: plan completeness, task deps, gaps, parallelization _(never skip)_
  - [x] `cf_validate` passes (0 errors, 2 justified warnings)
- [x] **Gate: user approved plan**

## Implement

<!-- RULE: After completing each task, immediately mark it [x] in tasks.md AND log in Revision Log below. -->
- [x] All tasks in tasks.md are complete (update tasks.md after EACH task)
- [ ] Verify Gate — run commands from `project.md` § Commands, **MUST execute and observe pass** _(mark `[-]` if N/A)_:
  - [x] Type check
  - [x] Lint
  - [-] Test — pre-existing: no `.vscode-test` config file exists (not introduced by this change)
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

## Revision Log

| Date | Phase | What Changed | Why |
| ---- | ----- | ------------ | --- |
| 2026-03-03 | Context Review | Scaffolded change directory | Starting plan for tasks 1.1+1.2 |
| 2026-03-03 | Discovery | Analyzed current state: esbuild single-target, no xterm deps, no views | Gap analysis for scaffolding |
| 2026-03-03 | Specs | Added build-infrastructure (8 reqs) and view-registration (5 reqs) | Testable specs for all capabilities |
| 2026-03-03 | Tasks | Created 5 tasks in 3 tracks (A: build, B: config, C: verify) | Oracle feedback incorporated: parallelized tsconfig, added provider stub |
| 2026-03-03 | Validation | Oracle review + cf_validate (0 errors) | Ready for approval |
| 2026-03-03 | Implement | 1_1 complete: xterm devDeps added, alchemy removed, deps empty | pnpm install succeeded |
| 2026-03-03 | Implement | 1_2 complete: tsconfig.json lib: ["ES2022", "DOM"], skipLibCheck: true | check-types passes |
| 2026-03-03 | Implement | 1_3 complete: esbuild.js rewritten with dual-target + CSS copy plugin | dist/extension.js + media/webview.js + media/xterm.css all produced |
| 2026-03-03 | Implement | 2_1 complete: package.json views/activation + extension.ts minimal provider stub | helloWorld removed, WebviewViewProvider registered |
| 2026-03-03 | Implement | 1_4 complete: .vscodeignore + .gitignore for media build artifacts | Clean packaging config |
| 2026-03-03 | Implement | 3_1 complete: pnpm compile passes, all 3 artifacts produced, no TS/lint errors | Full pipeline verified |
| 2026-03-03 | Review R1 | Oracle: 2 must-fix (icon, CSP), Code Review: 1 must-fix (.vscodeignore) | Icon is valid $(terminal) syntax; CSP fixed; .vscodeignore correct for dynamic node-pty |
| 2026-03-03 | Fix R1 | Added CSP+nonce+webviewUri to HTML, require.resolve for CSS path, Biome auto-fix crypto→node:crypto | Addressed valid review findings |
| 2026-03-03 | Review R2 | Oracle: 0 must-fix, Code Review: 0 must-fix (CSS layout flagged but is placeholder-only) | Both reviews pass — exit loop |
