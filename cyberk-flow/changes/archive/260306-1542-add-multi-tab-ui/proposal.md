# Proposal: add-multi-tab-ui

## Why

Each terminal view (sidebar, panel, editor) can host multiple terminal sessions, but the webview has no visible tab bar UI. Users cannot see which tabs exist, create new tabs, switch between tabs, or close tabs visually. The extension host and message protocol are fully implemented — only the webview UI layer is missing.

## Appetite

**S ≤1d** — The extension host, message types, and core webview tab logic (create/switch/remove) are already implemented. This change adds the visual tab bar component and keyboard shortcuts only.

## Scope Boundaries

### In Scope
- Tab bar HTML/CSS component rendered in `#tab-bar` div
- Tab elements with name label and close (x) button
- Active tab visual highlighting
- "+" button to create new tabs
- Click handlers for tab switching and closing
- `renderTabBar()` function called after all tab mutations
- Ctrl+Tab / Ctrl+Shift+Tab keyboard shortcuts for tab cycling
- Tab bar styling using VS Code CSS variables for theme consistency
- Hide tab bar when only one tab exists (clean single-tab UX)

### Out of Scope (Explicitly Cut)
- Tab renaming (FR future — `rename` message type noted in protocol doc §11)
- Tab drag-and-drop reordering
- Tab context menu (right-click)
- Tab overflow/scroll when many tabs exist (max 10 per FR-15, fits in bar)
- Extension host changes (already complete)
- Message type changes (already complete)

## Capabilities

1. **Tab Bar Component** — Visual tab strip with tabs, active indicator, close buttons, and add button
2. **Tab Keyboard Shortcuts** — Ctrl+Tab / Ctrl+Shift+Tab for cycling through tabs

## Impact

- **Users**: Can now see, create, switch, and close terminal tabs visually within each view
- **Developers**: New `renderTabBar()` function in `main.ts`; new CSS in `webviewHtml.ts`
- **Systems**: No backend changes; webview-only

## Risk Rating

**LOW** — Pure UI addition in the webview. No new dependencies, no architecture changes, no data model changes. All supporting infrastructure is already implemented and tested.

## UI Impact & E2E

User-visible UI behavior affected? **YES**

E2E required? **NO** — This is a webview-internal UI change. VS Code's test infrastructure cannot interact with webview DOM elements. The tab bar will be verified via manual testing and unit tests for the rendering logic.
