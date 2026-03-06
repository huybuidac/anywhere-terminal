# Proposal: add-commands-sidebar-lifecycle

## Why

The extension currently only registers one command (`newTerminalInEditor`). Users need the full command surface (new terminal, kill, clear, focus sidebar/panel) to be productive. Secondary sidebar support enables flexible layout. View lifecycle resilience ensures PTY processes survive webview disposal and terminal output is restored seamlessly.

## Appetite

**M <=3d** (~7h estimated across 3 sub-tasks)

## Scope Boundaries

### In Scope
- Register all 6 commands from REQUIREMENT.md (FR-40..FR-45) in package.json and extension.ts
- Add view/title menu buttons (new terminal +, kill terminal trash)
- Add `moveToSecondary` command for secondary sidebar support
- Implement scrollback cache replay on webview re-creation
- Handle view visibility changes (pause/resume output flushing)
- Ensure PTY processes are anchored to Extension Host lifecycle

### Out of Scope
- `contribSecondarySideBar` proposed API integration (deferred until API is finalized)
- Session persistence across VS Code restart (Phase 3, FR-31)
- Configurable keybindings (FR-23, P2)
- Split terminal panes

## Capabilities

1. **Commands Registration** — Register all terminal commands in package.json and wire handlers in extension.ts. Add view toolbar menu buttons.
2. **Secondary Sidebar Support** — Add `moveToSecondary` command and document "Move View" instructions.
3. **View Lifecycle Resilience** — Scrollback cache replay on webview re-creation, visibility-based output pause/resume, proper dispose cleanup.

## Impact

- **Users**: Full command palette access to terminal operations. Can move terminal to secondary sidebar. Terminal output preserved across view collapse/expand cycles.
- **Developers**: Clean command registration pattern for future commands. SessionManager gains view-level visibility tracking.

## Risk Rating

**LOW** — All capabilities extend existing patterns. No new dependencies. Design docs are comprehensive and implementation follows established conventions.

## UI Impact & E2E

User-visible UI behavior affected? **NO**

This change does not affect user-visible UI behavior in terms of new pages or form interactions. Commands are registered declaratively. View lifecycle is backend-only. E2E is **NOT REQUIRED**.
