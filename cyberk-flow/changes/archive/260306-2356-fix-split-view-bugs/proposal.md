# Proposal: fix-split-view-bugs

## Why

Three UI bugs were discovered after the split view implementation that degrade the user experience:
1. Split toolbar buttons show wrong icons (horizontal/vertical swapped)
2. A ghost tab with a UUID label appears for split pane sessions
3. The resize divider between split panes is invisible (no visual separator)

## Appetite

**S ≤1d** — Three isolated bug fixes, no architectural changes.

## Scope Boundaries

### In Scope
- Fix icon assignments for split commands in `package.json`
- Remove erroneous `tabRemoved` message for split pane close in `TerminalViewProvider.ts`
- Add visible separator styling for split handles via inline CSS in `webviewHtml.ts` and update `split.css`

### Out of Scope
- Refactoring split layout architecture
- Adding new split features
- Changing resize handle drag behavior
- Loading `split.css` as a separate file (inline approach is simpler)

## Capabilities

1. **Correct split button icons** — each split command shows its matching codicon
2. **Clean tab bar** — split pane sessions don't appear as separate tabs
3. **Visible split divider** — 1px separator line between split panes using theme colors

## Impact

- **Users**: Split buttons show correct icons, no confusing ghost tabs, clear visual separation between split panes
- **Developers**: No API changes, no new dependencies

## Risk Rating

**LOW** — All fixes are isolated, no cross-cutting concerns, no new dependencies.

## UI Impact & E2E

**YES** — changes affect UI behavior (icons, tab bar, split divider styling).
**E2E = NOT REQUIRED** — project.md shows E2E is N/A for this project. These are visual/styling fixes that can be verified manually.
