# Spec: Extract Simple Modules

No behavioral changes. This is a pure structural refactor — code moves from `main.ts` to dedicated modules with identical behavior. No new requirements, no modified requirements, no removed requirements.

## Invariants

- All terminal theme resolution, application, and watching behavior remains identical
- Error/warning/info banner display and auto-dismiss behavior remains identical
- Terminal fit calculation using xterm `_core._renderService` remains identical
- No xterm private API access exists outside `XtermFitService` after extraction
- `main.ts` compiles and passes type-check after each extraction
