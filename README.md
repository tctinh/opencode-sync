<p align="center">
  <img src="https://img.shields.io/npm/v/opencodesync.svg?style=flat-square&color=blue" alt="npm version" />
  <img src="https://img.shields.io/npm/dm/opencodesync.svg?style=flat-square&color=green" alt="downloads" />
  <img src="https://img.shields.io/badge/license-MIT-yellow.svg?style=flat-square" alt="license" />
</p>

<h1 align="center">opencodesync</h1>

<p align="center">
  <strong>Start coding on your laptop. Continue on your desktop. Never lose context.</strong>
</p>

<p align="center">
  Seamlessly sync your OpenCode settings, custom agents, and AI session contexts across all your devices.
</p>

---

## The Problem

You're deep in a coding session on your work machine. You've built up context with your AI assistant - it understands your architecture, your decisions, your next steps. Then you need to switch to your home computer.

**Without opencodesync:** Start from scratch. Re-explain everything. Lose momentum.

**With opencodesync:** One command. Full context restored. Keep building.

---

## Quick Start

```bash
npm install -g opencodesync
opencodesync init
```

That's it. The wizard walks you through setup and automatically syncs your settings.

**First device?** → Creates a new Gist and offers to push your current config  
**Second device?** → Finds your existing Gist and offers to pull everything down

---

## What You Get

### Sync Your Entire Setup

| What | Synced |
|------|--------|
| Main config (`opencode.json`) | ✅ |
| Custom agents (`agent/*.md`) | ✅ |
| Custom commands (`command/*.md`) | ✅ |
| Global instructions (`AGENTS.md`) | ✅ |
| Plugin configs (`*.jsonc`, `oh-my-opencode.json`) | ✅ |
| Skills directory (`skills/**`) | ✅ |
| Session contexts | ✅ |

### Never Lose Your AI Context

Export your session before switching devices:
```
/context-export "Auth Implementation" --guidance "focus on OAuth decisions"
```

Resume on any machine:
```
/context-import "Auth Implementation"
```

Your AI picks up exactly where you left off.

### Bank-Grade Security

- **AES-256-GCM encryption** - Your data is encrypted before it leaves your machine
- **Private GitHub Gists** - Only you can access your sync storage
- **Zero plaintext** - Even if someone gets your Gist, they can't read it without your passphrase

---

## Daily Workflow

**Morning at the office:**
```bash
opencodesync pull                    # Get latest from home
# ... work on features ...
/context-export "Feature Progress"   # Save your context
opencodesync push                    # Sync to cloud
```

**Evening at home:**
```bash
opencodesync pull                    # Get settings + context
/context-import "Feature Progress"   # Resume with full context
# ... continue seamlessly ...
```

---

## CLI Commands

| Command | What it does |
|---------|--------------|
| `opencodesync init` | Set up GitHub token and encryption passphrase |
| `opencodesync push` | Upload your settings to the cloud |
| `opencodesync pull` | Download settings from the cloud |
| `opencodesync status` | Check what's changed since last sync |

Use `--verbose` on any command for detailed output.

---

## Plugin Commands (inside OpenCode)

| Command | What it does |
|---------|--------------|
| `/context-export [name]` | Save current session as a portable context |
| `/context-import [name]` | Load a saved context into your session |
| `/context-list` | See all your saved contexts |
| `/context-prune <name>` | Delete old contexts |

---

## Privacy First

Context exports are **AI-generated summaries**, not raw data. They capture:

- Goals and objectives
- Technical approaches and decisions
- Progress and next steps

They **never** include:
- Code snippets or implementations
- API keys, tokens, or secrets
- Database strings or internal URLs
- Raw file contents

Your intellectual property stays safe.

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| "Not configured" | Run `opencodesync init` |
| "Decryption failed" | Use the same passphrase as your other devices |
| "Invalid token" | Create a new GitHub token with `gist` scope |

Need to start fresh? `opencodesync init --force && opencodesync push --force`

---

## For Plugin Developers

```typescript
import { createPluginTools, addContext, getAllContexts } from "opencodesync";

const tools = createPluginTools();
const context = addContext("My Context", "Summary...");
const all = getAllContexts();
```

---

## License

MIT

---

<p align="center">
  <strong>Stop context-switching. Start syncing.</strong>
</p>
