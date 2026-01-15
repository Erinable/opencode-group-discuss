# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-01-15

### Added
- **Test Coverage**: Increased from 8 to 42 tests (+425%)
  - `DebateMode.test.js` - speaker ordering, consensus detection
  - `CollaborativeMode.test.js` - collaborative mode logic
  - `DiscussionFacade.test.js` - input validation, normalization
  - `withRetry.test.js` - retry mechanism, bail conditions
- **npm test script**: Added `test` script to `package.json`

### Changed
- **CI Workflow**: Updated to use `npm test` instead of hardcoded file list
- **MockAgentClient**: Improved to support dynamic prompt override for testing

### Fixed
- Fixed repository URL placeholder in `package.json` and `src/index.ts`

## [0.3.0] - 2026-01-05

### 🚨 Breaking Changes
- **Node.js Requirement**: Minimum supported version is now **v20.0.0**.
- **Shutdown Semantics**: `stop()` is now fully asynchronous and performs a graceful shutdown (drain pending tasks) instead of immediate termination.
- **Error Codes**: Errors now have standardized `code` properties (e.g., `ETIMEDOUT`, `E_SHUTTING_DOWN`) instead of relying on message string matching.

### Added
- **Graceful Shutdown**: `ResourceController` now supports two-phase shutdown (reject new -> wait for idle -> clear).
- **Native AbortSignal**: Uses `AbortSignal.any` for reliable signal combination and cleanup (fixing memory leak risks).
- **Error Observability**: `DiscussionError` in state now includes `code`, `retryCount`, and `cause` chain.
- **Input Normalization**: Support for snake_case `subagent_type` (preferred) alongside legacy camelCase.

### Fixed
- Fixed a potential memory leak in signal combination logic by removing the manual fallback implementation.
- Fixed `run()` status logic to correctly prioritize cancellation over completion.
- Fixed `withRetry` logic to avoid retrying on fatal shutdown signals while preserving retries for network timeouts.
- Fixed `DiscussionFacade` input validation to support flexible field naming.

## [0.1.0] - 2026-01-04

### Added

- 🎉 Initial MVP release
- ✅ Core discussion engine (`Discussion` class)
- ✅ Debate mode implementation (`DebateMode` class)
- ✅ `group_discuss` custom tool for OpenCode
- ✅ TypeScript type definitions
- ✅ Plugin entry point compatible with OpenCode Plugin API
- ✅ Comprehensive documentation (README, QUICKSTART, DEVELOPMENT)
- ✅ Example configuration templates
- ✅ Basic functionality tests
- ✅ MIT License

### Features

- Multi-agent group discussions with configurable rounds (1-10)
- Real-time streaming output of discussion progress
- Consensus analysis and conclusion generation
- Support for custom agents (advocate, critic, moderator)
- Verbose and compact output modes
- Complete discussion history recording

### Technical Details

- Built with TypeScript 5.3.0
- Uses Bun for package management and runtime
- Zero dependencies (except @opencode-ai/plugin as peer dependency)
- ~700 lines of code
- Full type safety

### Known Limitations

- Currently uses simulated agent responses for testing
- Only Debate mode implemented (Brainstorm and Consensus modes planned)
- Requires integration with real OpenCode client for production use
- Limited unit test coverage

### Documentation

- README.md - Full project documentation
- QUICKSTART.md - 5-minute getting started guide
- DEVELOPMENT.md - Developer documentation
- PROJECT_SUMMARY.md - Project overview
- Example configuration in templates/

## [Unreleased]

### Planned for 0.2.0

- [ ] Real OpenCode client integration
- [ ] BrainstormMode implementation
- [ ] ConsensusMode implementation
- [ ] discussion_status tool
- [ ] Context compression mechanism
- [ ] Unit tests suite
- [ ] Integration tests
- [ ] Performance optimizations

### Future Considerations

- [ ] Discussion history persistence
- [ ] Replay functionality
- [ ] Export to Markdown/PDF
- [ ] Custom mode plugins
- [ ] Web UI for discussion visualization
- [ ] Multi-language support

---

[0.1.0]: https://github.com/yourusername/opencode-group-discuss/releases/tag/v0.1.0
