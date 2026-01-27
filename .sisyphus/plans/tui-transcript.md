# Plan: TUI Group Chat Transcript Display

## Context

### Original Request
The user wants to see the group discussion content within the `opencode` TUI. Currently, it is hidden in logs. The user noted that `opencode tui` supports "sub-session jumping".

### Interview Summary
**Key Discussions**:
- **Constraint**: `opencode-group-discuss` is a plugin; we cannot modify the host TUI code.
- **Solution**: Create a dedicated "Transcript Session" (sub-session) that mirrors the chat.
- **Token Cost**: Mirroring incurs extra input tokens. We will add a config to control this.

**Research Findings**:
- `DiscussionEngine` manages sub-sessions using `client.session.create` with `parentID`.
- `client` is the OpenCode Plugin SDK client.
- `src/config/schema.ts` uses TypeScript interfaces and `DEFAULT_CONFIG`.
- `src/config/ConfigLoader.ts` handles merging and resolution.
- OpenCode SDK supports `session.prompt({ body: { noReply: true } })` to inject a `UserMessage` without inference (TUI-visible, no extra agent reply).

### Metis/Momus Review
**Identified Gaps** (addressed):
- **Config Plumbing**: Restrict `tui` config to **file-based only** (`group-discuss.json`).
- **Session Hierarchy**: Must explicitly use `parentID: this.sessionID`.
- **Lifecycle**: Store transcript session in `this.state.subSessionIds['_transcript']` to inherit automatic cleanup and `keep_sessions` behavior.
- **Discoverability**: Log the session ID with a specific message format for verification.
- **Mirroring Behavior**: Use `session.prompt` with `noReply: true` (no inference, no ACK noise); await each call with a short timeout to preserve order.
- **Ordering**: Emit transcript entries after `Promise.all` to keep ordering stable (speaker order, then errors).
- **Init Safety**: Create transcript session inside `run()` (so `cleanup()` always runs) to avoid leaks if `init()` throws.

---

## Work Objectives

### Core Objective
Enable users to follow the group discussion in real-time within the OpenCode TUI by mirroring messages to a dedicated "Transcript Session".

### Concrete Deliverables
- **Config**: Add `tui.enable_transcript` (default: true) to schema (file-only).
- **Engine**: Create "📢 Group Discussion Transcript" session.
- **Mirroring**: Broadcast messages to this session.
- **Lifecycle**: Ensure transcript session is cleaned up via existing mechanisms.

### Definition of Done
- [ ] Config `tui.enable_transcript` is available in `group-discuss.json` (default `true`).
- [ ] A sub-session "📢 Group Discussion Transcript" is created as a child of the main session.
- [ ] The Transcript Session ID is discoverable (via `session_manage` when `keep_sessions=true`, plus an explicit log line).
- [ ] Messages from agents appear in that sub-session.
- [ ] The transcript session is deleted on cleanup (unless `keep_sessions=true`).

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Node.js test runner)
- **User wants tests**: YES (Tests-after)
- **QA Approach**: Automated integration test + Manual TUI verification.

### Manual Execution Verification

**1. Verify Transcript Creation (Default)**
- [ ] In `opencode tui`, run:
  ```js
  group_discuss({ "topic": "TUI Test", "rounds": 1, "keep_sessions": true })
  ```
- [ ] In the same root session, run:
  ```js
  session_manage({ "action": "list" })
  ```
- [ ] Verify there is a child session titled `📢 Group Discussion Transcript`.
- [ ] Verify the tool output (or logs) includes the transcript session ID.

**2. Verify Content Mirroring**
- [ ] In TUI, jump into the `📢 Group Discussion Transcript` child session.
- [ ] Verify new messages appear during the discussion.
- [ ] Verify message format includes the speaker: `@Agent` and round number.

**3. Verify Config Switch**
- [ ] Edit `.opencode/group-discuss.json` (create if needed): `{"tui": {"enable_transcript": false}}`.
- [ ] Run discussion.
- [ ] Verify no `📢 Group Discussion Transcript` child session is created.
- [ ] Revert config change.

**4. Regression Check: keep_sessions=false (default)**
- [ ] Run `group_discuss({ "topic": "cleanup test", "rounds": 1 })`.
- [ ] After completion, run `session_manage({"action":"list"})`.
- [ ] Verify no child sessions remain.

---

