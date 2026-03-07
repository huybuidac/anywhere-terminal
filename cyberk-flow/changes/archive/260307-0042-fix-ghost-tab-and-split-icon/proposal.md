# Proposal: fix-ghost-tab-and-split-icon

## Why

Two UI bugs in the split terminal feature:
1. **Ghost tabs**: Split pane sessions appear as separate tabs showing UUID names when the webview re-initializes (e.g., sidebar hidden→shown). Root cause: `getTabsForView()` returns ALL sessions including split pane sessions.
2. **Wrong icon**: The split vertical button shows a horizontal icon and vice versa. The codicon names `$(split-horizontal)` / `$(split-vertical)` refer to pane arrangement direction, but commands use them based on split-line direction.

## Appetite

S <=1d

## Scope Boundaries

**In scope**:
- Add `isSplitPane` flag to `TerminalSession` and filter in `getTabsForView()`
- Swap icon assignments in `package.json`

**Out of scope**:
- Split layout persistence/restore across webview re-init (separate feature)
- Any other split UI issues

## Capabilities

1. **Ghost tab elimination**: Split pane sessions excluded from tab bar on init/restore
2. **Correct split icons**: Each split command shows the icon matching its visual result

## Impact

- Users no longer see UUID ghost tabs after split operations
- Split buttons show correct icons matching their behavior

## Risk Rating

LOW — simple flag addition + icon swap, no architectural changes

## UI Impact & E2E

YES — user-visible UI fix (tab bar, toolbar icons)
E2E = NOT REQUIRED — these are visual/config fixes not testable via automated E2E; unit test covers the filtering logic
