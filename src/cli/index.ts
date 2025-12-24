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
  .name("opencodesync")
  .description("Sync your OpenCode settings across devices via GitHub Gist")
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
  .action(pushCommand);

program
  .command("pull")
  .description("Pull config files from GitHub Gist")
  .option("-f, --force", "Overwrite local files without confirmation")
  .option("-v, --verbose", "Show detailed output")
  .action(pullCommand);

program
  .command("status")
  .description("Show sync status and pending changes")
  .option("-v, --verbose", "Show detailed file list")
  .action(statusCommand);

// Parse and run
program.parse();
