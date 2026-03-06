# Proposal: split-integration

## Why

The split terminal feature has been built in two prior changes (split-layout-core, split-actions-focus) which established the tree model, container renderer, resize handles, commands, and focus management. This change completes the integration by handling edge cases: graceful last-pane close, recursive split correctness, and ensuring resize/output routing works correctly across all split configurations. Most of the message protocol work (5.6) is already done — this change focuses on what's NOT yet done.

## Appetite

**S ≤1d** — Most infrastructure exists. Remaining work is edge case handling, a small amount of new logic for last-pane close, and unit tests.

## Scope Boundaries

### In Scope
- Handle last pane close gracefully (create new default terminal or close view)
- Verify and fix recursive splitting (split → split again → close inner panes)
- Ensure overall view resize propagates to all split panes
- Verify layout persistence across webview hide/show cycles
- Unit tests for edge cases

### Out of Scope
- New split message types (already exist)
- Resize handle drag logic (already exists)
- Focus management (already exists)
- E2E tests (no user-visible UI changes — edge case handling only)

## Capabilities

1. **Last-pane-close handling** — When the last pane in a split is closed and it's the last tab, request creation of a new default terminal
2. **Recursive split correctness** — Verify split → split → close inner panes works correctly with tree restructuring
3. **View resize propagation** — Ensure all panes in all tabs resize when the overall view resizes (sidebar width change, etc.)
4. **Layout persistence verification** — Verify split layout survives webview hide/show cycles

## Impact

- **Users**: More robust split terminal experience — no broken state when closing last pane or doing deep recursive splits
- **Developers**: Better test coverage for split edge cases

## Risk Rating

**LOW** — All changes are within existing modules, no new dependencies, no architectural changes.

## UI Impact & E2E

**User-visible UI behavior affected?** NO — No new UI elements. Changes are edge case handling in existing code paths. E2E is NOT REQUIRED.
