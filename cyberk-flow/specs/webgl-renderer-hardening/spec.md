# webgl-renderer-hardening Specification

## Purpose
TBD
## Requirements

### Requirement: WebGL Static Failure Tracking

The webview SHALL maintain a module-level static boolean `webglFailed` (initially `false`) that tracks whether WebGL initialization has failed in any terminal instance during the current webview session.

When WebGL addon construction or `loadAddon()` throws an exception, the webview SHALL set `webglFailed = true` and log a warning: `"[AnyWhere Terminal] WebGL renderer failed, using canvas fallback for all future terminals"`.

When `webglFailed` is `true`, subsequent calls to `createTerminal()` SHALL skip WebGL addon initialization entirely (no construction, no `loadAddon()` call).

#### Scenario: First WebGL failure sets static flag
- **Given** `webglFailed` is `false`
- **When** `new WebglAddon()` throws during `createTerminal()`
- **Then** `webglFailed` is set to `true` and the terminal uses canvas renderer

#### Scenario: Subsequent terminals skip WebGL after failure
- **Given** `webglFailed` is `true` (from a previous terminal's failure)
- **When** a new terminal is created via `createTerminal()`
- **Then** WebGL addon is NOT constructed or loaded; terminal uses canvas renderer

### Requirement: WebGL Context Loss Recovery

When the WebGL addon fires `onContextLoss`, the webview SHALL:
1. Dispose the WebGL addon
2. Set `webglFailed = true` to prevent future WebGL attempts
3. Log: `"[AnyWhere Terminal] WebGL context lost, falling back to canvas renderer"`

The terminal SHALL continue functioning with the canvas renderer after context loss — no user action required.

#### Scenario: Context loss triggers fallback
- **Given** a terminal is using WebGL renderer
- **When** the WebGL context is lost (GPU driver reset, resource exhaustion)
- **Then** the WebGL addon is disposed, `webglFailed` is set to `true`, and the terminal continues with canvas renderer

