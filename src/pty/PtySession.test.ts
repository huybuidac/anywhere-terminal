// src/pty/PtySession.test.ts — Unit tests for PtySession lifecycle
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNodePty } from "../test/__mocks__/node-pty";
import { PtySession } from "./PtySession";

// ─── Test Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── spawn ──────────────────────────────────────────────────────────

describe("PtySession.spawn", () => {
  it("spawns with correct shell, args, and options", () => {
    const session = new PtySession("test-1");
    const { mockModule, spawnCalls } = createMockNodePty();

    session.spawn(mockModule, "/bin/zsh", ["--login"], {
      cols: 120,
      rows: 40,
      cwd: "/home/user",
      env: { TERM: "xterm" },
    });

    expect(spawnCalls).toHaveLength(1);
    const [shell, args, opts] = spawnCalls[0];
    expect(shell).toBe("/bin/zsh");
    expect(args).toEqual(["--login"]);
    expect(opts.name).toBe("xterm-256color");
    expect(opts.cols).toBe(120);
    expect(opts.rows).toBe(40);
    expect(opts.cwd).toBe("/home/user");
    expect(opts.env).toEqual({ TERM: "xterm" });
    expect(session.isAlive).toBe(true);
  });

  it("defaults cols to 80 and rows to 30", () => {
    const session = new PtySession("test-2");
    const { mockModule, spawnCalls } = createMockNodePty();

    session.spawn(mockModule, "/bin/zsh", [], {});

    expect(spawnCalls[0][2].cols).toBe(80);
    expect(spawnCalls[0][2].rows).toBe(30);
  });

  it("clamps cols and rows to minimum of 1", () => {
    const session = new PtySession("test-3");
    const { mockModule, spawnCalls } = createMockNodePty();

    session.spawn(mockModule, "/bin/zsh", [], { cols: 0, rows: -5 });

    expect(spawnCalls[0][2].cols).toBe(1);
    expect(spawnCalls[0][2].rows).toBe(1);
  });

  it("no-ops when already alive", () => {
    const session = new PtySession("test-4");
    const { mockModule, spawnCalls } = createMockNodePty();

    session.spawn(mockModule, "/bin/zsh", [], {});
    session.spawn(mockModule, "/bin/bash", [], {}); // Should no-op

    expect(spawnCalls).toHaveLength(1);
    expect(session.isAlive).toBe(true);
  });

  it("no-ops when previously spawned (already used)", () => {
    const session = new PtySession("test-5");
    const { mockModule, getControls, spawnCalls } = createMockNodePty();

    session.spawn(mockModule, "/bin/zsh", [], {});
    const controls = getControls();
    controls.emitExit(0); // Process exits → isAlive = false

    session.spawn(mockModule, "/bin/zsh", [], {}); // Should no-op (hasSpawned = true)
    expect(spawnCalls).toHaveLength(1);
  });

  it("sets pid from the pty process", () => {
    const session = new PtySession("test-6");
    const { mockModule } = createMockNodePty();

    session.spawn(mockModule, "/bin/zsh", [], {});

    expect(session.pid).toBe(12345);
  });
});

// ─── write ──────────────────────────────────────────────────────────

describe("PtySession.write", () => {
  it("forwards data to pty.write() when alive", () => {
    const session = new PtySession("w-1");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.write("ls -la\n");

    expect(getControls().pty.writeCalls).toEqual(["ls -la\n"]);
  });

  it("no-ops when not spawned", () => {
    const session = new PtySession("w-2");
    session.write("should not work"); // No crash, just no-op
  });

  it("no-ops during shutdown", () => {
    const session = new PtySession("w-3");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.kill(); // Start shutdown
    session.write("should be rejected");

    expect(getControls().pty.writeCalls).toEqual([]);
  });
});

// ─── pause / resume (flow control) ─────────────────────────────────

