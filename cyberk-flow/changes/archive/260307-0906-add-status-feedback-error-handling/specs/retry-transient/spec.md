# Spec: retry-transient

## ADDED Requirements

### Requirement: Retry Wrapper for Transient postMessage Failures

A `safeSendWithRetry` utility SHALL be implemented that retries `postMessage` calls up to a configurable number of times (default 2 retries) with a short delay (50ms) between attempts, for transient failures where the webview is being relocated.

#### Scenario: First attempt succeeds

- Given a webview that is alive and responsive
- When `safeSendWithRetry` is called
- Then the message SHALL be delivered on the first attempt
- And no retry delay SHALL occur

#### Scenario: Transient failure with successful retry

- Given a webview that is temporarily unresponsive (being relocated)
- When the first `postMessage` attempt fails (throws an exception OR resolves to `false`)
- Then the function SHALL wait 50ms and retry
- And if the second attempt succeeds (resolves to `true`), the message SHALL be delivered

#### Scenario: All retries exhausted

- Given a webview that is fully disposed
- When all retry attempts fail (throw or resolve `false`)
- Then the function SHALL return false
- And no error SHALL be thrown (fire-and-forget semantics)
