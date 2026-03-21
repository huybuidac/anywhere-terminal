# Proposal: add-drag-drop-path

## Why

Users need a way to quickly insert file/folder paths into the terminal. VS Code's built-in terminal supports drag-and-drop, but extension WebViews have fundamental limitations (sandboxed iframe, pointer-events blocking). This feature provides two approaches: Explorer context menu (primary) and Shift+drag (secondary).

## Appetite

**S ≤1d** — Feature scope is well-defined. Two insertion methods: Extension Host command + WebView drag handler.

## Scope Boundaries

### In Scope
- **Explorer context menu**: Right-click file/folder → "Insert Path in AnyWhere Terminal" (primary UX)
- **Shift+drag from VS Code Explorer** into terminal (secondary UX — requires holding Shift)
- Path quoting/escaping for POSIX shells (bash, zsh)
- Visual drop overlay with Shift hint feedback
- Multiple file support (space-separated quoted paths)
- Context menu works with sidebar and panel terminals

### Explicitly Cut
- **OS file manager (Finder) drag-drop** — WebView sandbox prevents path extraction (`File.path` unavailable, `webUtils.getPathForFile` unavailable)
- Editor terminal targeting from context menu (Shift+drag works for editor terminals)
- Windows/Linux shell path escaping (PowerShell, cmd.exe, WSL)
- Drag text/selections into terminal
- Configuration options for drag-drop behavior

## Capabilities

1. **Explorer context menu command** — Right-click → "Insert Path in AnyWhere Terminal", writes escaped path to active PTY
2. **Shift+drag event handling** — Listen for HTML5 drag-drop events with Shift key detection on terminal containers
3. **Path extraction** — Extract file paths from DataTransfer using multi-strategy approach (ResourceURLs → CodeFiles → text/uri-list → File.path → text/plain)
4. **Shell-safe path escaping** — Shared POSIX single-quote escaping utility
5. **Visual feedback** — Overlay with hint text: "Hold Shift to drop file path" / "Drop to insert path"
6. **Multi-file support** — Insert space-separated quoted paths when multiple files are selected/dropped

## Impact

- **Users**: Can insert file paths into terminal via context menu (1 click) or Shift+drag
- **Developers**: New shared `shellEscape.ts` utility + `DragDropHandler.ts` module + `insertPath` command
- **Systems**: Minor IPC addition (insertPath writes to PTY). No new dependencies.

## Risk Rating

**LOW** — Purely additive UI feature. No breaking changes. Graceful degradation if DataTransfer is unavailable.

## UI Impact & E2E

User-visible UI behavior affected? NO

This is a terminal input feature, not a new page/form/navigation. The visual overlay is minimal feedback, not a new UI component. E2E is NOT REQUIRED.
