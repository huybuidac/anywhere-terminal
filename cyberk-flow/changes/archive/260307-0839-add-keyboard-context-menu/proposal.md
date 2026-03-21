# Proposal: add-keyboard-context-menu

## Why

Phase 3 polish for the AnyWhere Terminal extension. Users need Escape key to deselect text (matching VS Code terminal behavior) and a right-click context menu for common terminal operations (Copy, Paste, Select All, Clear, New Terminal, Kill Terminal). The keyboard handler already covers Cmd+C/V/K/A and Ctrl+Tab — only Escape is missing. The context menu infrastructure exists (3 split-pane items) but lacks clipboard and terminal lifecycle entries.

## Appetite

**S ≤1d** — Escape key is a 1-line addition to existing handler. Context menu is declarative (package.json) + a few command registrations + webview message handlers.

## Scope Boundaries

### In Scope
- Add Escape key to `createKeyEventHandler()`: clear selection if exists, else pass to shell
- Add context menu items: Copy, Paste, Select All, Clear Terminal, New Terminal, Kill Terminal
- Register new commands in extension.ts
- Add webview message handlers for clipboard context menu operations
- Unit tests for Escape key behavior
- Unit tests for context menu message handling

### Explicitly Cut
- Linux/Windows keyboard shortcut testing (macOS only for now)
- Tab context menu (right-click on tab bar)
- OSC 52 clipboard protocol
- Keyboard shortcut customization/rebinding

## Capabilities

1. **Escape Key Handling** — Escape clears terminal selection if present, otherwise passes through to shell
2. **Terminal Context Menu** — Right-click context menu with Copy, Paste, Select All, Clear Terminal, New Terminal, Kill Terminal

## Impact

- **Users**: Can right-click for common operations instead of memorizing shortcuts; Escape key works as expected for deselecting text
- **Developers**: Minimal — extends existing patterns

## Risk Rating

**LOW** — All patterns established, no new dependencies, no architectural changes.

## UI Impact & E2E

- User-visible UI behavior affected? **NO**
- E2E required? **NOT REQUIRED** — These are keyboard/context menu interactions within existing webview terminals. No new pages, forms, or navigation.
