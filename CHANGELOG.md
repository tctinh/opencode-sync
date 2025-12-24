# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.6] - 2024-12-25

### Improved

- **Better init UX** - After setup, automatically offers to pull (if using existing Gist) or push (if fresh setup) instead of requiring manual command entry

## [0.1.0] - 2024-12-24

### Added

- Initial release of opencodesync
- **CLI Commands**
  - `opencodesync init` - Interactive setup wizard for GitHub token and encryption passphrase
  - `opencodesync push` - Push local config files to GitHub Gist with encryption
  - `opencodesync pull` - Pull and decrypt config files from GitHub Gist
  - `opencodesync status` - Show sync status and pending changes
- **Plugin Tools**
  - `/context-export` - AI-powered session summarization with privacy safeguards
  - `/context-import` - Resume work from synced contexts
  - `/context-list` - List all saved contexts
  - `/context-prune` - Delete contexts by name or all
- **Core Features**
  - AES-256-GCM encryption for all synced data
  - PBKDF2 key derivation (100,000 iterations)
  - Private GitHub Gist storage
  - XDG Base Directory compliance
  - Privacy-aware summarization prompts
  - 20 context limit with 20KB per context
- **Security**
  - Passphrase-based encryption
  - Secret detection in summaries
  - Never syncs auth tokens or raw session data
