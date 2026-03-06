# Proposal: add-session-manager-editor

## Why

The current Phase 1 implementation has each provider (sidebar, panel, editor) managing its own single PTY session directly. This prevents multi-tab support and duplicates lifecycle logic across providers. The SessionManager is the foundational component that enables multi-tab terminal management, centralized session tracking, and proper cleanup coordination. The Editor Terminal also needs to be refactored to delegate to SessionManager instead of managing its own PTY.

## Appetite

**M ≤3d** — SessionManager is well-designed in docs, providers need refactoring but patterns are clear.

## Scope Boundaries

### In Scope
- Create `SessionManager` class with full lifecycle management
- Operation queue for serialized destructive operations
- Kill tracking (`terminalBeingKilled` Set)
- Terminal number recycling (gap-filling algorithm)
- Scrollback cache (ring buffer)
- Refactor `TerminalViewProvider` to use SessionManager
- Refactor `TerminalEditorProvider` to use SessionManager
- Extract shared HTML generation utility
- Update `extension.ts` to create and wire SessionManager
- Unit tests for SessionManager
- Wire Phase 2 message handlers (createTab, switchTab, closeTab, clear)

### Out of Scope
- Webview-side tab bar UI (separate change)
- ConfigManager integration (separate change)
- Session persistence across VS Code restart (P2 feature)
- Split terminal panes

## Capability List

1. **session-manager-core** — Central registry with create/destroy/get/switch operations
2. **session-manager-lifecycle** — Operation queue, kill tracking, disposable pattern
3. **session-manager-numbering** — Terminal number recycling with gap-filling
4. **provider-integration** — Refactor both providers to delegate to SessionManager
5. **editor-session-manager** — Editor terminal uses SessionManager for session management

## Impact

- **Developers**: Providers become simpler — delegate session logic to SessionManager
- **Users**: No visible change yet (multi-tab UI is a separate change), but foundation is laid
- **Architecture**: Centralizes session management, eliminates duplication

## Risk Rating

**MEDIUM** — Cross-cutting refactor of existing working providers. Mitigated by comprehensive design docs and unit tests.

## UI Impact & E2E

- **User-visible UI behavior affected?** NO
- This change is backend/extension-host only. No new UI surfaces. E2E is NOT REQUIRED.
