// esbuild.js — Dual-target build for AnyWhere Terminal
//
// Extension bundle: dist/extension.js (CJS, Node.js)
// WebView bundle:   media/webview.js  (IIFE, browser)

const esbuild = require("esbuild");
const { copyFileSync, mkdirSync, existsSync } = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * esbuild problem matcher plugin for VS Code task integration.
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`\u2718 [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      console.log("[watch] build finished");
    });
  },
};

/**
 * Plugin to copy xterm.css to media/ after a successful build.
 * @type {import('esbuild').Plugin}
 */
const copyXtermCssPlugin = {
  name: "copy-xterm-css",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) {
        const src = require.resolve("@xterm/xterm/css/xterm.css");
        const dest = path.join(__dirname, "media", "xterm.css");

        // Ensure media/ directory exists
        const mediaDir = path.join(__dirname, "media");
        if (!existsSync(mediaDir)) {
          mkdirSync(mediaDir, { recursive: true });
        }

        try {
          copyFileSync(src, dest);
          console.log("[copy] xterm.css -> media/xterm.css");
        } catch (err) {
          console.warn("[copy] Failed to copy xterm.css:", err.message);
        }
      }
    });
  },
};

// --- Extension Host Bundle ---
const extensionConfig = {
  entryPoints: ["./src/extension.ts"],
  bundle: true,
  outfile: "./dist/extension.js",
  format: "cjs",
  platform: "node",
  target: "node18",
  external: [
    "vscode", // Provided by VS Code runtime
    "node-pty", // Loaded dynamically from VS Code internals
  ],
  sourcemap: !production,
  sourcesContent: false,
  minify: production,
  logLevel: "silent",
  plugins: [esbuildProblemMatcherPlugin],
};

// --- WebView Bundle ---
const webviewConfig = {
  entryPoints: ["./src/webview/main.ts"],
  bundle: true,
  outfile: "./media/webview.js",
  format: "iife",
  platform: "browser",
  target: "es2020",
  // No externals — everything is bundled:
  //   @xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links
  sourcemap: !production,
  sourcesContent: false,
  minify: production,
  logLevel: "silent",
  plugins: [esbuildProblemMatcherPlugin, copyXtermCssPlugin],
};

// --- Build Entry Point ---
async function main() {
  if (watch) {
    // Watch mode: both targets rebuild incrementally in parallel
    const [extCtx, wvCtx] = await Promise.all([esbuild.context(extensionConfig), esbuild.context(webviewConfig)]);
    await Promise.all([extCtx.watch(), wvCtx.watch()]);
    console.log("Watching for changes...");
  } else {
    // Single build: build both targets in parallel
    await Promise.all([esbuild.build(extensionConfig), esbuild.build(webviewConfig)]);
    console.log("Build complete.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
