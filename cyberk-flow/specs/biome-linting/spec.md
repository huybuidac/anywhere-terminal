# biome-linting Specification

## Purpose
TBD
## Requirements

### Requirement: biome-lint-config

Biome SHALL be configured as the project linter via a `biome.json` file at the project root.

The `biome.json` MUST enable the following lint rules (equivalent to the current ESLint config):

| Biome Rule            | Equivalent ESLint Rule                  | Severity |
| --------------------- | --------------------------------------- | -------- |
| `useBlockStatements`  | `curly`                                 | warn     |
| `noDoubleEquals`      | `eqeqeq`                               | warn     |
| `useThrowOnlyError`   | `no-throw-literal`                      | warn     |
| `useNamingConvention` | `@typescript-eslint/naming-convention`  | warn     |

The `biome.json` MUST also enable the `recommended` preset as a baseline.

#### Scenario: biome.json exists with correct rules

Given a fresh clone of the project  
When I inspect `biome.json`  
Then it SHALL contain lint rules for `useBlockStatements`, `noDoubleEquals`, `useThrowOnlyError`, and `useNamingConvention`  
And the `recommended` preset SHALL be enabled

### Requirement: eslint-removed

ESLint and typescript-eslint SHALL be completely removed from the project.

- `eslint` and `typescript-eslint` MUST be removed from `devDependencies` in `package.json`
- `eslint.config.mjs` MUST be deleted

#### Scenario: no ESLint traces remain

Given the migration is complete  
When I search the project for ESLint config files and dependencies  
Then no `eslint.config.mjs` SHALL exist  
And `package.json` SHALL NOT contain `eslint` or `typescript-eslint` in any dependency section

