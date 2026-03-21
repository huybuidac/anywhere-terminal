# Proposal: add-theme-settings

## Why

Phase 3 polish tasks 3.1 (Advanced Theme Integration) and 3.2 (Extension Settings) are needed to make AnyWhere Terminal feel native to VS Code. Currently, the terminal uses hardcoded config values and lacks user-configurable settings. The theme integration needs enhancement for high-contrast support and font resolution from VS Code settings.

## Appetite

**S ≤1d** — Both features build on existing infrastructure (ThemeManager, TerminalConfig, ConfigUpdateMessage). The design is fully documented.

## Scope Boundaries

### In Scope
- Define `contributes.configuration` in package.json with 6 settings
- Create settings reader module to resolve config from `workspace.getConfiguration`
- Wire `onDidChangeConfiguration` listener to push changes to active webviews
- Font resolution chain: `anywhereTerminal.fontSize` → `terminal.integrated.fontSize` → `editor.fontSize` → 14
- Font family resolution chain: `anywhereTerminal.fontFamily` → `terminal.integrated.fontFamily` → `editor.fontFamily` → CSS var → 'monospace'
- High-contrast theme detection and support verification
- Add `fontFamily` field to `TerminalConfig` interface
- Replace hardcoded config in providers with settings reader

### Explicitly Cut
- Performance optimization (Phase 3 task 3.3) — separate change
- Advanced keyboard handling (Phase 3 task 3.4) — separate change
- Context menu (Phase 3 task 3.5) — separate change
- Cross-platform shell settings (Linux/Windows) — macOS only for now
- E2E tests — no user-visible UI flow changes (settings are applied programmatically)

## Capability List

1. **extension-settings**: Define and read extension settings from VS Code configuration
2. **advanced-theme**: Enhanced theme integration with font resolution and high-contrast support

## Impact

- **Users**: Can customize shell, scrollback, font size, cursor blink, and default CWD via VS Code settings
- **Developers**: Settings reader module centralizes config resolution, replacing hardcoded values

## Risk Rating

**LOW** — Additive features on existing infrastructure. No breaking changes. No new dependencies.

## UI Impact & E2E

User-visible UI behavior affected? NO

Settings are applied programmatically to terminal instances. No new pages, forms, or navigation. Font/theme changes are visual but don't constitute a user-interactive flow.

E2E = NOT REQUIRED
