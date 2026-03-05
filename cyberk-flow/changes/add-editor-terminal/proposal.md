# Proposal: add-editor-terminal

## Why

Users need to open terminal instances in the **Editor area** as editor tabs, fulfilling requirement FR-03 ("Create a real terminal in the Editor area as an editor tab"). This completes the "terminal anywhere" promise for all three core locations (Sidebar, Panel, Editor). The Editor area is particularly valuable for users who want a full-width terminal alongside their code files.

## Appetite

**S (<=1d)** — The existing `TerminalViewProvider` provides a proven pattern. The new `TerminalEditorProvider` adapts the same logic for `WebviewPanel` API. No new dependencies, no architectural changes.

## Scope Boundaries

### In Scope
- `TerminalEditorProvider` class using `vscode.window.createWebviewPanel()`
- Command `anywhereTerminal.newTerminalInEditor` to open editor terminal
- Command palette registration with title
- Activation event for the command
- Editor tab lifecycle management (close → kill PTY)
- `data-terminal-location="editor"` attribute for webview theme handling
- Unit tests for the new provider

### Out of Scope (Cut)
- Multi-tab within a single editor panel (Phase 2 — SessionManager)
- Tab naming with number recycling (Phase 2 — SessionManager)
- Editor terminal icon customization
- Keyboard shortcut binding for the command
- Context menu integration

## Capability List

1. **Editor Panel Creation** — Open a new terminal in the Editor area via command, with its own independent PTY session
2. **Editor Panel Lifecycle** — Clean PTY cleanup when editor tab is closed; multiple editor panels supported simultaneously
3. **Command Registration** — `anywhereTerminal.newTerminalInEditor` command registered in package.json with activation event

## Impact

- **Users**: Can now open terminals as editor tabs alongside code files
- **Developers**: New provider file follows established patterns; minimal learning curve
- **Systems**: No architectural changes; additive only

## Risk Rating

**LOW** — Well-defined API (WebviewPanel), proven internal pattern (TerminalViewProvider), no new dependencies.

## UI Impact & E2E

**YES** — This adds a new user-visible UI capability (terminal in editor area).
**E2E = NOT REQUIRED** — The editor terminal is a direct adaptation of the existing sidebar/panel pattern with identical webview code. Manual testing is sufficient for Phase 1. E2E infrastructure does not exist yet (project.md shows E2E: N/A).