describe("PtySession.pause / resume", () => {
  it("delegates pause() to pty.pause() when alive", () => {
    const session = new PtySession("fc-1");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.pause();

    expect(getControls().pty.pauseCalls).toBe(1);
  });

  it("delegates resume() to pty.resume() when alive", () => {
    const session = new PtySession("fc-2");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.resume();

    expect(getControls().pty.resumeCalls).toBe(1);
  });

  it("pause() is no-op when not alive", () => {
    const session = new PtySession("fc-3");
    session.pause(); // No crash, no-op
  });

  it("resume() is no-op when not alive", () => {
    const session = new PtySession("fc-4");
    session.resume(); // No crash, no-op
  });

  it("pause() is no-op after process exits", () => {
    const session = new PtySession("fc-5");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});
    getControls().emitExit(0);

    session.pause(); // No crash, no-op
    // Can't check pauseCalls because pty is cleared after exit
    expect(session.isAlive).toBe(false);
  });
});

// ─── resize ─────────────────────────────────────────────────────────

describe("PtySession.resize", () => {
  it("forwards clamped dimensions to pty.resize()", () => {
    const session = new PtySession("r-1");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.resize(100, 50);

    expect(getControls().pty.resizeCalls).toEqual([[100, 50]]);
  });

  it("clamps to minimum of 1", () => {
    const session = new PtySession("r-2");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.resize(0, -10);

    expect(getControls().pty.resizeCalls).toEqual([[1, 1]]);
  });

  it("no-ops when not alive", () => {
    const session = new PtySession("r-3");
    session.resize(80, 24); // No crash
  });
});

// ─── kill (graceful shutdown) ───────────────────────────────────────

describe("PtySession.kill", () => {
  it("sends pty.kill() after 250ms flush timeout (no data)", () => {
    const session = new PtySession("k-1");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.kill();
    expect(getControls().pty.killCalls).toEqual([]); // Not yet

    vi.advanceTimersByTime(250);
    expect(getControls().pty.killCalls).toEqual([undefined]); // SIGHUP (default)
  });

  it("rejects writes after kill() is called", () => {
    const session = new PtySession("k-2");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.kill();
    session.write("should not work");

    expect(getControls().pty.writeCalls).toEqual([]);
  });

  it("resets flush timer when data arrives during shutdown", () => {
    const session = new PtySession("k-3");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.kill();

    // Advance 200ms (not enough to trigger flush)
    vi.advanceTimersByTime(200);
    expect(getControls().pty.killCalls).toEqual([]);

    // Data arrives — resets the 250ms timer
    getControls().emitData("some output");

    // Advance another 200ms — still within new 250ms window
    vi.advanceTimersByTime(200);
    expect(getControls().pty.killCalls).toEqual([]);

    // 50 more ms → total 250ms since last data → kill fires
    vi.advanceTimersByTime(50);
    expect(getControls().pty.killCalls).toEqual([undefined]);
  });

  it("force-kills with SIGKILL after 5s if process doesn't exit", () => {
    const session = new PtySession("k-4");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.kill();

    // 250ms → SIGHUP
    vi.advanceTimersByTime(250);
    expect(getControls().pty.killCalls).toEqual([undefined]);

    // 5000ms more → SIGKILL (process didn't exit)
    vi.advanceTimersByTime(5000);
    expect(getControls().pty.killCalls).toEqual([undefined, "SIGKILL"]);
  });

  it("hard grace period (3s) force-kills even if data keeps flowing", () => {
    const session = new PtySession("k-5");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.kill();

    // Simulate continuous data that keeps resetting the flush timer.
    // Data every 100ms means the 250ms flush timer never fires.
    for (let i = 0; i < 25; i++) {
      vi.advanceTimersByTime(100);
      getControls().emitData("data");
    }

    // After 2500ms of continuous data, flush timer hasn't fired.
    // But grace period is 3000ms, so advance 500ms more to trigger it.
    vi.advanceTimersByTime(500);

    // Grace period forces kill even though data was flowing
    expect(getControls().pty.killCalls).toEqual([undefined]); // Exactly 1 kill from grace
  });

  it("is idempotent (second call is no-op)", () => {
    const session = new PtySession("k-6");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.kill();
    session.kill(); // Should no-op

    // After flush timeout, only one kill should fire
    vi.advanceTimersByTime(250);
    expect(getControls().pty.killCalls).toEqual([undefined]); // Exactly 1 kill
  });

  it("no-ops on dead session", () => {
    const session = new PtySession("k-7");
    session.kill(); // Not alive, should no-op
  });

  it("sets isAlive=false after exit fires", () => {
    const session = new PtySession("k-8");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.kill();
    vi.advanceTimersByTime(250); // Trigger SIGHUP

    // Simulate process exit
    getControls().emitExit(0);

    expect(session.isAlive).toBe(false);
  });
});

