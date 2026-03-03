# build-integration Specification

## Purpose
TBD
## Requirements

### Requirement: npm-scripts-updated

> Original: `package.json` scripts use `eslint src` for linting (no format script exists).

The npm scripts in `package.json` SHALL be updated to use Biome:

- `lint` script MUST run `biome check src/` (covers both lint and format checks)
- A new `format` script MUST run `biome format --write src/` for auto-formatting
- All scripts that reference the `lint` script (`compile`, `package`, `pretest`) SHALL continue to work correctly with the updated `lint` script

#### Scenario: lint script uses Biome

Given the updated `package.json`  
When I run `pnpm run lint`  
Then Biome SHALL execute lint and format checks on `src/`

#### Scenario: format script auto-formats

Given the updated `package.json`  
When I run `pnpm run format`  
Then Biome SHALL format all files in `src/` in-place

### Requirement: project-md-updated

The `cyberk-flow/project.md` file SHALL be updated to reflect the new lint and format commands.

- **Lint** command MUST be updated to `pnpm run lint`
- **Format** command MUST be added: `pnpm run format`

#### Scenario: project.md reflects Biome commands

Given the migration is complete  
When I read `cyberk-flow/project.md`  
Then the Lint command SHALL reference `pnpm run lint` (Biome)  
And a Format command SHALL exist

