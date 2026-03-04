---
description: Plan a new change using Cyberk Flow's spec-driven development workflow (7 stages)
---

# cf-plan — Cyberk Flow Planning Workflow

This workflow guides you through creating a spec-driven change plan using Cyberk Flow.

## Prerequisites

- Read the full agent instructions at `skills/cyberk-flow/agents/cf-plan.md`
- Read the skill overview at `skills/cyberk-flow/SKILL.md`
- Ensure cyberk-flow is initialized in the project (see `skills/cyberk-flow/references/init.md`)

## Workflow Steps

### Stage 1: Context Review

1. Read `cyberk-flow/project.md` for project context
2. Run `cf_changes` — list active changes with task progress
3. Run `cf_specs` — list existing specs with requirement count
4. Choose a unique verb-led `change-id` (kebab-case, e.g. `add-auth`, `refactor-db`)
5. Run `cf_new` with the change-id — scaffolds `cyberk-flow/changes/<change-id>/` with `workflow.md` and `tasks.md`
6. Register TodoWrite items for all 7 stages

**Output**: Scaffolded change directory. Announce change-id to user.

---

### Stage 2: Discovery

**Goal**: Gather all context needed to make informed decisions.

**Workstreams** (select relevant ones, justify omissions):

| # | Workstream | When to use | Tools |
|---|---|---|---|
| 1 | **Memory Recall** | Always (run FIRST) | `cf_search` |
| 2 | **Architecture Snapshot** | Always | `gkg_repo_map`, `gkg_search_codebase_definitions` |
| 3 | **Internal Patterns** | Similar features exist | `gkg_get_references`, `gkg_read_definitions` |
| 4 | **External Research** | Novel architecture or library integration | Task tool (subagent_type="librarian") |
| 5 | **Documentation** | New external library/API | Task tool (subagent_type="librarian") |
| 6 | **Constraint Check** | New dependencies or build changes | Read (package.json, tsconfig.json, etc.) |

**Execution**:
1. Run **Memory Recall** first with `cf_search`
2. Fire workstreams 2–6 **in parallel** as needed
3. Fill `discovery.md` in the change directory

**🚪 GATE: Discovery Approved** — Present options, gap analysis, and recommendation to user. Use `question` tool for open questions.

---

### Stage 3: Proposal

1. Fill `proposal.md` template:
   - **Why**: Problem statement and motivation
   - **Appetite**: `S <=1d` / `M <=3d` / `L <=2w`
   - **Scope boundaries**: In/out
   - **Capability list**: Features to implement
   - **Impact**: User/developer/system changes
   - **Risk rating**: LOW / MEDIUM / HIGH
2. Determine **UI Impact & E2E** requirement

**Output**: Completed `proposal.md`.

---

### Stage 4: Specs (Delta Format)

1. Create one spec file per capability at `cyberk-flow/changes/<change-id>/specs/<capability-name>/spec.md`
2. Use delta headings: `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`
3. Each requirement needs `### Requirement: <name>` with `#### Scenario:` blocks
4. Use **SHALL/MUST** for normative requirements

**🚪 GATE: Specs Approved** — Present spec list to user. Use `question` tool for open questions.

---

### Stage 5: Architecture Review

**When to create `design.md`**: Cross-cutting change, new external dependency, or MEDIUM/HIGH risk.

1. Use cf-oracle to review discovery, specs, proposal
2. Create Risk Map: component → risk level → mitigation
3. If HIGH risk → create spikes in `cyberk-flow/changes/<change-id>/spikes/`
4. Feed results back — update Risk Map and specs if needed

**Skip conditions**: LOW risk + no cross-cutting + no new deps → mark `[-]` with reason.

**🚪 GATE: Architecture Reviewed** — Present Risk Map and spike outcomes. Use `question` tool for decisions.

---

### Stage 6: Tasks

1. Fill `tasks.md` with execution-ordered, dependency-aware task checklist
2. Each task must have: **Track**, **Deps**, **Refs**, **Done**, **Test**, **Files**
3. Include Mermaid dependency graph
4. Test requirements:
   - Logic change → **unit test mandatory**
   - UI flow change → **e2e test mandatory**
   - Both → both required
   - `N/A` only for doc-only, config-only, or pure refactor

**Output**: Completed `tasks.md` with dependency graph.

---

### Stage 7: Validation

1. **Oracle review** (MANDATORY): Run cf-oracle to review plan completeness, task dependencies, gaps, parallelization
2. **Automated validation**: Run `cf_validate` — fix any errors
3. **Checklist**:
   - [ ] Every spec requirement has at least 1 testable scenario
   - [ ] Appetite is set and scope boundaries are clear
   - [ ] All open questions resolved or escalated
   - [ ] Rollout/migration plan exists (if applicable)
   - [ ] Security/privacy review triggered (if applicable)
   - [ ] Breaking changes have migration path (if applicable)

**🚪 GATE: Plan Approved** — Present final checklist and recommendation.

After approval, prompt user to proceed to implementation with `/cf-build <change-id>`.

## Key Rules

- **You are a PLANNER, not an implementer** — never write production code (spikes are the exception)
- **NEVER skip gates** — complete each stage before moving to the next
- **Use the `question` tool** for open questions at gates
- **All diagrams use Mermaid** — never ASCII art
- **Exhaust FREE tools before MEDIUM** — cf_*, gkg_*, Read, Glob, Grep are free
