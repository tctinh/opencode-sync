/**
 * XDG Base Directory paths for OpenCode
 * Following the XDG Base Directory Specification
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

/**
 * Get environment variable or default
 */
function envOr(key: string, defaultPath: string): string {
  return process.env[key] || join(homedir(), defaultPath);
}

/**
 * XDG paths for OpenCode
 */
export const paths = {
  /**
   * Config directory: ~/.config/opencode
   * Contains: opencode.json, opencode.jsonc, agent/, command/, AGENTS.md
   */
  get config(): string {
    return join(envOr("XDG_CONFIG_HOME", ".config"), "opencode");
  },

  /**
   * Data directory: ~/.local/share/opencode
   * Contains: storage/, bin/
   */
  get data(): string {
    return join(envOr("XDG_DATA_HOME", ".local/share"), "opencode");
  },

  /**
   * Cache directory: ~/.cache/opencode
   */
  get cache(): string {
    return join(envOr("XDG_CACHE_HOME", ".cache"), "opencode");
  },

  /**
   * State directory: ~/.local/state/opencode
   */
  get state(): string {
    return join(envOr("XDG_STATE_HOME", ".local/state"), "opencode");
  },

  /**
   * Sync storage directory: ~/.local/share/opencode/sync
   * Contains: state.json, contexts.json, auth credentials
   */
  get sync(): string {
    return join(this.data, "sync");
  },

  /**
   * Sync state file: ~/.local/share/opencode/sync/state.json
   */
  get syncState(): string {
    return join(this.sync, "state.json");
  },

  /**
   * Contexts storage: ~/.local/share/opencode/sync/contexts.json
   */
  get contexts(): string {
    return join(this.sync, "contexts.json");
  },

  /**
   * Auth credentials file: ~/.local/share/opencode/sync/auth.json
   * Fallback when system keychain is not available
   */
  get authFile(): string {
    return join(this.sync, "auth.json");
  },
} as const;

/**
 * Config file patterns to sync
 */
export const configPatterns = {
  /**
   * Main config files
   */
  mainConfig: ["opencode.json", "opencode.jsonc"],

  /**
   * Custom agent definitions
   */
  agents: "agent/**/*.md",

  /**
   * Custom command definitions
   */
  commands: "command/**/*.md",

  /**
   * Global instructions
   */
  instructions: "AGENTS.md",

  /**
   * Plugin configuration files
   * Pattern-based (*.jsonc) + known ecosystem configs
   */
  pluginConfigs: [
    "*.jsonc",                    // General pattern (DCP, smart-title, etc.)
    "oh-my-opencode.json",        // oh-my-opencode specific
  ],

  /**
   * Skills directory (all file types: .md, .sh, .py, .ts, etc.)
   * Symlinks are resolved during collection
   */
  skills: "skills/**/*",

  /**
   * All patterns combined
   */
  get all(): string[] {
    return [
      ...this.mainConfig,
      this.agents,
      this.commands,
      this.instructions,
      ...this.pluginConfigs,
      this.skills,
    ];
  },
} as const;

/**
 * Files/patterns to exclude from sync (sensitive/generated)
 * These patterns are matched against relative paths from config directory
 */
export const syncBlocklist = [
  "antigravity-*.json",       // OAuth tokens & reservations
  "package.json",             // npm generated
  "package-lock.json",
  "bun.lock",
  "node_modules/**",
  "logs/**",
  "repos/**",                 // External repos (skills source)
  ".git/**",
] as const;

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Ensure sync directory exists
 */
export function ensureSyncDir(): void {
  ensureDir(paths.sync);
}

/**
 * Get absolute path within config directory
 */
export function configPath(...segments: string[]): string {
  return join(paths.config, ...segments);
}

/**
 * Get absolute path within data directory
 */
export function dataPath(...segments: string[]): string {
  return join(paths.data, ...segments);
}

/**
 * Get absolute path within sync directory
 */
export function syncPath(...segments: string[]): string {
  return join(paths.sync, ...segments);
}
