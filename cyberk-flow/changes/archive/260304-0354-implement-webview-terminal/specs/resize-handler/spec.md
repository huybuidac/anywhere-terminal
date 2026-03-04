# Spec: resize-handler

**Parent change**: implement-webview-terminal
**Design ref**: docs/design/resize-handling.md

## ADDED Requirements

### Requirement: ResizeObserver with Debounce

The webview SHALL observe the terminal container for dimension changes using `ResizeObserver`. On resize:
- If container width or height is 0, set `pendingResize = true` and skip fit
- Otherwise, debounce `fitAddon.fit()` calls at 100ms
- After fit, the terminal's `onResize` event fires with new `cols`/`rows`, which MUST be sent to the extension: `vscode.postMessage({ type: 'resize', tabId, cols, rows })`

#### Scenario: Sidebar drag produces single resize message
- **Given** the user drags the sidebar edge for 500ms (generating ~60 resize events)
- **When** the drag stops
- **Then** only one `fitAddon.fit()` call occurs (100ms after the last event), and one `resize` message is sent

#### Scenario: Zero-dimension container skips fit
- **Given** the sidebar is collapsed (container width = 0)
- **When** ResizeObserver fires
- **Then** `pendingResize` is set to `true` and `fitAddon.fit()` is NOT called

### Requirement: Visibility-Deferred Resize

When the webview receives a `viewShow` message (view became visible), it MUST:
- If `pendingResize` is true, call `fitAddon.fit()` via `requestAnimationFrame`
- Reset `pendingResize` to false

#### Scenario: Deferred resize on sidebar expand
- **Given** `pendingResize` is true (was set during sidebar collapse)
- **When** `viewShow` message is received
- **Then** `fitAddon.fit()` is called via `requestAnimationFrame` and `pendingResize` is reset to false
