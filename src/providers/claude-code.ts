/**
 * Claude Code AI Assistant Provider
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { glob } from "glob";
import { minimatch } from "minimatch";
import type {
  AssistantProvider,
  AssistantType,
  ConfigPatterns,
  MCPServerConfig,
  ProviderCollectionResult,
} from "./types.js";
import type { CollectedFile } from "../core/collector.js";
import { hashContent } from "../utils/hash.js";

/**
 * Claude Code config directories
 * - ~/.claude/ - Main config directory
 * - ~/.claude.json - MCP servers and preferences (at home root)
 */
const CLAUDE_CONFIG_DIR = join(homedir(), ".claude");
const CLAUDE_JSON_PATH = join(homedir(), ".claude.json");

/**
 * Claude Code config patterns
 */
const CLAUDE_PATTERNS: ConfigPatterns = {
  mainConfig: ["settings.json", "settings.local.json"],
  commands: "commands/**/*.md",
  agents: "agents/**/*.md",
  skills: "rules/**/*.md",
  instructions: "CLAUDE.md",
  mcpConfig: "~/.claude.json", // Special marker for home-level config
};

/**
 * Files/patterns to exclude from sync
 */
const CLAUDE_BLOCKLIST = [
  "projects/**",
  "todos/**",
  "statsig/**",
  "local/**",
  "node_modules/**",
  ".git/**",
  "*.log",
  "*.tmp",
];

/**
 * Check if a file path is blocked from sync
 */
function isBlocked(relativePath: string): boolean {
  return CLAUDE_BLOCKLIST.some((pattern) => minimatch(relativePath, pattern));
}

/**
 * Claude Code Provider Implementation
 */
class ClaudeCodeProvider implements AssistantProvider {
  readonly id: AssistantType = "claude-code";
  readonly name = "Claude Code";
  readonly configDir = CLAUDE_CONFIG_DIR;
  readonly patterns = CLAUDE_PATTERNS;
  readonly blocklist = CLAUDE_BLOCKLIST;

  /**
   * Check if Claude Code is installed
   * Claude Code is considered installed if either:
   * - ~/.claude/ directory exists
   * - ~/.claude.json file exists
   */
  async isInstalled(): Promise<boolean> {
    return existsSync(this.configDir) || existsSync(CLAUDE_JSON_PATH);
  }

  /**
   * Get all patterns for glob matching
   */
  getAllPatterns(): string[] {
    return [
      ...this.patterns.mainConfig,
      this.patterns.commands,
      this.patterns.agents,
      this.patterns.skills,
      this.patterns.instructions,
    ];
  }

