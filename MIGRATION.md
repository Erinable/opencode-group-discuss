# Migration Guide

This guide details the changes required to upgrade to `opencode-group-discuss` v0.3.0.

## 🚨 Breaking Changes in v0.3.0

### 1. Node.js Version Requirement
The project now requires **Node.js v20.0.0 or higher**. This change allows us to leverage native APIs like `AbortSignal.any` for better performance and stability without polyfills.

**Before:**
```json
"engines": { "node": ">=18.0.0" }
```

**After:**
```json
"engines": { "node": ">=20.0.0" }
```

### 2. Async `stop()` Behavior
The `stop()` method is now fully asynchronous and performs a graceful shutdown sequence. It no longer immediately forces a cleanup but instead signals the engine to stop accepting new tasks and waits for ongoing tasks to drain (or timeout).

**Before:**
```typescript
// Previously, stop might have been sync or fire-and-forget
engine.stop("reason"); 
// cleanup happened immediately or undefined
```

**After:**
```typescript
// Now you must await stop() to ensure resources are released
await engine.stop("User requested stop");
```

### 3. Error Code Standardization
We have standardized error codes to make programmatic error handling easier. The `DiscussionError` objects in `state.errors` and thrown errors now contain a `code` property.

| Code | Meaning | Recommended Action |
|------|---------|-------------------|
| `ETIMEDOUT` | Operation timed out (network or logical) | Retry if it's a network issue; check config if logical. |
| `E_SHUTTING_DOWN` | Engine is shutting down; new tasks rejected | Do not retry. Gracefully exit. |
| `ABORT_ERR` | Operation was explicitly cancelled | Do not retry. |
| `SHUTDOWN_TIMEOUT` | Shutdown process timed out waiting for tasks | Force cleanup is triggered automatically. Log warning. |

### 4. Input Configuration Normalization
While we support backward compatibility, we encourage using snake_case for `subagent_type` to match the OpenCode standard.

**Legacy (still works but internally mapped):**
```typescript
{ participants: [{ name: "Alice", subagentType: "advocate" }] }
```

**Recommended:**
```typescript
{ participants: [{ name: "Alice", subagent_type: "advocate" }] }
```

## Migration Checklist

- [ ] Upgrade Node.js environment to v20+.
- [ ] Update `package.json` engines if you are wrapping this plugin.
- [ ] Ensure all calls to `engine.stop()` are awaited.
- [ ] Update error handling logic to check `error.code` instead of matching string messages.
- [ ] (Optional) Update configuration objects to use `subagent_type` instead of `subagentType`.
