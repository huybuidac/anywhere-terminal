---
labels: [pty, shutdown, vscode, timers]
source: src/pty/PtySession.ts
summary: Graceful PTY shutdown pattern: (1) set _isShuttingDown, (2) start 250ms flush timer that resets on each onData (but not after kill is sent), (3) hard grace deadline (3s) prevents indefinite stall on chatty processes, (4) _executeKill() sends SIGHUP via pty.kill(), (5) 5s force-kill timer sends SIGKILL if still alive. Use _killSent flag for idempotency. On exit: dispose all event subscriptions, clear process reference, clear all timers.
---
# --title Graceful PTY shutdown with bounded timers
**Date**: 2026-03-04

Graceful PTY shutdown pattern: (1) set _isShuttingDown, (2) start 250ms flush timer that resets on each onData (but not after kill is sent), (3) hard grace deadline (3s) prevents indefinite stall on chatty processes, (4) _executeKill() sends SIGHUP via pty.kill(), (5) 5s force-kill timer sends SIGKILL if still alive. Use _killSent flag for idempotency. On exit: dispose all event subscriptions, clear process reference, clear all timers.
