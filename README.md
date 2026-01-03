<p align="center">
  <img src="https://img.shields.io/npm/v/coding-agent-sync.svg?style=flat-square&color=blue" alt="npm version" />
  <img src="https://img.shields.io/npm/dm/coding-agent-sync.svg?style=flat-square&color=green" alt="downloads" />
  <img src="https://img.shields.io/badge/license-MIT-yellow.svg?style=flat-square" alt="license" />
</p>

<h1 align="center">coding-agent-sync</h1>

<p align="center">
  <strong>Sync your AI coding assistant configs across all your devices.</strong>
</p>

<p align="center">
  Seamlessly sync settings, MCP servers, custom agents, skills, and session contexts for Claude Code, OpenCode, and more.
</p>

---

## Supported AI Assistants

| Assistant | Config Location | Status |
|-----------|-----------------|--------|
| **Claude Code** | `~/.claude/` | ✅ Supported |
| **OpenCode** | `~/.config/opencode/` | ✅ Supported |
| **OpenAI Codex** | `~/.codex/` | 🔜 Coming soon |

---

## Quick Start

```bash
npm install -g coding-agent-sync
coding-agent-sync init
```

That's it. The wizard walks you through setup and automatically syncs your settings.

**First device?** → Creates a new Gist and offers to push your current config
**Second device?** → Finds your existing Gist and offers to pull everything down

---

## What Gets Synced

### Claude Code (`~/.claude/`)

| What | Synced |
|------|--------|
| Settings (`settings.json`) | ✅ |
| MCP servers (`~/.claude.json`) | ✅ |
| Custom commands (`commands/*.md`) | ✅ |
| Custom agents (`agents/*.md`) | ✅ |
| Rules/Skills (`rules/*.md`) | ✅ |
| Global instructions (`CLAUDE.md`) | ✅ |

### OpenCode (`~/.config/opencode/`)

| What | Synced |
|------|--------|
| Main config (`opencode.json`) | ✅ |
| Custom agents (`agent/*.md`) | ✅ |
| Custom commands (`command/*.md`) | ✅ |
| Global instructions (`AGENTS.md`) | ✅ |
| Plugin configs (`*.jsonc`) | ✅ |
| Skills directory (`skill/**`) | ✅ |
| Session contexts | ✅ |

---

## Daily Workflow

**Morning at the office:**
```bash
coding-agent-sync pull                    # Get latest from home
# ... work on features ...
/context-export "Feature Progress"        # Save your context (OpenCode)
coding-agent-sync push                    # Sync to cloud
```

**Evening at home:**
```bash
coding-agent-sync pull                    # Get settings + context
/context-import "Feature Progress"        # Resume with full context
# ... continue seamlessly ...
```

---

## CLI Commands

| Command | What it does |
|---------|--------------|
| `coding-agent-sync init` | Set up GitHub token and encryption passphrase |
| `coding-agent-sync push` | Upload your settings to the cloud |
| `coding-agent-sync pull` | Download settings from the cloud |
| `coding-agent-sync status` | Check what's changed since last sync |

### Options

| Flag | Description |
|------|-------------|
| `--all` | Sync all installed assistants (default) |
| `--claude` | Only sync Claude Code |
| `--opencode` | Only sync OpenCode |
| `--verbose` | Show detailed output |

---

## OpenCode Plugin Commands

| Command | What it does |
|---------|--------------|
| `/context-export [name]` | Save current session as a portable context |
| `/context-import [name]` | Load a saved context into your session |
| `/context-list` | See all your saved contexts |
| `/context-prune <name>` | Delete old contexts |

---

## Security

- **AES-256-GCM encryption** - Your data is encrypted before it leaves your machine
- **Private GitHub Gists** - Only you can access your sync storage
- **Zero plaintext** - Even if someone gets your Gist, they can't read it without your passphrase

---

## Migration from opencodesync

If you were using `opencodesync`, your existing sync data will continue to work. The CLI also maintains backward compatibility:

```bash
# Both work the same
opencodesync push
coding-agent-sync push
```

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| "Not configured" | Run `coding-agent-sync init` |
| "Decryption failed" | Use the same passphrase as your other devices |
| "Invalid token" | Create a new GitHub token with `gist` scope |

Need to start fresh? `coding-agent-sync init --force && coding-agent-sync push --force`

---

## For Plugin Developers

```typescript
import { createPluginTools, addContext, getAllContexts } from "coding-agent-sync";

const tools = createPluginTools();
const context = addContext("My Context", "Summary...");
const all = getAllContexts();
```

---

## License

MIT

---

<p align="center">
  <strong>One config. Every device. All your AI assistants.</strong>
</p>
