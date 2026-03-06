# split-ipc-messages Specification

## ADDED Requirements

### Requirement: SplitPane Extension-to-WebView Message

The IPC protocol SHALL define a `SplitPaneMessage` sent from the Extension Host to the WebView to trigger a split action:

```typescript
interface SplitPaneMessage {
  type: 'splitPane';
  direction: 'horizontal' | 'vertical';
}
```

The message MUST be added to the `ExtensionToWebViewMessage` union type.

#### Scenario: SplitPane message triggers split in webview
- **Given** the webview receives `{ type: 'splitPane', direction: 'vertical' }`
- **When** the message handler processes it
- **Then** the webview initiates a split of the active pane in the vertical direction

### Requirement: RequestSplitSession WebView-to-Extension Message

The IPC protocol SHALL define a `RequestSplitSessionMessage` sent from the WebView to the Extension Host to request a new PTY session for a split pane:

```typescript
interface RequestSplitSessionMessage {
  type: 'requestSplitSession';
  direction: 'horizontal' | 'vertical';
  sourcePaneId: string;
}
```

The message MUST be added to the `WebViewToExtensionMessage` union type. The `sourcePaneId` identifies which pane is being split.

#### Scenario: WebView requests new session for split
- **Given** the user triggers a vertical split on pane "abc"
- **When** the webview processes the split command
- **Then** it sends `{ type: 'requestSplitSession', direction: 'vertical', sourcePaneId: 'abc' }` to the extension host

### Requirement: SplitPaneCreated Extension-to-WebView Message

The IPC protocol SHALL define a `SplitPaneCreatedMessage` sent from the Extension Host to the WebView after a new split session is created:

```typescript
interface SplitPaneCreatedMessage {
  type: 'splitPaneCreated';
  sourcePaneId: string;
  newSessionId: string;
  newSessionName: string;
  direction: 'horizontal' | 'vertical';
}
```

The message MUST be added to the `ExtensionToWebViewMessage` union type.

#### Scenario: Extension confirms split session creation
- **Given** the extension host receives a `requestSplitSession` for pane "abc" with direction "vertical"
- **When** a new PTY session "def" is created
- **Then** it sends `{ type: 'splitPaneCreated', sourcePaneId: 'abc', newSessionId: 'def', newSessionName: 'Terminal 2', direction: 'vertical' }` to the webview

### Requirement: CloseSplitPane Extension-to-WebView Message

The IPC protocol SHALL define a `CloseSplitPaneMessage` sent from the Extension Host to the WebView to close the active split pane:

```typescript
interface CloseSplitPaneMessage {
  type: 'closeSplitPane';
}
```

The message MUST be added to the `ExtensionToWebViewMessage` union type.

#### Scenario: Close pane message triggers unsplit
- **Given** the webview receives `{ type: 'closeSplitPane' }`
- **When** the active pane is part of a split layout
- **Then** the webview removes the active pane from the split tree and destroys its terminal

### Requirement: RequestCloseSplitPane WebView-to-Extension Message

The IPC protocol SHALL define a `RequestCloseSplitPaneMessage` sent from the WebView to the Extension Host to request destruction of a pane's session:

```typescript
interface RequestCloseSplitPaneMessage {
  type: 'requestCloseSplitPane';
  sessionId: string;
}
```

The message MUST be added to the `WebViewToExtensionMessage` union type.

#### Scenario: WebView requests pane session destruction
- **Given** the user closes pane "def" in a split layout
- **When** the webview processes the close action
- **Then** it sends `{ type: 'requestCloseSplitPane', sessionId: 'def' }` to the extension host to destroy the PTY
