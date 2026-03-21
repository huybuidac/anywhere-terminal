# Discovery: Update Design Docs (Phase 9)

## 1. Feature Summary

Update 9 design docs under `docs/design/` to match the actual codebase after Phases 6-8 refactoring. Currently 36 mismatches and 38 undocumented features identified in the audit (`docs/refactor/webview-implementation-vs-design.md`).

## 2. Workstreams Used / Skipped

| Workstream              | Used? | Justification |
| ----------------------- | ----- | ------------- |
| Memory Recall           | ✅     | Found related audit results and plan docs |
| Architecture Snapshot   | ✅     | Read all 9 design docs, all new modules, messages.ts, errors.ts |
| Internal Patterns       | ⏭️     | Doc-only change, no code patterns needed |
| External Research & Docs | ⏭️    | No external dependencies |
| Constraint Check        | ⏭️     | No code changes, no build/test impact |

## 3. Memory Recall

### Related Results

| Source | Path | Heading | Relevance Score |
| ------ | ---- | ------- | --------------- |
| cf search | docs/refactor/webview-implementation-vs-design.md | Priority 3: Update design docs | 0.938 |
| cf search | docs/PLAN.md | Phase 9 — Update Design Docs | 0.518 |

### Key Findings
- Full audit with file:line references exists at `docs/refactor/webview-implementation-vs-design.md`
- Phase 9 task list in `docs/PLAN.md` sections 9.1-9.9
- Phases 6-8 are all complete (all checkboxes checked)

## 4. Architecture Snapshot

### Current State (Post-Phase 8)

`main.ts` is now 293 LOC composition root. New module structure:

| Module | Location | Purpose |
| ------ | -------- | ------- |
| TerminalFactory | `src/webview/terminal/TerminalFactory.ts` | Terminal creation, config, WebGL |
| SplitTreeRenderer | `src/webview/split/SplitTreeRenderer.ts` | Split pane DOM lifecycle |
| FlowControl | `src/webview/flow/FlowControl.ts` | Per-session ack batching |
| ThemeManager | `src/webview/theme/ThemeManager.ts` | CSS variable → xterm theme |
| BannerService | `src/webview/ui/BannerService.ts` | Error/warning banners |
| XtermFitService | `src/webview/resize/XtermFitService.ts` | Terminal fit calculation |
| ResizeCoordinator | `src/webview/resize/ResizeCoordinator.ts` | ResizeObserver + debounce |
| WebviewStateStore | `src/webview/state/WebviewStateStore.ts` | Centralized state |
| MessageRouter | `src/webview/messaging/MessageRouter.ts` | Typed message dispatch |
| InputHandler | `src/webview/InputHandler.ts` | Key event handler factory |

### Design Docs to Update

| Doc | File | Key Staleness |
| --- | ---- | ------------- |
| message-protocol | `docs/design/message-protocol.md` | 9 missing message types, stale union counts, ack now has tabId |
| xterm-integration | `docs/design/xterm-integration.md` | Wrong xterm version (v5→v6), references monolith, wrong file structure |
| resize-handling | `docs/design/resize-handling.md` | References non-existent ResizeHandler class, wrong mechanism |
| theme-integration | `docs/design/theme-integration.md` | Wrong file path, wrong interface, background priority inverted |
| keyboard-input | `docs/design/keyboard-input.md` | Wrong file path, fictional paste flow, missing shortcuts |
| flow-initialization | `docs/design/flow-initialization.md` | Pre-launch input queue not implemented, wrong function names |
| flow-multi-tab | `docs/design/flow-multi-tab.md` | stateUpdate not implemented, maxTabs not implemented, missing split |
| output-buffering | `docs/design/output-buffering.md` | Fixed 8ms → adaptive 4-16ms, AckBatcher → FlowControl |
| error-handling | `docs/design/error-handling.md` | 4 dead error classes removed, no Output Channel, no CWD validation |

## 8. Gap Analysis (Synthesized)

| Component | Have | Need | Gap Size |
| --------- | ---- | ---- | -------- |
| message-protocol.md | 8 WV→Ext + 8 Ext→WV types | 10 WV→Ext + 15 Ext→WV types | Medium |
| xterm-integration.md | Pre-refactor monolith docs | Post-refactor modular docs | Large |
| resize-handling.md | FitAddon + ResizeHandler class | XtermFitService + ResizeCoordinator | Large |
| theme-integration.md | Wrong interface, wrong path | Actual ThemeManager class | Medium |
| keyboard-input.md | Fictional paste, wrong interface | Factory function, actual shortcuts | Medium |
| flow-initialization.md | Mostly correct sequence | Remove pre-launch queue, update names | Small |
| flow-multi-tab.md | Fictional stateUpdate/maxTabs | Remove fictional, add split pane note | Medium |
| output-buffering.md | Fixed 8ms, AckBatcher class | Adaptive 4-16ms, FlowControl, per-session | Medium |
| error-handling.md | 7 error classes, Output Channel | 3 error classes, console.* only | Medium |

## 9. Key Decisions

| Decision | Options Considered | Chosen | Rationale |
| -------- | ------------------ | ------ | --------- |
| Update strategy | Rewrite from scratch vs. surgical edits | Surgical edits | Preserve existing good content, only fix mismatches |
| Scope | All docs at once vs. incremental | All 9 docs in one change | They're all related; reduces overhead |
| Architecture diagram updates | Keep old diagrams vs. update | Update to reflect new modules | Old diagrams reference non-existent classes |

## 11. Risks & Constraints
- **Must**: All file paths and interface definitions must match actual code
- **Must**: No references to removed classes/functions (dead code removed in Phase 7)
- **Should**: Preserve mermaid diagrams where still accurate
- **Should**: Keep the same section numbering structure within each doc

## 12. Open Questions
- (none — all info is available from the audit and codebase)
