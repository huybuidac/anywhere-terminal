# Spec: terminal-exit-indicator

## ADDED Requirements

### Requirement: Tab Visual Exit State

The tab bar SHALL visually distinguish exited terminals from running terminals. An exited terminal tab MUST show dimmed/italic text and append a visual indicator.

#### Scenario: Terminal exits normally

- Given a terminal tab "zsh" that is running
- When the PTY process exits with code 0
- Then the tab text SHALL be styled with reduced opacity (dimmed)
- And the tab text SHALL be italicized
- And the tab label SHALL show "zsh (exited)" or equivalent visual indicator

#### Scenario: Terminal exits with error

- Given a terminal tab "node" that is running
- When the PTY process exits with non-zero code
- Then the tab SHALL show the same exited visual indicator as normal exit

### Requirement: Exit State in Tab Bar Data

The `renderTabBar` function SHALL accept an `exited` boolean per tab and apply appropriate CSS classes for exited terminals.

#### Scenario: Tab bar receives exited state

- Given the tab bar renders with terminals data including `{ name: "zsh", exited: true }`
- When the tab element is created
- Then the tab element SHALL have a CSS class `tab-exited`
- And the close button SHALL remain functional
