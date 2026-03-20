# Review Round 4 — add-drag-drop-path

**Date:** 2026-03-20T11:47:00Z
**Reviewable Lines:** 552
**Agents Spawned:** cf-review-logic (openai/gpt-5.4), cf-review-contracts (openai/gpt-5.4), cf-review-frontend (openai/gpt-5.4)
**Agents Skipped:** cf-review-data-security (no DB/storage/auth/API surface changes)

## VERDICT: BLOCK

**Blocking:** 1 | **Warnings:** 1 | **Suggestions:** 1

## Findings

### [B1] Dismissing the drag-drop tip does not refit terminal geometry
- Severity: BLOCK
- Priority: P1
- Agent: orchestrator
- File: `src/webview/main.ts:321`
- Evidence: The dismiss handler removes `#drag-drop-tip` and persists dismissal, but it never triggers a fit or resize pass. Because the tip consumes vertical layout space below `#terminal-container`, removing it increases the terminal container height without updating xterm rows.
- Impact: After dismissing the tip, the terminal can render with stale dimensions and leave unused blank space until some unrelated resize/view-show event occurs.
- Status: pending
- Triage: ""

### [W4] Active-pane routing now depends on an untyped out-of-band `focus` IPC message
- Severity: WARN
- Priority: P4
- Agent: cf-review-contracts
- File: `src/webview/main.ts:351`
- Evidence: The webview posts `{ type: "focus", activeSessionId }`, and `TerminalViewProvider` consumes it via a raw cast branch, but no corresponding `FocusMessage` was added to `src/types/messages.ts` or the shared WebView→Extension union.
- Impact: The split-pane routing fix now bypasses the shared typed message contract, making future protocol drift harder to detect during refactors or reviews.
- Status: pending
- Triage: ""

### [S2] Context-menu flash effect does not cover the full terminal panel
- Severity: SUGGEST
- Priority: P5
- Agent: orchestrator
- File: `src/providers/webviewHtml.ts:225`
- Evidence: The flash is implemented as `#terminal-container.path-inserted::after`, while the tab bar and drag-drop tip are sibling elements outside `#terminal-container`.
- Impact: The visual feedback is limited to the terminal body and does not match the requested “entire terminal panel” flash behavior.
- Status: pending
- Triage: ""
