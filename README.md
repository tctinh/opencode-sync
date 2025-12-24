# opencodesync

[![npm version](https://img.shields.io/npm/v/opencodesync.svg)](https://www.npmjs.com/package/opencodesync)
[![npm downloads](https://img.shields.io/npm/dm/opencodesync.svg)](https://www.npmjs.com/package/opencodesync)
[![CI](https://github.com/tctinh/opencode-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/tctinh/opencode-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Sync your OpenCode settings and session contexts across devices using GitHub Gist.

## Features

- **Config Sync**: Sync your OpenCode configuration files (opencode.json, custom agents, commands, AGENTS.md)
- **Context Export**: AI-powered session summarization with privacy safeguards
- **Context Import**: Resume work on any device with full context
- **Secure**: End-to-end encryption with AES-256-GCM
- **Private**: Uses private GitHub Gists for storage

## Installation

```bash
npm install -g opencodesync
```

## Quick Start

### 1. Initialize on your primary device

```bash
opencodesync init
```

This will:
- Guide you through creating a GitHub Personal Access Token
- Set up your encryption passphrase
- Create your sync storage

### 2. Push your settings

```bash
opencodesync push
```

### 3. Set up on another device

```bash
opencodesync init   # Use the SAME token and passphrase
opencodesync pull
```

## CLI Commands

### `opencodesync init`

Set up sync credentials (GitHub token and encryption passphrase).

```bash
opencodesync init [--force]
```

Options:
- `--force`, `-f`: Overwrite existing credentials

### `opencodesync push`

Push local config files to GitHub Gist.

```bash
opencodesync push [--force] [--verbose]
```

Options:
- `--force`, `-f`: Push even if no changes detected
- `--verbose`, `-v`: Show detailed output

### `opencodesync pull`

Pull config files from GitHub Gist.

```bash
opencodesync pull [--force] [--verbose]
```

Options:
- `--force`, `-f`: Overwrite local files without confirmation
- `--verbose`, `-v`: Show detailed output

### `opencodesync status`

Show sync status and pending changes.

```bash
opencodesync status [--verbose]
```

Options:
- `--verbose`, `-v`: Show detailed file list

## Plugin Commands (in OpenCode)

### `/context-export`

Export current session as a privacy-safe context for cross-device sync.

```
/context-export [name] [--guidance "focus on..."]
```

Arguments:
- `name`: Custom name for this context (optional, auto-generated if not provided)
- `--guidance`: What to focus on in the summary

Example:
```
/context-export "Auth Implementation" --guidance "focus on OAuth flow, skip database details"
```

### `/context-import`

Import saved contexts to resume work.

```
/context-import [name...]
```

Arguments:
- `name...`: Context names or IDs to import (supports partial matching)

Example:
```
/context-import "Auth Implementation"
/context-import auth database  # Import multiple contexts
```

### `/context-list`

List all saved contexts.

```
/context-list [--search query]
```

### `/context-prune`

Delete saved contexts.

```
/context-prune <name>
/context-prune --all
```

Arguments:
- `name`: Name or ID of context to delete
- `--all`: Delete all contexts (requires confirmation)

## What Gets Synced

| Item | Synced | Notes |
|------|--------|-------|
| `opencode.json` / `opencode.jsonc` | ✅ Yes | Main config file |
| Custom agents (`agent/*.md`) | ✅ Yes | Your custom agent definitions |
| Custom commands (`command/*.md`) | ✅ Yes | Your custom slash commands |
| `AGENTS.md` | ✅ Yes | Global instructions |
| Plugin configs (`*.jsonc`, `oh-my-opencode.json`) | ✅ Yes | Plugin ecosystem configurations |
| Skills directory (`skills/**`) | ✅ Yes | Skill files (symlinks resolved) |
| Session contexts | ✅ Yes | AI-generated summaries only |
| Auth tokens | ❌ **Never** | Security - never synced |
| Plugin source files | ❌ No | Install from config |
| Project configs (`.opencode/`) | ❌ No | Project-specific |
| Session raw data | ❌ No | Too large, contains sensitive data |
| Blocked files (`*.log`, `*.bak`, etc.) | ❌ No | Excluded by blocklist |

## Security

### Encryption

- All data is encrypted with **AES-256-GCM** before upload
- Encryption key derived from your passphrase using **PBKDF2** (100,000 iterations)
- Each sync uses a unique random salt and IV
- Your passphrase never leaves your device

### Privacy

The context export system includes built-in privacy safeguards:

**Never included in exports:**
- Code snippets or implementations
- API keys, tokens, passwords
- Database connection strings
- Internal URLs or infrastructure details
- File contents or raw data

**What gets captured:**
- General goals and objectives
- High-level technical approaches
- Architectural decisions
- Progress and next steps (abstract)

### Storage

- Uses **private** GitHub Gists only
- GitHub token stored locally with encryption
- Gist URL not shared publicly

## Configuration Files

### Storage Locations

| Path | Purpose |
|------|---------|
| `~/.config/opencode/` | OpenCode config files |
| `~/.local/share/opencode/sync/` | Sync storage |
| `~/.local/share/opencode/sync/auth.json` | Encrypted credentials |
| `~/.local/share/opencode/sync/state.json` | Sync state |
| `~/.local/share/opencode/sync/contexts.json` | Saved contexts |

## Troubleshooting

### "Not configured" error

Run `opencodesync init` to set up your credentials.

### "Decryption failed" error

Make sure you're using the **same passphrase** as on your other devices. If you've forgotten it, you'll need to start fresh:

```bash
opencodesync init --force
opencodesync push --force
```

Then re-initialize your other devices with the new passphrase.

### "Invalid token" error

Your GitHub token may have expired or been revoked. Create a new one:

1. Go to https://github.com/settings/tokens/new
2. Create a token with the `gist` scope
3. Run `opencodesync init --force`

### "Rate limit" error

GitHub API has rate limits. Wait a few minutes and try again.

## Workflow Example

### Machine A (Office)

```bash
# Morning: Start work
opencodesync pull              # Get latest from home

# Work on feature...

# End of day: Save context
# In OpenCode:
/context-export "Feature X Progress" --guidance "focus on API design decisions"

# Push to sync
opencodesync push
```

### Machine B (Home)

```bash
# Evening: Continue work
opencodesync pull              # Get settings + context from office

# In OpenCode:
/context-import "Feature X"    # Resume with full context

# Continue working...
```

## API Usage (for plugin developers)

```typescript
import {
  createPluginTools,
  createEventHooks,
  addContext,
  getAllContexts,
  paths,
} from "opencodesync";

// Create all tools
const tools = createPluginTools();

// Set up event hooks
const hooks = createEventHooks();
hooks.setToastHandler((options) => {
  // Show toast notification in your UI
});

// Listen for session compaction
hooks.onSessionCompacted((event) => {
  // Remind user to export context
});

// Direct context management
const context = addContext("My Context", "Summary text...");
const allContexts = getAllContexts();
```

## License

MIT
