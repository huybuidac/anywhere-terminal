# Proposal: implement-webview-terminal

## Why

The webview is currently a placeholder (`console.log`). Task 1.5 of the implementation plan requires a fully functional xterm.js terminal in the webview that initializes the terminal emulator, handles user input, renders output, auto-resizes, matches VS Code themes, and communicates with the extension host via postMessage. Without this, the terminal extension has no visible UI.

## Appetite

**M ≤ 3d** — Single file (~400-500 lines), all patterns are well-documented in design docs, dependencies pre-installed, build system ready.

## Scope Boundaries

### In
- xterm.js Terminal initialization with FitAddon + WebLinksAddon
- acquireVsCodeApi() messaging: handle `init`, `output`, `exit`, `tabCreated`, `tabRemoved`, `restore`, `configUpdate`, `error`, `viewShow` messages
- Send `ready`, `input`, `resize`, `ack` messages
- ResizeObserver + 100ms debounce + visibility-deferred resize
- Theme integration: CSS variable reading, MutationObserver for theme changes, location-aware background
- Keyboard handling: Cmd+C (copy/SIGINT), Cmd+V (paste with bracketed paste), Cmd+K (clear), Cmd+A (select all)
- IME composition tracking
- Flow control ack batching (5K char batch size)
- Tab switching (CSS display toggle, show/hide containers)
- Terminal disposal (xterm.dispose, container.remove)
- Exit message display (`[Process exited with code N]`)

### Out
- Tab bar UI rendering (Phase 2 — task 2.4)
- Multi-tab creation/close logic (Phase 2)
- WebGL renderer (Phase 3)
- Context menu (Phase 3)
- Session persistence (Phase 2+)
- Extension host message routing to real PTY (task 1.4/1.6 scope)

## Capability List

1. **xterm-init** — Initialize xterm.js Terminal with correct options, load Tier 1 addons
2. **message-handler** — Bidirectional postMessage communication following protocol spec
3. **resize-handler** — ResizeObserver + debounced fitAddon.fit() + visibility handling
4. **theme-manager** — CSS variable reading, location-aware background, MutationObserver
5. **input-handler** — Custom key event handler (copy/paste/clear/select-all), IME tracking
6. **flow-control** — Ack batching for output backpressure
7. **terminal-lifecycle** — Create/switch/remove terminal instances, exit handling

## Impact

- **Users**: Terminal UI appears in sidebar/panel for the first time (replaces placeholder)
- **Developers**: Foundation for all future webview features (tabs, editor terminal)
- **Systems**: Webview bundle grows from ~0 to ~300KB (xterm.js core)

## Risk Rating

**LOW** — All patterns are documented, dependencies installed, no new architectural decisions.

## UI Impact & E2E

**YES** — This is user-visible UI (terminal rendering in webview).
**E2E = NOT REQUIRED** — No PTY backend exists yet (task 1.4), so the terminal cannot be tested end-to-end. Unit tests for webview logic are sufficient at this stage.