  /**
   * Get MCP servers from Claude Code config
   * MCP servers are stored in ~/.claude.json under mcpServers key
   */
  async getMCPServers(): Promise<MCPServerConfig[]> {
    if (!existsSync(CLAUDE_JSON_PATH)) {
      return [];
    }

    try {
      const content = readFileSync(CLAUDE_JSON_PATH, "utf8");
      const config = JSON.parse(content);
      const servers: MCPServerConfig[] = [];

      if (config.mcpServers && typeof config.mcpServers === "object") {
        for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
          const server = serverConfig as Record<string, unknown>;
          servers.push({
            name,
            type: (server.type as MCPServerConfig["type"]) || "stdio",
            command: server.command as string | undefined,
            args: server.args as string[] | undefined,
            env: server.env as Record<string, string> | undefined,
            url: server.url as string | undefined,
            headers: server.headers as Record<string, string> | undefined,
            cwd: server.cwd as string | undefined,
            enabled: server.disabled !== true,
          });
        }
      }

      return servers;
    } catch {
      return [];
    }
  }

  /**
   * Add or update an MCP server
   */
  async setMCPServer(name: string, config: Omit<MCPServerConfig, "name">): Promise<void> {
    let existingConfig: Record<string, unknown> = {};

    if (existsSync(CLAUDE_JSON_PATH)) {
      try {
        const content = readFileSync(CLAUDE_JSON_PATH, "utf8");
        existingConfig = JSON.parse(content);
      } catch {
        // Start fresh if parse fails
      }
    }

    if (!existingConfig.mcpServers) {
      existingConfig.mcpServers = {};
    }

    // Build server config object, only including defined properties
    const serverConfig: Record<string, unknown> = {};
    if (config.type) serverConfig.type = config.type;
    if (config.command) serverConfig.command = config.command;
    if (config.args) serverConfig.args = config.args;
    if (config.env) serverConfig.env = config.env;
    if (config.url) serverConfig.url = config.url;
    if (config.headers) serverConfig.headers = config.headers;
    if (config.cwd) serverConfig.cwd = config.cwd;
    if (config.enabled === false) serverConfig.disabled = true;

    (existingConfig.mcpServers as Record<string, unknown>)[name] = serverConfig;

    writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(existingConfig, null, 2));
  }

  /**
   * Remove an MCP server
   */
  async removeMCPServer(name: string): Promise<void> {
    if (!existsSync(CLAUDE_JSON_PATH)) {
      return;
    }

    try {
      const content = readFileSync(CLAUDE_JSON_PATH, "utf8");
      const config = JSON.parse(content);

      if (config.mcpServers && typeof config.mcpServers === "object") {
        delete (config.mcpServers as Record<string, unknown>)[name];
        writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2));
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Collect all config files for sync
   */
  async collectFiles(): Promise<ProviderCollectionResult> {
    const files: CollectedFile[] = [];

    // Collect files from ~/.claude/ directory
    if (existsSync(this.configDir)) {
      const allPatterns = this.getAllPatterns();

      for (const pattern of allPatterns) {
        const matches = await glob(pattern, {
          cwd: this.configDir,
          nodir: true,
          dot: false,
          follow: true,
        });

        for (const match of matches) {
          if (isBlocked(match)) {
            continue;
          }

          const fullPath = join(this.configDir, match);
          if (!existsSync(fullPath)) {
            continue;
          }

          let realPath = fullPath;
          try {
            realPath = realpathSync(fullPath);
          } catch {
            // Use original path if realpath fails
          }

          try {
            const content = readFileSync(realPath, "utf8");
            const hash = hashContent(content);

            files.push({
              relativePath: match,
              content,
              hash,
            });
          } catch (error) {
            console.warn(`Failed to read ${fullPath}:`, error);
          }
        }
      }
    }

    // Also collect ~/.claude.json (MCP servers config)
    if (existsSync(CLAUDE_JSON_PATH)) {
      try {
        const content = readFileSync(CLAUDE_JSON_PATH, "utf8");
        // Parse and filter out sensitive/non-syncable data
        const config = JSON.parse(content);
        const syncableConfig: Record<string, unknown> = {};

        // Only sync mcpServers (not OAuth, theme, etc.)
        if (config.mcpServers) {
          syncableConfig.mcpServers = config.mcpServers;
        }

        if (Object.keys(syncableConfig).length > 0) {
          const syncContent = JSON.stringify(syncableConfig, null, 2);
          const hash = hashContent(syncContent);

          files.push({
            relativePath: ".claude.json",
            content: syncContent,
            hash,
          });
        }
      } catch (error) {
        console.warn(`Failed to read ${CLAUDE_JSON_PATH}:`, error);
      }
    }

    // Sort for consistent ordering
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    // Calculate combined hash
    const combinedHash =
      files.length > 0
        ? hashContent(files.map((f) => `${f.relativePath}:${f.hash}`).join("\n"))
        : "";

    return {
      providerId: this.id,
      files,
      combinedHash,
      configDir: this.configDir,
    };
  }

  /**
   * Apply files from sync
   */
  async applyFiles(files: CollectedFile[]): Promise<void> {
    // Ensure config directory exists
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }

    for (const file of files) {
      // Special handling for .claude.json (goes to home directory)
      if (file.relativePath === ".claude.json") {
        // Merge with existing config to preserve non-synced settings
        let existingConfig: Record<string, unknown> = {};
        if (existsSync(CLAUDE_JSON_PATH)) {
          try {
            const content = readFileSync(CLAUDE_JSON_PATH, "utf8");
            existingConfig = JSON.parse(content);
          } catch {
            // Start fresh if parse fails
          }
        }

        try {
          const syncedConfig = JSON.parse(file.content);
          // Only overwrite mcpServers
          if (syncedConfig.mcpServers) {
            existingConfig.mcpServers = syncedConfig.mcpServers;
          }
          writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(existingConfig, null, 2));
        } catch (error) {
          console.warn("Failed to apply .claude.json:", error);
        }
        continue;
      }

      // Regular files go to ~/.claude/
      const fullPath = join(this.configDir, file.relativePath);
      const dir = join(fullPath, "..");

      // Ensure parent directory exists
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(fullPath, file.content, "utf8");
    }
  }
}

/**
 * Singleton instance
 */
export const claudeCodeProvider = new ClaudeCodeProvider();