## Task Flow

```
1. Config Schema Update → 2. Config Loader Update → 3. projectRoot Plumbing → 4. Engine Implementation
```

---

## TODOs

- [x] 1. Update Config Schema in `src/config/schema.ts`

  **What to do**:
  - Add interface `TuiConfigOverride`:
    ```typescript
    export interface TuiConfigOverride {
      /** Enable real-time transcript session in TUI */
      enable_transcript?: boolean;
    }
    ```
  - Add `tui?: TuiConfigOverride` to `GroupDiscussConfig` interface.
  - Add `tui: Required<TuiConfigOverride>` to `DEFAULT_CONFIG` with `{ enable_transcript: true }`.

  **References**:
  - `src/config/schema.ts`: Define interfaces and default.

  **Acceptance Criteria**:
  - [ ] `GroupDiscussConfig` includes `tui`.
  - [ ] `DEFAULT_CONFIG` includes `tui`.

- [x] 2. Update Config Loader in `src/config/ConfigLoader.ts`

  **What to do**:
  - Add `tui: Required<TuiConfigOverride>` to `ResolvedConfig` interface.
  - Update `mergeConfigs`:
    ```typescript
    if (config.tui) {
      result.tui = { ...result.tui, ...config.tui };
    }
    ```
  - Update `resolveConfig`:
    ```typescript
    tui: {
      enable_transcript: config.tui?.enable_transcript ?? DEFAULT_CONFIG.tui.enable_transcript
    }
    ```

  **References**:
  - `src/config/ConfigLoader.ts`: Merge and resolve logic.

  **Acceptance Criteria**:
  - [ ] `loadConfig` returns `tui.enable_transcript`.

- [x] 3. Make `projectRoot` plumbing explicit (avoid config-root mismatch)

  **What to do**:
  - Update `src/tools/group-discuss.ts` to pass the `projectRoot` (already available in `createGroupDiscussTool(client, projectRoot?)`) into the discussion constructor.
  - Update `src/core/Discussion.ts` to accept `projectRoot?: string` and pass it to `new DiscussionEngine(client, sessionID, logger, projectRoot)`.
  - Update `src/core/engine/DiscussionEngine.ts` constructor signature to accept `projectRoot?: string`, store it, and call `getConfigLoader(this.projectRoot)` inside `init()`.

  **References**:
  - `src/tools/group-discuss.ts`: tool entrypoint where `Discussion` is created.
  - `src/core/Discussion.ts`: the facade that instantiates `DiscussionEngine`.
  - `src/core/engine/DiscussionEngine.ts`: currently uses `getConfigLoader()` without `projectRoot`.

  **Acceptance Criteria**:
  - [ ] When `createGroupDiscussTool` is invoked with a `projectRoot`, the engine loads config relative to that root.
  - [ ] No behavior changes when `projectRoot` is omitted (fallback remains `process.cwd()`).

- [x] 4. Implement Transcript Session Creation (in `run()`, not `init()`)

  **What to do**:
  - Add a helper method: `private async ensureTranscriptSession(signal?: AbortSignal): Promise<string | undefined>`
  - Call it once at the beginning of `run()` (inside the try/finally where `cleanup()` is guaranteed).
  - In `ensureTranscriptSession`:
    - Load resolved config via `getConfigLoader(this.projectRoot).loadConfig()` (cache makes it cheap).
    - Decide config scope explicitly: `tui.enable_transcript` is supported in both global and project config (same merge precedence as other config).
    - If `config.tui?.enable_transcript === false`, return `undefined`.
    - Create session:
      `client.session.create({ body: { parentID: this.sessionID, title: "📢 Group Discussion Transcript" } })`.
    - Use `withRetry` (3 retries) following `getAgentSessionID`.
    - Store ID in `this.state.subSessionIds['_transcript']`.
    - Log a stable line for verification:
      - Message: `TUI Transcript Session Created`
      - Meta key: `{ transcriptSessionID: id }`
    - Return ID.

  **References**:
  - `src/core/engine/DiscussionEngine.ts`: `init` method.
  - `src/core/engine/DiscussionEngine.ts`: `cleanup` (no changes needed if we use `subSessionIds`).

  **Acceptance Criteria**:
  - [ ] Session created with `parentID`.
  - [ ] ID stored in `subSessionIds['_transcript']`.
  - [ ] Specific log message emitted.

