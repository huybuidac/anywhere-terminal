---
labels: [pty, race-condition, lifecycle]
source: cyberk-flow/changes/implement-ipc-messaging
summary: When creating a PTY session, store _ptySession/_outputBuffer/_sessionId BEFORE wiring onData/onExit callbacks. A fast PTY exit can fire onExit before refs are stored, causing the sessionId guard to fail. Also guard onExit with `if (this._sessionId !== sessionId) return;` to prevent stale sessions from corrupting active state.
---
# --title Session race: assign refs before wiring async callbacks
**Date**: 2026-03-04

When creating a PTY session, store _ptySession/_outputBuffer/_sessionId BEFORE wiring onData/onExit callbacks. A fast PTY exit can fire onExit before refs are stored, causing the sessionId guard to fail. Also guard onExit with `if (this._sessionId !== sessionId) return;` to prevent stale sessions from corrupting active state.
