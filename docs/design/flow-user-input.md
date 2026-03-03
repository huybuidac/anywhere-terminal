# Flow: User Input (Keystroke → Shell → Output)

> Part of [DESIGN.md](../DESIGN.md) - Section 3.2

## Overview

This diagram traces the complete round-trip of a single keystroke: from user pressing a key, through the IPC bridge, into the PTY shell, and back to the screen as rendered output. Includes flow control acknowledgment on the output path.

> **Cross-references**: [output-buffering.md](output-buffering.md) | [keyboard-input.md](keyboard-input.md)

## Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant WV as WebView (xterm.js)
    participant MH as MessageHandler
    participant Ext as Extension Host
    participant SM as SessionManager
    participant PTY as PtySession
    participant Shell as /bin/zsh

    User->>WV: 1. Keypress 'l' (keydown event)
    Note over WV: 2. xterm.js captures key<br/>attachCustomKeyEventHandler()<br/>→ returns true (not a shortcut)<br/>Skip if IME composing (see below)
    Note over WV: 3. xterm.onData('l') fires

    WV->>MH: 4. sendInput('l', tabId)
    MH->>Ext: 5. postMessage({ type: 'input', data: 'l', tabId: 'abc-123' })

    Ext->>SM: 6. writeToSession('abc-123', 'l')
    SM->>PTY: 7. session.pty.write('l')
    PTY->>Shell: 8. Write 'l' to PTY fd

    Note over Shell: 9. Shell receives 'l'<br/>Echo mode: shell echoes 'l' back<br/>(+ any autocomplete data)

    Shell->>PTY: 10. Shell writes 'l' to stdout
    PTY->>PTY: 11. pty.onData('l')<br/>→ append to outputBuffer<br/>→ increment unacknowledgedCharCount

    alt Buffer flush by timer (normal)
        Note over PTY: 12a. 8ms setInterval fires
        PTY->>Ext: 13a. flushOutput()
    else Buffer flush by size (burst)
        Note over PTY: 12b. outputBuffer.length >= 64KB
        PTY->>Ext: 13b. flushOutput() immediately
    end

    Ext->>WV: 14. postMessage({ type: 'output', data: 'l', tabId: 'abc-123' })

    Note over WV: 15. Route to correct xterm instance<br/>terminals.get('abc-123')
    Note over WV: 16. terminal.write(data, callback)

    Note over WV: 16a. Flow control acknowledgment:<br/>callback fires → ackBatcher.ack(data.length)<br/>When batch reaches 5K, send ack message
    WV->>Ext: 16b. postMessage({ type: 'ack', charCount: 5000 })
    Note over Ext: 16c. Decrement unacknowledgedCharCount<br/>If below 5K watermark, resume PTY reads

    WV->>User: 17. Character 'l' appears on screen
```

## Latency Budget

```mermaid
flowchart LR
    A["Key event<br/>0ms"] --> B["postMessage<br/>~1ms"]
    B --> C["PTY write<br/>~0.1ms"]
    C --> D["Shell echo<br/>~0.5ms"]
    D --> E["Buffer wait<br/>0-8ms"]
    E --> F["postMessage<br/>~1ms"]
    F --> G["xterm render<br/>~1ms"]

    style E fill:#ff9,stroke:#aa0
```

**Target**: Total round-trip < 12ms for interactive typing feel.
**Bottleneck**: The 8ms buffer timer. For interactive input, this is acceptable because individual keystrokes produce small output and the buffer flushes quickly.

## Flow Control Acknowledgment

The output path includes a flow control mechanism to prevent the PTY from overwhelming the WebView:

```mermaid
flowchart TD
    A["xterm.write(data, callback)"] --> B["callback fires:<br/>data rendered to screen"]
    B --> C["ackBatcher.ack(data.length)"]
    C --> D{"Batch >= 5K chars?"}
    D -->|No| E["Accumulate in batch"]
    D -->|Yes| F["postMessage({ type: 'ack',<br/>charCount: batchSize })"]
    F --> G["Extension: unackedCount -= charCount"]
    G --> H{"unackedCount < 5K?"}
    H -->|Yes| I["Resume PTY reads"]
    H -->|No| J["PTY reads remain paused"]
```

See [output-buffering.md](output-buffering.md) for the complete two-layer buffering and flow control design (100K high watermark / 5K low watermark).

## Special Input Cases

### Multi-byte Input (e.g., Arrow Keys)

Arrow keys produce escape sequences, not single characters:

| Key | Escape Sequence | Description |
|-----|----------------|-------------|
| Up | `\x1b[A` | Previous command in history |
| Down | `\x1b[B` | Next command in history |
| Right | `\x1b[C` | Move cursor right |
| Left | `\x1b[D` | Move cursor left |
| Home | `\x1b[H` | Move to line start |
| End | `\x1b[F` | Move to line end |

xterm.js automatically translates these key events into the correct escape sequences via `onData`.

### Paste Input (large data)

When the user pastes a large block of text:
1. xterm.js emits the entire pasted string via `onData` in one call
2. The IPC bridge sends it as a single `input` message
3. The PTY processes it character by character
4. Output buffering prevents flooding the WebView with per-character echoes

### Bracketed Paste Mode

When pasting multi-line text, the terminal may be in bracketed paste mode. The handler checks `terminal.modes.bracketedPasteMode` and wraps the pasted content accordingly:

```
if (terminal.modes.bracketedPasteMode) {
  data = '\x1b[200~' + data + '\x1b[201~';
}
```

This tells the shell that the content is pasted (not typed), preventing it from executing each line immediately. See [keyboard-input.md](keyboard-input.md) for full paste handling.

### IME Composition (CJK Input)

For Chinese, Japanese, and Korean input methods, xterm.js tracks IME composition state:

- `compositionstart` event → set `isComposing = true`
- `compositionend` event → set `isComposing = false`, send composed text
- While `isComposing`, all keyboard shortcuts are **skipped** to avoid interfering with the composition

This is critical for CJK users where multiple keystrokes compose a single character. The custom key event handler must check composition state before processing shortcuts.

### Tab Completion

When pressing `Tab`:
1. `\t` (0x09) is sent to the shell
2. Shell performs completion and may output:
   - The completed text (single match)
   - A bell character `\x07` (ambiguous)
   - A list of possibilities (multiple matches)
3. All output goes through the normal buffered output path
