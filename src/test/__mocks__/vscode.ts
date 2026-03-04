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

export const workspace: {
  workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined;
} = {
  workspaceFolders: undefined,
};

// ─── extensions ─────────────────────────────────────────────────────

// biome-ignore lint/style/useNamingConvention: matches VS Code Extension API shape (packageJSON)
let _mockExtension: { packageJSON?: { version?: string } } | undefined;

export const extensions = {
  getExtension: (_id: string) => _mockExtension,
};

// ─── window ─────────────────────────────────────────────────────────

export const window = {
  showInformationMessage: () => {},
  showErrorMessage: () => {},
};

// ─── Test Helpers (for configuring mock state) ──────────────────────

/** Set mock workspace folders for testing. */
export function __setWorkspaceFolders(folders: Array<{ uri: { fsPath: string } }> | undefined): void {
  workspace.workspaceFolders = folders;
}

/** Set mock extension for testing. */
// biome-ignore lint/style/useNamingConvention: matches VS Code Extension API shape (packageJSON)
export function __setExtension(ext: { packageJSON?: { version?: string } } | undefined): void {
  _mockExtension = ext;
}

/** Set mock appRoot for testing. */
export function __setAppRoot(appRoot: string): void {
  env.appRoot = appRoot;
}

/** Reset all mock state to defaults. */
export function __resetAll(): void {
  env.appRoot = "/mock/vscode/app";
  workspace.workspaceFolders = undefined;
  _mockExtension = undefined;
}
