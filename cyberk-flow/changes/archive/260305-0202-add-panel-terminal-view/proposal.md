# Proposal: add-panel-terminal-view

## Why

The extension currently only registers a terminal view in the Primary Sidebar. Users need a terminal in the VS Code Bottom Panel — the most natural location for terminal usage. The `TerminalViewProvider` already supports panel location but is not registered for it.

## Appetite

**S (<=1d)** — Two files to modify (package.json, extension.ts), no new code to write, just registration wiring.

## Scope Boundaries

### In Scope
- Add `viewsContainers.panel` entry in package.json
- Add `views.anywhereTerminalPanel` entry in package.json
- Add `onView:anywhereTerminal.panel` activation event
- Register second `TerminalViewProvider` instance in extension.ts for panel

### Explicitly Cut
- Editor area terminal (Phase 2 — separate change)
- SessionManager integration (Phase 2)
- Multi-tab support (Phase 2)
- Any changes to TerminalViewProvider itself

## Capability List

1. **Panel View Registration** — Terminal view appears in VS Code Bottom Panel with its own PTY session

## Impact

- **Users**: Terminal becomes available in the Bottom Panel, matching the most common terminal location
- **Developers**: No API changes; second instance of existing provider
- **Systems**: One additional PTY process when panel view is opened

## Risk Rating

**LOW** — Reuses existing, tested code. Only configuration and registration changes.

## UI Impact & E2E

**YES** — This adds a new panel view (user-visible UI).
**E2E = NOT REQUIRED** — The change is purely registration/configuration. The TerminalViewProvider behavior is already tested via the sidebar instance. Manual verification that the panel appears is sufficient. No new UI interactions or flows are introduced.
