# design-doc-accuracy Specification

## Purpose
TBD
## Requirements

### Requirement: Design Docs Reflect Actual Code

> Original: Design docs describe the intended architecture and runtime behavior of the system.
> — _source: docs/design/*.md_

Design docs SHALL accurately reflect the actual implementation, including:
- All message types in the protocol (currently 10 WV→Ext, 15 Ext→WV)
- Actual file paths and module structure (post-Phase 8 refactoring)
- Actual interfaces and class shapes (not fictional/planned ones)
- Actual behavioral characteristics (adaptive buffering, custom fit, etc.)
- No references to removed code (dead code from Phase 7)
- No references to unimplemented features unless explicitly marked as "Future"

#### Scenario: message-protocol.md matches messages.ts

- **WHEN** a developer reads `docs/design/message-protocol.md`
- **THEN** all message types in `src/types/messages.ts` are documented
- **AND** `AckMessage` includes `tabId` field
- **AND** `TerminalConfig` includes `fontFamily` field
- **AND** union type member counts match actual code (10 WV→Ext, 15 Ext→WV)
- **AND** no reference to non-existent `src/webview/utils/MessageHandler.ts`

#### Scenario: xterm-integration.md matches TerminalFactory

- **WHEN** a developer reads `docs/design/xterm-integration.md`
- **THEN** xterm version is documented as v6 (not v5)
- **AND** no lazy loading pattern is described (static import used)
- **AND** `allowProposedApi` is not claimed
- **AND** WebGL is documented as always-loaded (not on-demand)
- **AND** custom `fitTerminal()` is documented as replacing `FitAddon.fit()`
- **AND** file locations reference new module structure

#### Scenario: resize-handling.md matches ResizeCoordinator + XtermFitService

- **WHEN** a developer reads `docs/design/resize-handling.md`
- **THEN** `XtermFitService` using `getBoundingClientRect()` is documented
- **AND** `ResizeCoordinator` is documented instead of per-terminal `ResizeHandler` class
- **AND** split-pane resize system is documented
- **AND** no reference to non-existent `src/webview/utils/ResizeHandler.ts`

#### Scenario: theme-integration.md matches ThemeManager class

- **WHEN** a developer reads `docs/design/theme-integration.md`
- **THEN** background resolution priority matches code (location-specific first, then terminal-background)
- **AND** ThemeManager interface matches actual class at `src/webview/theme/ThemeManager.ts`
- **AND** all theme properties are documented (including cursor accent, selection foreground, scrollbar properties)
- **AND** dynamic location inference via `inferLocationFromSize()` is documented
- **AND** `minimumContrastRatio` behavior for high-contrast themes is documented

#### Scenario: keyboard-input.md matches InputHandler

- **WHEN** a developer reads `docs/design/keyboard-input.md`
- **THEN** paste is documented as native xterm paste (not custom bracketed paste)
- **AND** `enableCmdK` setting is not referenced (Cmd+K always clears)
- **AND** Escape (clear selection) and Cmd+Backspace (line kill) are documented
- **AND** interface is documented as `createKeyEventHandler()` factory function
- **AND** file path is `src/webview/InputHandler.ts`

#### Scenario: flow-initialization.md matches bootstrap sequence

- **WHEN** a developer reads `docs/design/flow-initialization.md`
- **THEN** no pre-launch input queue is described
- **AND** ResizeObserver timing is documented as happening in handleInit (not bootstrap)
- **AND** init message shape has no `sessionId` field

#### Scenario: flow-multi-tab.md matches tab lifecycle

- **WHEN** a developer reads `docs/design/flow-multi-tab.md`
- **THEN** no `stateUpdate` reconciliation message is referenced
- **AND** no `maxTabs` / `_canCreateTerminal` pattern is referenced
- **AND** "request new tab when last closed" behavior is documented

#### Scenario: output-buffering.md matches OutputBuffer + FlowControl

- **WHEN** a developer reads `docs/design/output-buffering.md`
- **THEN** adaptive flush interval (4-16ms) is documented (not fixed 8ms)
- **AND** 1MB buffer overflow protection with FIFO eviction is documented
- **AND** output pause/resume for hidden views is documented
- **AND** ack batching uses `if` (not `while`) with per-session tracking via FlowControl

#### Scenario: error-handling.md matches errors.ts

- **WHEN** a developer reads `docs/design/error-handling.md`
- **THEN** only 3 error classes are documented (AnyWhereTerminalError, PtyLoadError, ShellNotFoundError)
- **AND** removed classes (SpawnError, CwdNotFoundError, WebViewDisposedError, SessionNotFoundError) are not referenced
- **AND** `ErrorCode` is documented as `string enum` (not `const enum`)
- **AND** logging is documented as `console.*` (not VS Code Output Channel)
- **AND** CWD validation is not described as implemented
- **AND** error banner UI system is documented

