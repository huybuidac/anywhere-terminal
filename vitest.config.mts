import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Discover colocated test files under src/
    include: ["src/**/*.test.ts"],
    // Exclude integration tests and build artifacts
    exclude: ["node_modules", "dist", "out", "src/test/extension.test.ts"],
    // Resolve `vscode` module to our manual mock
    alias: {
      vscode: path.resolve(__dirname, "src/test/__mocks__/vscode.ts"),
    },
    // Coverage configuration
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/test/**",
        "src/webview/**",
        "src/types/messages.ts",
        "src/**/*.test.ts",
        "src/extension.ts",
        "src/providers/**",
      ],
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
