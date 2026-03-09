# Proposal: fix-bugs-cleanup

## Summary

Fix 3 correctness bugs and remove dead code identified during the webview audit (docs/refactor/webview-implementation-vs-design.md). Combines Phase 6 and Phase 7 from docs/PLAN.md.

## Capabilities

| # | Capability | Type |
| - | ---------- | ---- |
| 1 | Session-scoped ack routing | Bug fix |
| 2 | Independent resize debounce timers | Bug fix |
| 3 | Null guard on `_renderService.clear()` | Bug fix |
| 4 | Remove dead `fitAddon`/`webLinksAddon` stored references | Dead code removal |
| 5 | Remove dead `handlePaste()` and `paste` from `TerminalLike` | Dead code removal |
| 6 | Remove dead error classes and enum values | Dead code removal |

## Appetite

**Small** — 6 targeted changes across ~8 files, all in one domain (webview + types), LOW risk. No new dependencies, no cross-cutting concerns.

## UI Impact & E2E Decision

- **UI Impact**: None. All changes are internal (message protocol, type cleanup, null guard).
- **E2E**: NO — no user-visible behavior changes. Verify with `check-types`, `lint`, `test:unit`.

## Risk

| Item | Level | Reason |
| ---- | ----- | ------ |
| Ack routing refactor | LOW | Small scope, clear data flow, no API surface change |
| Resize timeout split | LOW | Rename variable, add second — no logic change |
| Null guard | LOW | Single character change |
| Dead code removal | LOW | Grep confirms zero production usage; tests removed in same change |
