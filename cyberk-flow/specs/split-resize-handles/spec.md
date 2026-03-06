# split-resize-handles Specification

## Purpose
TBD
## Requirements

### Requirement: Drag-to-Resize Handle

The split layout SHALL render a resize handle (divider) `<div>` between each pair of split pane children. The handle MUST:

- Have class `split-handle` and a data attribute `data-direction` set to the branch's direction
- Be 4px wide (vertical split) or 4px tall (horizontal split)
- NOT consume flex space from children (use `flex: 0 0 4px`)

#### Scenario: Vertical split handle is 4px wide
- **Given** a branch with `direction: 'vertical'`
- **When** rendered
- **Then** the handle div has `width: 4px`, `flex: 0 0 4px`, and `data-direction="vertical"`

### Requirement: Pointer-Based Drag Resize

On `pointerdown` on a resize handle, the system SHALL track `pointermove` to update the parent branch's `ratio`. The drag logic MUST:

- Capture the pointer via `setPointerCapture` on pointerdown
- Calculate the new ratio from the pointer position relative to the branch container's bounds
- Update the branch's `ratio` and re-apply `flex` values to the two children
- Release capture and stop tracking on `pointerup` or `pointercancel`
- Call `fitAddon.fit()` on all affected leaf terminals after the drag ends (debounced)

#### Scenario: Dragging handle updates split ratio
- **Given** a vertical split with ratio 0.5 and container width 400px
- **When** the user drags the handle 40px to the right
- **Then** the ratio updates to 0.6 (240/400) and the first child gets `flex: 0.6`, second child gets `flex: 0.4`

### Requirement: Minimum Pane Size Constraint

During drag resize, the system MUST enforce a minimum pane size of 80px. The ratio SHALL be clamped so that neither child's computed size falls below 80px.

#### Scenario: Drag clamped at minimum size
- **Given** a vertical split with container width 400px
- **When** the user drags the handle to give the first child only 60px
- **Then** the ratio is clamped to `80/400 = 0.2` (first child gets 80px minimum)

#### Scenario: Minimum size prevents collapse
- **Given** a horizontal split with container height 200px
- **When** the user drags the handle to give the second child only 40px
- **Then** the ratio is clamped to `(200 - 80) / 200 = 0.6` (second child gets 80px minimum)

### Requirement: Cursor Feedback on Resize Handle

The resize handle MUST provide visual cursor feedback:

- Vertical split handle: `cursor: col-resize`
- Horizontal split handle: `cursor: row-resize`
- During active drag, the cursor style MUST be applied to the entire document body to prevent flickering

#### Scenario: Cursor changes on hover
- **Given** a vertical split resize handle
- **When** the user hovers over the handle
- **Then** the cursor changes to `col-resize`

### Requirement: Re-fit Terminals After Resize

After a drag resize completes (pointerup), the system MUST call `fitAddon.fit()` on all leaf terminals within the affected branch subtree. This ensures terminal dimensions match their new container sizes.

#### Scenario: Terminals re-fitted after drag
- **Given** a vertical split with terminals "a" and "b"
- **When** the user completes a drag resize
- **Then** `fitAddon.fit()` is called on both terminal "a" and terminal "b"