- [x] 5. Implement Message Mirroring in `DiscussionEngine.ts`

  **What to do**:
  - Add two helpers (avoid forcing non-agent markers into `DiscussionMessage`):
    1) `private async broadcastTranscriptText(text: string, signal?: AbortSignal): Promise<void>`
    2) `private async broadcastTranscriptMessage(msg: DiscussionMessage, signal?: AbortSignal): Promise<void>`
  - `broadcastTranscriptText` logic:
    - Resolve transcript session via `this.state.subSessionIds['_transcript']`.
    - If missing, return.
    - Call `client.session.prompt({ path: { id }, body: { noReply: true, parts: [{ type: 'text', text }] }, signal })`.
    - Implement timeout explicitly using AbortController + setTimeout, mirroring the pattern used in `invokeDirect`.
    - Catch + warn; never throw.

  - `broadcastTranscriptMessage` logic:
    - Derive speaker type best-effort from `this.state.participants` (`subagentType` or `subagent_type`).
    - Build one text entry: `Round ${msg.round} | @${msg.agent} (${type})\n${msg.content}`.
    - Delegate to `broadcastTranscriptText`.

  **Mirroring Scope (be explicit + deterministic)**:
  - Create transcript session (if enabled) once in `run()`.
  - For each round:
    1) Emit marker: `--- Round X/Y ---` via `broadcastTranscriptText`.
    2) Execute agents in parallel (existing).
    3) After `Promise.all` resolves:
       - Emit successful agent messages in **speaker order** (existing outcome iteration) using `broadcastTranscriptMessage(res)` right after pushing to `this.state.messages`.
       - Emit errors for this round in a stable order:
         - Snapshot `const errStart = errors.length` before dispatch.
         - After `Promise.all`, take `errors.slice(errStart)` and sort by agent name.
         - Emit each error line via `broadcastTranscriptText`:
           `ERROR | Round X | @Agent | code=... | message=...`
  - At end of run:
    - Emit marker: `=== Conclusion ===` + conclusion + consensus percent.

  **References**:
  - `src/core/engine/DiscussionEngine.ts`: `runRound` loop.

  **Acceptance Criteria**:
  - [ ] Messages sent to `_transcript` session.
  - [ ] 5s timeout applied.
  - [ ] Errors caught.

---

## Success Criteria

### Verification Commands
```bash
# In TUI (preferred):
# 1) group_discuss({"topic":"TUI Test","rounds":1,"keep_sessions":true})
# 2) session_manage({"action":"list"})

# Build + test (tests import dist/*):
npm run build && npm test

# If file logging enabled (default):
grep "TUI Transcript Session Created" group_discuss.log
```

### Final Checklist
- [ ] Transcript session created as child.
- [ ] Transcript session discoverable via `session_manage`.
- [ ] Messages mirrored.
- [ ] Auto-cleanup works (via `subSessionIds`).

---

## Tests (High Accuracy)

Even though this is a TUI-facing feature, we can validate it at the engine/client boundary.

- [x] Add integration test: "Transcript session created and receives mirrored messages"

  **What to do**:
  - Update `tests/integration/MockAgentClient.js` so `session.create` supports the SDK-style call shape used in engine:
    - Accept either `{ parentID, title }` or `{ body: { parentID, title } }`.
  - Extend mock to record `session.prompt` calls per session ID (store `body.noReply` + text).
  - In `tests/integration/DiscussionEngine.test.js`:
    - Use a temp directory as `projectRoot`.
    - Create `.opencode/group-discuss.json` in that temp dir with `{"tui": {"enable_transcript": true}}`.
    - Reset config singleton to avoid cross-test bleed:
      - `import { ConfigLoader } from '../../dist/config/ConfigLoader.js'` (or equivalent path in dist) and call `ConfigLoader.reset()` before creating the engine.
    - Construct engine with the new `projectRoot` ctor param.
    - Run engine for 1 round with 1 participant.
    - Assert:
      - A child session with title `📢 Group Discussion Transcript` exists under root-session.
      - At least 1 `session.prompt` call targeted that transcript session with `noReply: true`.

  **Acceptance Criteria**:
  - [ ] `npm run build && npm test` passes.

External reference:
- `https://opencode.ai/docs/sdk/#sessions` (documents `session.prompt` + `body.noReply: true`).
