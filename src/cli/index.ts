#!/usr/bin/env node
/**
 * OpenCode Sync CLI
 * Sync your OpenCode settings across devices via GitHub Gist
 */

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Get package.json for version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let version = "0.1.0";
try {
  const pkgPath = join(__dirname, "..", "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  version = pkg.version;
} catch {
  // Use default version
}

// Import commands
import { initCommand } from "./commands/init.js";
import { pushCommand } from "./commands/push.js";
import { pullCommand } from "./commands/pull.js";
import { statusCommand } from "./commands/status.js";

const program = new Command();

program
  .name("coding-agent-sync")
  .description("Sync AI coding assistant configs (Claude Code, OpenCode) across devices via GitHub Gist")
  .version(version);

// Register commands
program
  .command("init")
  .description("Set up sync credentials (GitHub token and encryption passphrase)")
  .option("-f, --force", "Overwrite existing credentials")
  .action(initCommand);

program
  .command("push")
  .description("Push local config files to GitHub Gist")
  .option("-f, --force", "Push even if no changes detected")
  .option("-v, --verbose", "Show detailed output")
  .option("--claude", "Only sync Claude Code")
  .option("--opencode", "Only sync OpenCode")
  .option("--codex", "Only sync Codex")
  .option("--gemini", "Only sync Gemini CLI")
  .option("--all", "Sync all installed assistants (default)")
  .action(pushCommand);

program
  .command("pull")
  .description("Pull config files from GitHub Gist")
  .option("-f, --force", "Overwrite local files without confirmation")
  .option("-v, --verbose", "Show detailed output")
  .option("--claude", "Only sync Claude Code")
  .option("--opencode", "Only sync OpenCode")
  .option("--codex", "Only sync Codex")
  .option("--gemini", "Only sync Gemini CLI")
  .option("--all", "Sync all installed assistants (default)")
  .action(pullCommand);

program
  .command("status")
  .description("Show sync status and pending changes")
  .option("-v, --verbose", "Show detailed file list")
  .option("--claude", "Only check Claude Code")
  .option("--opencode", "Only check OpenCode")
  .option("--codex", "Only check Codex")
  .option("--gemini", "Only check Gemini CLI")
  .option("--all", "Check all installed assistants (default)")
  .action(statusCommand);

// Parse and run
program.parse();
