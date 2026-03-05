# Delta Spec: Editor Command Registration

**Target spec**: `cyberk-flow/specs/editor-command-registration/spec.md` (new)

## ADDED Requirements

### Requirement: Command Declaration

`package.json` SHALL declare the `anywhereTerminal.newTerminalInEditor` command under `contributes.commands` with:
- `command`: `"anywhereTerminal.newTerminalInEditor"`
- `title`: `"AnyWhere Terminal: New Terminal in Editor"`

#### Scenario: Command appears in palette

- **Given**: The extension is installed and active
- **When**: User opens Command Palette (Cmd+Shift+P)
- **And**: Types "AnyWhere Terminal"
- **Then**: "AnyWhere Terminal: New Terminal in Editor" appears in the list

### Requirement: Command Activation Event

`package.json` SHALL include `onCommand:anywhereTerminal.newTerminalInEditor` in the `activationEvents` array to ensure the extension activates when the command is invoked.

#### Scenario: Extension activates on command

- **Given**: The extension is not yet activated
- **When**: User executes `anywhereTerminal.newTerminalInEditor` from Command Palette
- **Then**: The extension activates
- **And**: The command handler creates an editor terminal panel

### Requirement: Command Handler Registration

`extension.ts` SHALL register a command handler for `anywhereTerminal.newTerminalInEditor` during `activate()`. The handler MUST call `TerminalEditorProvider.createPanel()` and push the returned disposable to `context.subscriptions`.

#### Scenario: Command handler wired correctly

- **Given**: The extension has activated
- **When**: `anywhereTerminal.newTerminalInEditor` command is executed
- **Then**: `TerminalEditorProvider.createPanel()` is called
- **And**: A new editor terminal panel is created and returned
