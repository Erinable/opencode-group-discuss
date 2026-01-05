# Project Summary

## Overview
**OpenCode Group Discuss** is a plugin that enables multi-agent collaboration within the OpenCode ecosystem. It orchestrates a "group chat" where different AI personae (e.g., Advocate, Critic, Moderator) discuss a topic to reach a conclusion or consensus.

## Architecture Status (v0.3.0)

The project has transitioned from a monolithic prototype to a robust, component-based architecture.

### Key Components
*   **DiscussionEngine**: The state machine driving the discussion loop.
*   **ResourceController**: Manages concurrency (p-queue) and graceful shutdown lifecycles.
*   **Modes**: 
    *   `DebateMode` (Active)
    *   `CollaborativeMode` (Active)
*   **Integrations**:
    *   `DiscussionFacade`: Normalizes inputs and config.
    *   `AgentRegistry`: Dynamic loading of agent capabilities.

### Recent Major Changes (v0.3.0)
*   **Refactor**: Split `Discussion.ts` into `DiscussionEngine` + `ResourceController`.
*   **Node 20+**: Adoption of `AbortSignal.any` for leak-free signal combination.
*   **Robustness**: Standardized error codes (`ETIMEDOUT`, etc.) and reliable retry logic.
*   **DX**: Added `MIGRATION.md` and integration tests.

## Future Roadmap
*   **Phase 4**: Advanced Modes (Brainstorming).
*   **Phase 5**: Persistence & Replay (Save discussion state to file).
*   **Optimization**: Context window compression for long discussions.
