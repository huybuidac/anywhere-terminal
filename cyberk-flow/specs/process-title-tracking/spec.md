# process-title-tracking Specification

## Purpose
TBD
## Requirements

### Requirement: OSC Title Change Handling

The webview SHALL listen for xterm.js `onTitleChange` events on each terminal instance and update the `TerminalInstance.name` property with the new title.

#### Scenario: Shell sets window title via OSC sequence

- Given a terminal running zsh (which sets `\e]0;user@host:~/dir\a` by default)
- When the OSC title change event fires with title "user@host:~/dir"
- Then `TerminalInstance.name` SHALL be updated to "user@host:~/dir"
- And the tab bar SHALL re-render to show the new name

#### Scenario: No OSC title set (fallback)

- Given a terminal where the shell does not emit OSC title sequences
- When no `onTitleChange` event fires
- Then the tab name SHALL remain as the default "Terminal N"

### Requirement: Tab Bar Process Name Display

The tab bar SHALL display the current process name (from OSC title) for each terminal tab. When a terminal is part of a split layout and is the active pane, the tab bar SHALL show the active pane's process name.

#### Scenario: Tab bar shows updated process name

- Given a terminal with name updated to "node index.js" via OSC title
- When the tab bar renders
- Then the tab SHALL display "node index.js" as the tab label

#### Scenario: Split pane active name

- Given a split tab with two panes, the active pane has name "python"
- When the tab bar renders
- Then the tab SHALL display "python" as the tab label

