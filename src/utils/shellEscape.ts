// src/utils/shellEscape.ts — POSIX shell path escaping utility
//
// Shared between Extension Host (context menu command) and WebView (drag-drop handler).
// Escapes a filesystem path for safe insertion into a POSIX shell (bash/zsh).

/** Characters considered dangerous for shell injection — stripped before quoting. */
const BANNED_CHARS = /[`$|&>~#!^*;<]/g;

/**
 * Escape a filesystem path for safe insertion into a POSIX shell (bash/zsh).
 *
 * Inspired by VS Code's `escapeNonWindowsPath()` but uses correct POSIX escaping.
 *
 * Rules:
 * 1. Escape backslashes: `\` → `\\`
 * 2. Strip dangerous metacharacters: `` ` $ | & > ~ # ! ^ * ; < ``
 * 3. Quote based on content:
 *    - Both `'` and `"` → ANSI-C quoting: `$'...'` with `\'` for single quotes
 *    - Only `'` → POSIX break-and-escape: `'text'\''more'`
 *    - Otherwise → simple single-quote wrap
 */
export function escapePathForShell(path: string): string {
  let escaped = path;

  // Step 1: Escape backslashes
  if (escaped.includes("\\")) {
    escaped = escaped.replace(/\\/g, "\\\\");
  }

  // Step 2: Strip dangerous shell metacharacters (preserve quotes for step 3)
  escaped = escaped.replace(BANNED_CHARS, "");

  // Step 3: Apply shell-appropriate quoting
  const hasSingleQuote = escaped.includes("'");
  const hasDoubleQuote = escaped.includes('"');

  if (hasSingleQuote && hasDoubleQuote) {
    // Both quote types → ANSI-C quoting: $'...' with \' for single quotes
    return `$'${escaped.replace(/'/g, "\\'")}'`;
  }
  if (hasSingleQuote) {
    // Only single quotes → POSIX break-and-escape pattern:
    // End current quote, insert escaped quote, restart quote: '\''
    return `'${escaped.replace(/'/g, "'\\''")}'`;
  }
  // No single quotes (may have double quotes) → simple single-quote wrap
  return `'${escaped}'`;
}
