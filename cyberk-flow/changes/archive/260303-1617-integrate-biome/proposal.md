# Proposal: integrate-biome

## Why

The project currently uses ESLint 9 with typescript-eslint for linting, and has no code formatter. This requires maintaining a separate ESLint config and two npm dependencies. Biome is a fast, Rust-based tool that unifies linting and formatting in a single dependency with a single config file, reducing toolchain complexity and improving developer experience.

## Appetite

**S <=1d** — Small codebase (2 TS files), straightforward tool swap.

## Scope Boundaries

### In scope
- Install `@biomejs/biome` as devDependency
- Create `biome.json` with lint rules equivalent to existing ESLint config
- Enable Biome formatter (default settings)
- Update npm scripts (`lint`, `format`) to use Biome
- Remove ESLint and typescript-eslint dependencies
- Remove `eslint.config.mjs`
- Update `project.md` to reflect new lint/format commands
- Run Biome format on existing source files

### Out of scope
- CI/CD pipeline changes (none exists)
- Pre-commit hooks (can be added later)
- Editor-specific settings (VS Code Biome extension)

## Capabilities

1. **Biome Linting** — Lint TypeScript files with rules equivalent to current ESLint config
2. **Biome Formatting** — Format TypeScript files with Biome's default formatter
3. **Build Integration** — npm scripts updated to use Biome for lint and format checks

## Impact

- **Developers**: Single tool for lint+format, faster execution, simpler config
- **Users**: No impact (tooling-only change)
- **Systems**: Fewer devDependencies (2 removed, 1 added)

## Risk Rating

**LOW** — Tool swap on a small codebase with no custom plugins or complex ESLint rules.

## UI Impact & E2E

**NO** — This is a developer tooling change with no user-visible UI behavior. E2E is NOT REQUIRED.
