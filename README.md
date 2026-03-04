# AnyWhere Terminal

Break free from the bottom panel! Put your terminal anywhere in VS Code: **Primary Sidebar**, **Secondary Sidebar**, or **Editor area**.

## Features

- **Sidebar Terminal** — Run a fully functional terminal right in the Primary Sidebar
- **Multiple Tabs** — Create, switch, and close multiple terminal sessions per view
- **Theme Integration** — Automatically matches your VS Code color theme (dark, light, high contrast)
- **Clipboard Support** — Cmd+C / Cmd+V (macOS) for copy and paste
- **Flow Control** — Handles heavy output without freezing (backpressure management)
- **WebGL Rendering** — GPU-accelerated terminal rendering for smooth performance
- **Clickable URLs** — Links in terminal output are automatically clickable

## Usage

1. Install the extension
2. Click the **Terminal** icon in the Activity Bar (left sidebar)
3. A terminal session starts automatically

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+C` | Copy selection (or send SIGINT if no selection) |
| `Cmd+V` | Paste from clipboard |
| `Cmd+K` | Clear terminal |
| `Cmd+A` | Select all |
| `Ctrl+C` | Send SIGINT to running process |

## Requirements

- VS Code 1.107.0 or later
- macOS (Windows/Linux support planned)

## Known Limitations

- Currently optimized for macOS only
- Single view location (Primary Sidebar) in Phase 1

## License

[MIT](LICENSE)
