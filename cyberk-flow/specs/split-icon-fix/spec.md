# split-icon-fix Specification

## Purpose
TBD
## Requirements

### Requirement: Split Action Button Icon Mapping

Split action buttons SHALL use matching codicon icons: the `splitHorizontal` command MUST use the `$(split-horizontal)` codicon and the `splitVertical` command MUST use the `$(split-vertical)` codicon.

#### Scenario: Correct icon-to-command mapping

- Given the `package.json` contributes.commands section
- When the `anywhereTerminal.splitHorizontal` command is defined
- Then its `icon` property SHALL be `$(split-horizontal)`
- And the `anywhereTerminal.splitVertical` command's `icon` property SHALL be `$(split-vertical)`

