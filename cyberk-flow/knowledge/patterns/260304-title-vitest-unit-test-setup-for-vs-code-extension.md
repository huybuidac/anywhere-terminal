---
labels: [vitest, testing, mocking, coverage, vscode-extension]
source: cyberk-flow/changes/add-unit-tests
summary: Set up Vitest with manual vscode mock (resolve.alias), node-pty mock factory, and v8 coverage. Key patterns: vi.mock("node:fs") for module-level mocking, vi.useFakeTimers() for timer-based tests, colocated test files, 80% coverage threshold. Excluded extension.ts and providers/ from coverage (VS Code-coupled).
---
# --title Vitest unit test setup for VS Code extension
**Date**: 2026-03-04

Set up Vitest with manual vscode mock (resolve.alias), node-pty mock factory, and v8 coverage. Key patterns: vi.mock("node:fs") for module-level mocking, vi.useFakeTimers() for timer-based tests, colocated test files, 80% coverage threshold. Excluded extension.ts and providers/ from coverage (VS Code-coupled).