// ─── dispose ────────────────────────────────────────────────────────

describe("PtySession.dispose", () => {
  it("kills process immediately if alive (no graceful shutdown)", () => {
    const session = new PtySession("d-1");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.dispose();

    // kill() called immediately (not waiting for flush)
    expect(getControls().pty.killCalls).toEqual([undefined]);
    expect(session.isAlive).toBe(false);
  });

  it("clears all timers during active shutdown", () => {
    const session = new PtySession("d-2");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    session.kill(); // Start graceful shutdown (sets timers)
    session.dispose(); // Should clear timers and kill immediately

    expect(getControls().pty.killCalls).toEqual([undefined]); // Immediate kill from dispose
    expect(session.isAlive).toBe(false);

    // Advance time — no additional kills should fire
    vi.advanceTimersByTime(10000);
    expect(getControls().pty.killCalls).toEqual([undefined]);
  });

  it("clears callbacks", () => {
    const session = new PtySession("d-3");
    const { mockModule, getControls } = createMockNodePty();
    session.spawn(mockModule, "/bin/zsh", [], {});

    const dataCallback = vi.fn();
    const exitCallback = vi.fn();
    session.onData = dataCallback;
    session.onExit = exitCallback;

    session.dispose();

    // After dispose, pty is cleared and callbacks should not fire
    expect(session.pid).toBeUndefined();
    expect(session.isAlive).toBe(false);

    // Attempting to emit events after dispose should not trigger callbacks
    // (disposables were cleaned up, so emitData/emitExit won't reach callbacks)
    try {
      getControls().emitData("should not fire");
    } catch {
      // emitData may throw if listener was disposed — that's expected
    }
    expect(dataCallback).not.toHaveBeenCalled();
  });

  it("is safe to call on unspawned session", () => {
    const session = new PtySession("d-4");
    session.dispose(); // No crash
    expect(session.isAlive).toBe(false);
  });
});

// ─── onData / onExit callbacks ──────────────────────────────────────

describe("PtySession callbacks", () => {
  it("fires onData callback with data strings", () => {
    const session = new PtySession("cb-1");
    const { mockModule, getControls } = createMockNodePty();
    const received: string[] = [];
    session.onData = (data) => received.push(data);

    session.spawn(mockModule, "/bin/zsh", [], {});
    getControls().emitData("hello");
    getControls().emitData("world");

    expect(received).toEqual(["hello", "world"]);
  });

  it("fires onExit callback with exit code", () => {
    const session = new PtySession("cb-2");
    const { mockModule, getControls } = createMockNodePty();
    let exitCode: number | undefined;
    session.onExit = (code) => {
      exitCode = code;
    };

    session.spawn(mockModule, "/bin/zsh", [], {});
    getControls().emitExit(42);

    expect(exitCode).toBe(42);
    expect(session.isAlive).toBe(false);
  });

  it("cleans up after exit (pid undefined, disposables cleared)", () => {
    const session = new PtySession("cb-3");
    const { mockModule, getControls } = createMockNodePty();

    session.spawn(mockModule, "/bin/zsh", [], {});
    expect(session.pid).toBe(12345);

    getControls().emitExit(0);

    expect(session.pid).toBeUndefined();
    expect(session.isAlive).toBe(false);
  });
});
