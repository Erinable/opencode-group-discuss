# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
