// src/test/__mocks__/node-pty.ts — Mock factory for node-pty types
// Used by PtySession tests to create controllable mock PTY processes.

import type { NodePtyModule, Pty, PtyForkOptions } from "../../pty/PtyManager";

/** Captured event listeners from a mock PTY. */
export interface MockPtyControls {
  /** Simulate PTY data output. */
  emitData: (data: string) => void;
  /** Simulate PTY process exit. */
  emitExit: (exitCode: number, signal?: number) => void;
  /** The underlying mock Pty object (for assertions). */
  pty: Pty & {
    /** All calls to write() */
    writeCalls: string[];
    /** All calls to resize() as [cols, rows] */
    resizeCalls: Array<[number, number]>;
    /** All calls to kill() with optional signal */
    killCalls: Array<string | undefined>;
  };
}

/**
 * Create a mock NodePtyModule and controls for testing PtySession.
 *
 * Usage:
 * ```ts
 * const { mockModule, getControls } = createMockNodePty();
 * session.spawn(mockModule, "/bin/zsh", ["--login"], { cols: 80, rows: 30 });
 * const controls = getControls();
 * controls.emitData("hello");
 * controls.emitExit(0);
 * ```
 */
export function createMockNodePty(): {
  mockModule: NodePtyModule;
  /** Get controls for the most recently spawned PTY. */
  getControls: () => MockPtyControls;
  /** All spawn calls: [shell, args, options] */
  spawnCalls: Array<[string, string[], PtyForkOptions]>;
} {
  let latestControls: MockPtyControls | undefined;
  const spawnCalls: Array<[string, string[], PtyForkOptions]> = [];

  const mockModule: NodePtyModule = {
    spawn(file: string, args: string[], options: PtyForkOptions): Pty {
      spawnCalls.push([file, args, options]);

      // Event listener storage
      let dataListener: ((data: string) => void) | undefined;
      let exitListener: ((e: { exitCode: number; signal?: number }) => void) | undefined;

      const mockPty: MockPtyControls["pty"] = {
        pid: 12345,
        cols: options.cols ?? 80,
        rows: options.rows ?? 30,
        writeCalls: [],
        resizeCalls: [],
        killCalls: [],

        write(data: string) {
          mockPty.writeCalls.push(data);
        },
        resize(columns: number, rows: number) {
          mockPty.resizeCalls.push([columns, rows]);
        },
        kill(signal?: string) {
          mockPty.killCalls.push(signal);
        },
        pause() {},
        resume() {},

        onData(listener: (data: string) => void) {
          dataListener = listener;
          return {
            dispose() {
              dataListener = undefined;
            },
          };
        },
        onExit(listener: (e: { exitCode: number; signal?: number }) => void) {
          exitListener = listener;
          return {
            dispose() {
              exitListener = undefined;
            },
          };
        },
      };

      latestControls = {
        pty: mockPty,
        emitData(data: string) {
          dataListener?.(data);
        },
        emitExit(exitCode: number, signal?: number) {
          exitListener?.({ exitCode, signal });
        },
      };

      return mockPty;
    },
  };

  return {
    mockModule,
    getControls: () => {
      if (!latestControls) {
        throw new Error("No PTY has been spawned yet");
      }
      return latestControls;
    },
    spawnCalls,
  };
}
