# Changelog

## [0.2.0] - 2025-01-03

### Added
- Multi-assistant support (Claude Code + OpenCode)
- VS Code extension with sidebar tree view
- Global MCP server management via `~/.mcp.json`
- Project-level config detection (`.claude/`, `.opencode/`, `.mcp.json`)
- Skills nested by folder structure
- OpenCode plugin config sync (antigravity, dcp, oh-my-opencode, smart-title)
- Welcome view with GitHub connection setup

### Changed
- Renamed from `opencodesync` to `coding-agent-sync`
- MCP servers now read from global `~/.mcp.json` instead of per-assistant configs

## [0.1.0] - 2024-12-01

### Added
- Initial release
- OpenCode config sync via GitHub Gist
- AES-256-GCM encryption
- CLI commands: init, push, pull, status
- Context export/import plugin for OpenCode
