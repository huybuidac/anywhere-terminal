## ADDED Requirements

_None — pure refactor, no new behavior._

## MODIFIED Requirements

_None — no spec changes._

## REMOVED Requirements

_None._

## RENAMED Requirements

_None._

---

**Note**: This change is a pure structural refactoring. All runtime behavior is preserved exactly. The message types, state shape, resize timing, and debounce behavior remain identical. The only change is code organization — moving functions and state from `main.ts` into focused modules with explicit interfaces.
