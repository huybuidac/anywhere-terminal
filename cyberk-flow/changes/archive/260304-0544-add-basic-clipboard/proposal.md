# Proposal: add-basic-clipboard

## Why

The Basic Clipboard feature (PLAN.md task 1.7) is implemented but has minor robustness gaps and zero test coverage. This change hardens the implementation and adds unit tests to prevent regressions.

## Appetite

**S <=1d** — Minor code improvements + unit tests for existing functionality.

## Scope Boundaries

### In Scope

- Add clipboard API availability guard before paste
- Send `clear` message to extension on Cmd+K
- Guard `getSelection()` against empty string return
- Update existing spec to match actual (correct) implementation
- Add unit tests for `handlePaste()` and `attachInputHandler()` key event logic

### Explicitly Cut

- Context menu (right-click copy/paste) — Phase 3
- OSC 52 clipboard protocol — future phase
- Large paste chunking — no current user impact
- Linux/Windows keyboard shortcuts — MVP is macOS only
- Full InputHandler class with config management — Phase 2 refactor (we extract only the key handler factory and paste helper for testability)

## Capability List

1. **Clipboard robustness** — defensive guards for clipboard API availability and empty selection
2. **Cmd+K extension notification** — send clear message so extension can manage scrollback cache
3. **Input handler tests** — unit tests covering all key handler branches, paste flow, copy flow, IME composition

## Impact

- **Users**: No visible behavior change (defensive improvements only)
- **Developers**: Test coverage for input handler enables safer future changes
- **Systems**: Cmd+K now properly notifies extension host (future scrollback cache clearing)

## Risk Rating

**LOW** — No new dependencies, no architecture changes, no user-visible behavior changes. All improvements are defensive hardening of existing working code.

## UI Impact & E2E

**NO** — No user-visible UI changes. E2E is NOT REQUIRED.
