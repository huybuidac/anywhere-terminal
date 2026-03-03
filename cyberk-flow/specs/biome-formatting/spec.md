# biome-formatting Specification

## Purpose
TBD
## Requirements

### Requirement: biome-formatter-config

Biome SHALL be configured as the project code formatter via the `biome.json` file.

The formatter MUST be enabled with the following settings:
- `javascript.formatter.semicolons`: `"always"` (equivalent to ESLint `semi` rule)
- Use Biome's default settings for all other formatter options (indent style, line width, quote style)

#### Scenario: formatter config is correct

Given the `biome.json` file  
When I inspect the formatter and javascript formatter sections  
Then `formatter.enabled` SHALL be `true`  
And `javascript.formatter.semicolons` SHALL be `"always"`

### Requirement: source-files-formatted

All existing TypeScript source files SHALL be formatted using Biome after integration.

#### Scenario: existing files pass format check

Given Biome is configured  
When I run `pnpm biome format --check src/`  
Then it SHALL exit with code 0 (no formatting issues)

