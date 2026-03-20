# Spec: drag-drop-path-insertion

## ADDED Requirements

### Requirement: insert-path-context-menu

When a user right-clicks one or more files or folders in VS Code's Explorer and selects "Insert Path in AnyWhere Terminal", the system SHALL escape each file path for POSIX shell and write the escaped paths to the active terminal session's PTY, without executing the command.

#### Scenario: Single file via context menu
- Given: a terminal session is active and not exited
- When: user right-clicks a file in Explorer and selects "Insert Path in AnyWhere Terminal"
- Then: the file's absolute path is shell-escaped and written to the active pane's PTY
- And: a trailing space is appended after the path

#### Scenario: Multiple files via context menu
- Given: a terminal session is active
- When: user selects 3 files in Explorer, right-clicks and selects "Insert Path in AnyWhere Terminal"
- Then: all 3 paths are escaped, joined with spaces, and written as a single string with a trailing space

### Requirement: drop-file-path-insertion

When a user holds Shift and drops one or more files from VS Code's Explorer onto a terminal instance, the system SHALL extract file paths from the drop event's DataTransfer and insert them as shell-escaped text into the active terminal session via the existing `input` message, without executing the command.

**Limitation**: OS file manager (Finder) drops are NOT supported — the sandboxed WebView iframe does not have access to `File.path` or `webUtils.getPathForFile()`, so file paths cannot be extracted from Finder drag events.

#### Scenario: Single file Shift+dropped from Explorer
- Given: a terminal session is active and not exited
- When: user holds Shift and drops a single file from VS Code Explorer onto the terminal
- Then: the file's absolute path is extracted, shell-escaped, and sent as input to the active pane's PTY
- And: a trailing space is appended after the path

#### Scenario: Multiple files dropped
- Given: a terminal session is active
- When: user drops 3 files at once
- Then: all 3 paths are extracted, each shell-escaped, joined with spaces, and sent as a single input string with a trailing space

#### Scenario: Drop on exited terminal
- Given: the terminal process has exited (`instance.exited === true`)
- When: user drops a file
- Then: no input is sent to the PTY (graceful no-op)

#### Scenario: No extractable path in DataTransfer
- Given: a drag-drop event fires but contains no recognizable file path data
- When: the drop handler processes the event
- Then: no input is sent (graceful no-op, no errors logged to user)

### Requirement: path-extraction-strategy

The system SHALL attempt to extract file paths from the DataTransfer object using the following strategies in priority order, stopping at the first successful extraction:

1. `dataTransfer.getData('ResourceURLs')` — parse as JSON array of URI strings (best-effort: may not be available in extension WebViews)
2. `dataTransfer.getData('CodeFiles')` — parse as JSON array of file path strings (best-effort: may not be available)
3. `dataTransfer.getData('text/uri-list')` — parse as newline-separated `file://` URIs
4. `dataTransfer.files` with `.path` property — Electron non-standard file path (NOTE: unavailable in sandboxed WebView iframes — kept for future compatibility)
5. `dataTransfer.getData('text/plain')` — use as raw path if it starts with `/`

**Limitation**: OS file manager (Finder) drops do NOT provide usable path data in sandboxed WebView iframes (`File.path` is undefined, `webUtils.getPathForFile` is unavailable). Strategy 4 is retained for potential future Electron/VS Code changes but is currently non-functional for Finder drags.

Each strategy MUST be wrapped in try/catch to handle malformed data gracefully. File URIs MUST be decoded using `decodeURIComponent()` before returning, to convert percent-encoded characters (e.g., `%20`) back to their original form.

#### Scenario: Explorer drag provides ResourceURLs
- When: `dataTransfer.getData('ResourceURLs')` returns `'["file:///Users/me/project/src/index.ts"]'`
- Then: path `/Users/me/project/src/index.ts` is extracted from the `file://` URI

#### Scenario: URI with percent-encoded spaces
- When: a URI contains `file:///Users/me/My%20Documents/file.txt`
- Then: path `/Users/me/My Documents/file.txt` is extracted with `%20` decoded to space

#### Scenario: Finder drag provides File.path (currently non-functional — Electron sandbox limitation)
- When: `dataTransfer.files[0]` has `.path` property set to `/Users/me/Downloads/report.pdf`
- Then: path `/Users/me/Downloads/report.pdf` is extracted
- NOTE: In practice, `File.path` is `undefined` in sandboxed WebView iframes. This scenario is retained for future compatibility.

#### Scenario: Fallback to text/plain
- When: only `text/plain` is available containing `/Users/me/file.txt`
- Then: path `/Users/me/file.txt` is used since it starts with `/`

#### Scenario: Malformed JSON in ResourceURLs
- When: `dataTransfer.getData('ResourceURLs')` returns `'{invalid json'`
- Then: strategy 1 fails silently, system falls through to strategy 2

#### Scenario: Strategy precedence — first success wins
- When: both `ResourceURLs` and `text/plain` contain valid data
- Then: `ResourceURLs` result is used (strategy 1 takes precedence over strategy 5)

### Requirement: posix-path-escaping

The system SHALL escape file paths for POSIX shells (bash, zsh) using single-quote wrapping, compatible with VS Code's `escapeNonWindowsPath()` behavior:

- Paths MUST be wrapped in single quotes: `'/path/to/file'`
- Single quotes within paths MUST be escaped: `'` → `'\''`
- Dangerous shell metacharacters (`` ` $ | & > ~ # ! ^ * ; < ``) MUST be stripped before quoting
- Backslashes MUST be escaped: `\` → `\\`
- Paths containing both single and double quotes MUST use `$'...'` ANSI-C quoting with `\'` for single quotes

#### Scenario: Simple path with no special characters
- Input: `/Users/me/project/file.txt`
- Output: `'/Users/me/project/file.txt'`

#### Scenario: Path with spaces
- Input: `/Users/me/My Documents/file.txt`
- Output: `'/Users/me/My Documents/file.txt'`

#### Scenario: Path with single quote
- Input: `/Users/me/it's a file.txt`
- Output: `'/Users/me/it'\''s a file.txt'`

#### Scenario: Path with dangerous shell characters
- Input: `/Users/me/file$(echo evil).txt`
- Output: `'/Users/me/file(echo evil).txt'` (dangerous chars stripped)

#### Scenario: Path with both single and double quotes
- Input: `/Users/me/it's a "file".txt`
- Output: `$'/Users/me/it\'s a "file".txt'`

### Requirement: drag-visual-feedback

The system SHALL display a translucent overlay on the terminal container during a file drag-over to indicate the drop target, and remove it when the drag leaves or the drop completes.

- The overlay MUST use CSS variable `--vscode-terminal-dropBackground` with fallback to `--vscode-editorGroup-dropBackground` for the background color
- The overlay MUST be absolutely positioned to cover the entire terminal container
- The overlay MUST use `pointer-events: none` to not interfere with the drop event
- The overlay MUST be removed on `dragleave` and `drop` events
- The `dragover` event handler MUST call `e.preventDefault()` to allow the drop

#### Scenario: File dragged over terminal
- When: user drags a file over `#terminal-container`
- Then: a semi-transparent overlay appears covering the terminal area

#### Scenario: File dragged away
- When: user drags a file away from the terminal (dragleave)
- Then: the overlay is removed

#### Scenario: File dropped
- When: user completes the drop
- Then: the overlay is removed and the path is inserted
