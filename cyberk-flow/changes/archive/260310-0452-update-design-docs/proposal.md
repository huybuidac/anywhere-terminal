# Change: Update Design Docs (Phase 9)

## Why
9 design docs have drifted significantly from the actual codebase after Phases 6-8 refactoring — 36 mismatches and 38 undocumented features. Outdated docs cause confusion for future development.

## Appetite
M (<=3d)

## Scope
- **In**: Update all 9 design docs listed in PLAN.md Phase 9 (sections 9.1-9.9) to match actual code
- **Out**: Creating new design docs; updating docs outside `docs/design/`; code changes
- **Cut list**: Mermaid diagram updates for diagrams that are mostly correct (keep as-is if effort exceeds value)

## What Changes
- `docs/design/message-protocol.md`: Add 9 undocumented message types, add `fontFamily` to TerminalConfig, add `tabId` to AckMessage, update union type counts, remove non-existent file reference
- `docs/design/xterm-integration.md`: Fix xterm version v5→v6, remove lazy loading pattern, remove `allowProposedApi`, document WebGL always-loaded, remove addon cache, document custom `fitTerminal()`, update file structure
- `docs/design/resize-handling.md`: Replace FitAddon pipeline with custom fitTerminal() using getBoundingClientRect(), replace ResizeHandler class with ResizeCoordinator + XtermFitService, document split-pane resize, fix file paths
- `docs/design/theme-integration.md`: Fix background resolution priority order, update ThemeManager interface to match actual class, add 7 missing theme properties, document dynamic location inference, fix file path
- `docs/design/keyboard-input.md`: Replace paste section with actual behavior (native xterm paste), remove `enableCmdK`, add Escape/Cmd+Backspace shortcuts, update interface to factory function, fix file path
- `docs/design/flow-initialization.md`: Remove pre-launch input queue, fix ResizeObserver timing, fix init message shape
- `docs/design/flow-multi-tab.md`: Remove `stateUpdate` reconciliation, remove `maxTabs`/`_canCreateTerminal`, document "request new tab when last closed"
- `docs/design/output-buffering.md`: Document adaptive flush interval (4-16ms), document 1MB buffer overflow protection, document output pause/resume for hidden views, fix ack batching description
- `docs/design/error-handling.md`: Remove CWD validation, remove Output Channel logging, remove orphaned PTY cleanup, mark dead error classes as removed, document error banner UI

## Capabilities
- **Modified**: `specs/design-doc-accuracy/spec.md` (delta — consolidated spec covering all 9 design docs with per-doc scenarios)

## UI Impact & E2E
- **User-visible UI behavior affected?** NO
- **E2E required?** NOT REQUIRED
- **Justification**: Documentation-only change. No code modifications.

## Risk Level
LOW — no code changes, no build impact, no runtime impact

## Impact
- Affected specs: message-handler, xterm-init, resize-handler, theme-manager, input-handler, flow-control, terminal-lifecycle
- Affected code: none (docs only)

## Open Questions
- (none)
