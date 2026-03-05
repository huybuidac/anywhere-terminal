# Discovery: add-panel-terminal-view

## Workstreams

| # | Workstream | Used? | Justification |
|---|---|---|---|
| 1 | Memory Recall | Yes | Seeded context from prior changes and design docs |
| 2 | Architecture Snapshot | Yes | Read TerminalViewProvider, extension.ts, package.json |
| 3 | Internal Patterns | Yes | Sidebar registration pattern already exists — reuse exactly |
| 4 | External Research | Skipped | No novel architecture — standard VS Code panel registration |
| 5 | Documentation | Skipped | VS Code viewsContainers.panel is well-known API |
| 6 | Constraint Check | Yes | Verified package.json structure |

## Key Findings

### 1. TerminalViewProvider is already panel-ready
- `TerminalViewProvider.panelViewType = "anywhereTerminal.panel"` — static constant already defined
- Constructor accepts `location: "sidebar" | "panel"` — already parameterized
- `getViewId()` already returns the correct viewType based on location
- HTML body includes `data-terminal-location="${this.location}"` — theme integration ready

### 2. extension.ts only registers sidebar
- Current code registers only `sidebarProvider` with `TerminalViewProvider.sidebarViewType`
- Need to add a second instance with `location: "panel"` and register with `panelViewType`

### 3. package.json needs panel entries
- `viewsContainers.panel` section does not exist yet — needs to be added
- `views.anywhereTerminalPanel` does not exist — needs to be added
- `activationEvents` only has `onView:anywhereTerminal.sidebar` — needs panel event

### 4. Existing spec coverage
- `view-registration` spec covers sidebar only (5 requirements)
- No existing spec for panel registration — delta specs needed

## Gap Analysis

| Have | Need |
|---|---|
| TerminalViewProvider with panel support | Registration in extension.ts |
| Sidebar view container in package.json | Panel view container in package.json |
| Sidebar activation event | Panel activation event |
| Sidebar provider registration | Panel provider registration |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Reuse TerminalViewProvider | Yes | Class already designed for multi-location |
| Separate view container for panel | Yes | VS Code requires distinct container IDs per location |
| retainContextWhenHidden | true | Consistent with sidebar; prevents terminal state loss |

## Risks & Constraints

- **LOW risk**: All code paths already exist and are tested for sidebar. Panel is identical pattern.
- No new dependencies.
- No breaking changes.

## Open Questions

None — the design is fully specified in DESIGN.md and the provider is already implemented.
