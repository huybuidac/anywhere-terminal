# Discovery: Reduce main.ts to Composition Root

## 1. Feature Summary

Refactor `src/webview/main.ts` (1037 LOC) to a thin composition root (<300 LOC) by extracting remaining business logic into focused modules — TerminalFactory, SplitTreeRenderer, TabOrchestrator, and FlowControl — while keeping only bootstrap wiring, init handling, and service composition in main.ts.

## 2. Workstreams Used / Skipped

| Workstream              | Used? | Justification |
| ----------------------- | ----- | ------------- |
| Memory Recall           | ⏭️     | No prior changes for this exact phase |
| Architecture Snapshot   | ✅     | Full analysis of current main.ts structure and extracted modules |
| Internal Patterns       | ✅     | Phases 8.1-8.6 established extraction patterns to follow |
| External Research & Docs | ⏭️    | VS Code patterns already documented in PLAN.md |
| Constraint Check        | ✅     | Build/lint/type-check constraints verified |

## 3. Memory Recall

### Key Findings
- Phases 8.1-8.6 already extracted: ThemeManager, BannerService, XtermFitService, ResizeCoordinator, WebviewStateStore, MessageRouter
- These modules follow constructor injection, typed interfaces, and callback-based communication
- The extraction pattern is well-established — new extractions should follow the same approach

## 4. Architecture Snapshot

### Relevant Packages
| Package | Purpose | Key Files |
| --- | --- | --- |
| `src/webview/` | WebView frontend layer | `main.ts` (1037 LOC — the target) |
| `src/webview/theme/` | Theme management | `ThemeManager.ts` (185 LOC) |
| `src/webview/resize/` | Resize coordination | `ResizeCoordinator.ts` (205 LOC), `XtermFitService.ts` (62 LOC) |
| `src/webview/state/` | State management | `WebviewStateStore.ts` (158 LOC) |
| `src/webview/messaging/` | Message dispatch | `MessageRouter.ts` (115 LOC) |
| `src/webview/ui/` | UI components | `BannerService.ts` (41 LOC) |
| `src/webview/` | Split pane system | `SplitModel.ts`, `SplitContainer.ts`, `SplitResizeHandle.ts` |
| `src/webview/` | Tab bar | `TabBarUtils.ts` (124 LOC) |
| `src/webview/` | Input handling | `InputHandler.ts` |

### Entry Points
- WebView: `src/webview/main.ts` — `bootstrap()` on DOMContentLoaded

## 5. Internal Patterns

### Similar Implementations
| Feature | Location | Pattern Used |
| --- | --- | --- |
| ThemeManager extraction (8.1) | `src/webview/theme/ThemeManager.ts` | Class with constructor injection, callback-based notification |
| ResizeCoordinator extraction (8.4) | `src/webview/resize/ResizeCoordinator.ts` | Class with function-based injection, state accessor callback |
| MessageRouter extraction (8.6) | `src/webview/messaging/MessageRouter.ts` | Factory function with typed handler interface |
| WebviewStateStore extraction (8.5) | `src/webview/state/WebviewStateStore.ts` | Class owning Maps, no business logic |

### Reusable Utilities
- All extracted modules use callback injection — no DI container needed
- Factory function pattern (createMessageRouter) for stateless dispatch
- Class pattern for stateful services (ThemeManager, ResizeCoordinator, WebviewStateStore)

## 6. Constraint Check
- Dependencies: No new npm dependencies needed — pure refactoring
- Build Requirements: esbuild bundles all webview modules into single JS, imports work freely
- Type check: `pnpm run check-types` must pass
- Lint: `pnpm run lint` (Biome) must pass

## 7. External Research & Documentation
- VS Code patterns already documented in `docs/refactor/vscode-terminal-patterns.md`
- PLAN.md Phase 8.7 defines the target architecture

## 8. Gap Analysis (Synthesized)

| Component | Have | Need | Gap Size |
| --- | --- | --- | --- |
| Terminal creation | `createTerminal()` inline in main.ts (119 LOC) | Extracted `TerminalFactory` module | Medium |
| Split tree rendering | `_renderTabSplitTree()` + `showTabContainer()` + `updateActivePaneVisual()` inline (139 LOC) | Extracted `SplitTreeRenderer` module | Medium |
| Tab orchestration | `switchTab()` + `removeTerminal()` + `closeSplitPaneById()` inline (202 LOC) | Extracted `TabOrchestrator` module or stay with thin delegates | Large |
| Config propagation | `applyConfig()` inline (41 LOC) | Move into a module or keep as thin helper | Small |
| Flow control | `ackChars()` inline (10 LOC) | Possibly extract or keep (very small) | Small |
| Tab bar data assembly | `updateTabBar()` 43 LOC with data mapping | Simplify or extract data-assembly part | Small |
| Input wiring | `attachInputHandler()` + `getClipboardProvider()` (32 LOC) | Move with terminal factory or keep | Small |
| Utilities | `getFontFamily()`, `getActivePaneTerminal()`, `fitTerminal` wrapper (23 LOC) | Move with their consumers | Small |

## 9. Key Decisions

| Decision | Options Considered | Chosen | Rationale |
| --- | --- | --- | --- |
| How to group extractions | (A) Many small modules (one per function) vs (B) Cohesive modules by concern | (B) Cohesive modules | Fewer files, clearer ownership. Functions that share state/DOM access belong together |
| TerminalFactory scope | (A) Just `createTerminal` vs (B) createTerminal + attachInputHandler + WebGL + addons | (B) Full factory | Input wiring, addon loading, and WebGL are all part of creating a terminal |
| SplitTreeRenderer scope | (A) Just render vs (B) render + show + active-pane visual | (B) All split-tree DOM ops | These three functions always work together and share the same DOM parent |
| Tab orchestration location | (A) Extract to TabOrchestrator class vs (B) Keep in main.ts as thin delegates | (B) Keep in main.ts | switchTab/removeTerminal are composition root concerns — they coordinate across all services. Extracting them would just add indirection. They stay but become thinner by delegating to extracted modules |
| ackChars location | (A) Extract to FlowControl module vs (B) Keep inline | (A) Extract alongside factory | ackChars tracks state (unsentAckCharsMap) that's only used by output handling. Move it with the terminal lifecycle |

## 10. Options Comparison

| Criteria | (A) Extract everything to classes | (B) Extract by concern, keep orchestration in main |
| --- | --- | --- |
| Complexity | Higher — more files, more interfaces | Lower — 3-4 new modules |
| LOC reduction | ~250 LOC remaining | ~280 LOC remaining (within target) |
| Maintainability | Over-extracted — hard to trace flow | Balanced — clear ownership without indirection |
| Risk | Medium — more wiring changes | Low — incremental, follows existing patterns |
| **Recommendation** | | **Recommended** |

## 11. Risks & Constraints
- **Must**: No behavioral changes — pure refactoring, all message handling must remain identical
- **Must**: `pnpm run check-types` and `pnpm run lint` must pass after each extraction
- **Must**: No new npm dependencies
- **Should**: Follow the extraction patterns established in Phases 8.1-8.6
- **Should**: Each extraction should be independently verifiable (build passes)

## 12. Open Questions
- [x] Should `switchTab`/`removeTerminal` be extracted? Decision: No — they are orchestration that belongs in the composition root. They will become shorter when _renderTabSplitTree and closeSplitPaneById delegate to extracted modules.
