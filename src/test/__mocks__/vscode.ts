// src/test/__mocks__/vscode.ts — Manual mock for the `vscode` module
// Used by Vitest via resolve.alias in vitest.config.mts
// Stubs only the subset of VS Code API used by our source code.

// ─── Uri ────────────────────────────────────────────────────────────

export const Uri = {
  joinPath: (base: { fsPath: string }, ...pathSegments: string[]) => ({
    fsPath: [base.fsPath, ...pathSegments].join("/"),
  }),
  file: (path: string) => ({ fsPath: path }),
};

// ─── env ────────────────────────────────────────────────────────────

export const env = {
  appRoot: "/mock/vscode/app",
};

// ─── workspace ──────────────────────────────────────────────────────

/** Mock configuration store — maps section.key to value. */
let _mockConfigValues: Record<string, unknown> = {};

/** Mock configuration change handlers. */
const _configChangeHandlers: Array<(e: { affectsConfiguration: (section: string) => boolean }) => void> = [];

/** Creates a mock configuration object for a given section. */
function createMockConfiguration(section: string) {
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      const fullKey = section ? `${section}.${key}` : key;
      const value = _mockConfigValues[fullKey];
      return (value !== undefined ? value : defaultValue) as T | undefined;
    },
    has: (key: string): boolean => {
      const fullKey = section ? `${section}.${key}` : key;
      return fullKey in _mockConfigValues;
    },
    update: () => Promise.resolve(),
    inspect: () => undefined,
  };
}

export const workspace: {
  workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined;
  getConfiguration: (section?: string) => ReturnType<typeof createMockConfiguration>;
  onDidChangeConfiguration: (handler: (e: { affectsConfiguration: (section: string) => boolean }) => void) => {
    dispose: () => void;
  };
} = {
  workspaceFolders: undefined,
  getConfiguration: (section = "") => createMockConfiguration(section),
  onDidChangeConfiguration: (handler) => {
    _configChangeHandlers.push(handler);
    return {
      dispose: () => {
        const idx = _configChangeHandlers.indexOf(handler);
        if (idx !== -1) {
          _configChangeHandlers.splice(idx, 1);
        }
      },
    };
  },
};

// ─── extensions ─────────────────────────────────────────────────────

let _mockExtension: { packageJSON?: { version?: string } } | undefined;

export const extensions = {
  getExtension: (_id: string) => _mockExtension,
};

// ─── window ─────────────────────────────────────────────────────────

/** Creates a mock WebviewPanel for testing. */
function createMockWebviewPanel(
  _viewType: string,
  title: string,
  _showOptions: unknown,
  options?: { enableScripts?: boolean; retainContextWhenHidden?: boolean; localResourceRoots?: unknown[] },
) {
  const messageHandlers: Array<(msg: unknown) => void> = [];
  const disposeHandlers: Array<() => void> = [];
  const viewStateHandlers: Array<(e: { webviewPanel: { visible: boolean } }) => void> = [];

  const panel = {
    title,
    visible: true,
    webview: {
      html: "",
      options: options ?? {},
      cspSource: "https://mock.csp.source",
      asWebviewUri: (uri: { fsPath: string }) => uri.fsPath,
      onDidReceiveMessage: (handler: (msg: unknown) => void) => {
        messageHandlers.push(handler);
        return { dispose: () => {} };
      },
      postMessage: (_msg: unknown) => Promise.resolve(true),
    },
    onDidDispose: (handler: () => void) => {
      disposeHandlers.push(handler);
      return { dispose: () => {} };
    },
    onDidChangeViewState: (handler: (e: { webviewPanel: { visible: boolean } }) => void) => {
      viewStateHandlers.push(handler);
      return { dispose: () => {} };
    },
    dispose: () => {
      for (const handler of disposeHandlers) {
        handler();
      }
    },
    // Test helpers
    __messageHandlers: messageHandlers,
    __disposeHandlers: disposeHandlers,
    __viewStateHandlers: viewStateHandlers,
  };
  return panel;
}

export const window = {
  showInformationMessage: () => {},
  showErrorMessage: () => {},
  createWebviewPanel: createMockWebviewPanel,
  registerWebviewViewProvider: (_viewType: string, _provider: unknown, _options?: unknown) => ({
    dispose: () => {},
  }),
};

// ─── ViewColumn ─────────────────────────────────────────────────────

export const ViewColumn = {
  Active: -1,
  Beside: -2,
  One: 1,
  Two: 2,
};

// ─── commands ───────────────────────────────────────────────────────

export const commands = {
  registerCommand: (_command: string, _callback: (...args: unknown[]) => unknown) => ({
    dispose: () => {},
  }),
  executeCommand: (_command: string, ..._args: unknown[]) => Promise.resolve(),
};

// ─── Test Helpers (for configuring mock state) ──────────────────────

/** Set mock workspace folders for testing. */
export function __setWorkspaceFolders(folders: Array<{ uri: { fsPath: string } }> | undefined): void {
  workspace.workspaceFolders = folders;
}

/** Set mock extension for testing. */
export function __setExtension(ext: { packageJSON?: { version?: string } } | undefined): void {
  _mockExtension = ext;
}

/** Set mock appRoot for testing. */
export function __setAppRoot(appRoot: string): void {
  env.appRoot = appRoot;
}

/** Set mock configuration values for testing. Keys should be fully qualified (e.g., "anywhereTerminal.fontSize"). */
export function __setConfigValues(values: Record<string, unknown>): void {
  _mockConfigValues = { ...values };
}

/** Fire a mock configuration change event. */
export function __fireConfigChange(affectedSections: string[]): void {
  const event = {
    affectsConfiguration: (section: string) =>
      affectedSections.some((s) => s === section || s.startsWith(`${section}.`)),
  };
  for (const handler of _configChangeHandlers) {
    handler(event);
  }
}

/** Reset all mock state to defaults. */
export function __resetAll(): void {
  env.appRoot = "/mock/vscode/app";
  workspace.workspaceFolders = undefined;
  _mockExtension = undefined;
  _mockConfigValues = {};
  _configChangeHandlers.length = 0;
}
