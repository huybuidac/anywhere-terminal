# split-container-ui Specification

## Purpose
TBD
## Requirements

### Requirement: SplitContainer Recursive Renderer

The webview SHALL implement a `SplitContainer` module that renders a `SplitNode` tree into nested DOM elements. The renderer MUST:

- For a `LeafNode`: create a container `<div>` with `class="split-leaf"` that holds the terminal's xterm.js instance
- For a `BranchNode`: create a container `<div>` with `class="split-branch"` containing two child containers separated by a resize handle `<div>`
- Recursively render the tree to arbitrary depth
- Each leaf container MUST have `data-session-id` attribute set to the terminal's sessionId

#### Scenario: Single leaf renders one terminal container
- **Given** a root `LeafNode` with sessionId "abc"
- **When** `renderSplitTree(root, parentEl)` is called
- **Then** `parentEl` contains a single `div.split-leaf[data-session-id="abc"]`

#### Scenario: Branch renders two children with divider
- **Given** a root `BranchNode` with direction 'vertical' and two leaf children
- **When** `renderSplitTree(root, parentEl)` is called
- **Then** `parentEl` contains a `div.split-branch` with three children: first leaf container, resize handle div, second leaf container

### Requirement: Flexbox Split Layout CSS

The split layout MUST use CSS flexbox for positioning:

- `split-branch` with `direction: 'horizontal'` SHALL use `flex-direction: column` (children stacked top-to-bottom)
- `split-branch` with `direction: 'vertical'` SHALL use `flex-direction: row` (children side-by-side left-to-right)
- Child sizing MUST be controlled via `flex` shorthand based on the branch's `ratio`:
  - First child: `flex: <ratio>`
  - Second child: `flex: <1 - ratio>`
- `split-leaf` containers MUST have `overflow: hidden` and `position: relative` to contain the xterm.js canvas

#### Scenario: Horizontal split stacks children vertically
- **Given** a branch with `direction: 'horizontal'` and `ratio: 0.5`
- **When** rendered
- **Then** the branch container has `flex-direction: column` and each child has `flex: 0.5`

#### Scenario: Vertical split places children side-by-side
- **Given** a branch with `direction: 'vertical'` and `ratio: 0.6`
- **When** rendered
- **Then** the branch container has `flex-direction: row`, first child has `flex: 0.6`, second child has `flex: 0.4`

### Requirement: Per-Leaf Terminal Fitting

Each leaf terminal MUST support independent `FitAddon` fitting. When the split layout changes (resize, split, unsplit):

- All visible leaf terminals SHALL have `fitAddon.fit()` called
- Fitting MUST be debounced at 100ms (consistent with existing resize strategy)
- The `renderSplitTree` function SHALL accept a callback `onLeafMounted(sessionId: string, container: HTMLDivElement)` to allow the caller to attach terminals to leaf containers

#### Scenario: After split, both terminals are fitted
- **Given** a tab is split into two leaf terminals
- **When** the split tree is rendered
- **Then** `fitAddon.fit()` is called on both terminals (debounced)

