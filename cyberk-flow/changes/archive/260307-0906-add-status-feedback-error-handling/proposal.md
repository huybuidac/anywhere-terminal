# Proposal: add-status-feedback-error-handling

## Why

Phase 3 polish for the AnyWhere Terminal extension. Users need better feedback about terminal state (what process is running, whether it exited) and graceful error handling when things go wrong (PTY spawn failures, missing shells, node-pty incompatibility). Currently, errors are logged to console but not shown to users, and tab titles are static.

## Appetite

**S <=1d** — All patterns are well-documented in existing design docs. Changes are localized to 5-8 files with clear boundaries.

## Scope Boundaries

### In Scope
- Dynamic process name in tab title via OSC title sequences
- Exit code display in terminal (already done — verify only)
- Visual indicator on tab bar for exited terminals
- Error display in webview UI (banner/inline message)
- Graceful handling of PTY spawn failure, node-pty not found, shell not found
- Retry mechanism for transient postMessage failures

### Out of Scope
- Process name via PTY process property polling (platform-specific, unreliable)
- Automatic terminal restart after crash
- Error reporting/telemetry
- Custom error UI themes

## Capability List

1. **process-title-tracking** — Track and display the current process name in tab titles using OSC title change events
2. **terminal-exit-indicator** — Visual indicator on tab bar for exited terminals (dimmed text, "(exited)" suffix)
3. **error-display** — Display error messages in the webview UI instead of just console.log
4. **spawn-error-handling** — Graceful handling of PTY spawn failures with user-visible error messages in the terminal area
5. **retry-transient** — Retry mechanism for transient postMessage failures

## Impact

- **Users**: See meaningful process names in tabs, clear visual feedback when terminals exit, actionable error messages when things fail
- **Developers**: Better error handling patterns, retry utility for message passing

## Risk Rating

**LOW** — All changes follow existing patterns documented in design docs. No new dependencies. No architectural changes.

## UI Impact & E2E

User-visible UI behavior affected? **NO** — Changes are to webview internals (tab bar text, error banner). No new pages, forms, or navigation. E2E is NOT REQUIRED.
