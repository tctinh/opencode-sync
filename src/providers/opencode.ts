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
import { getGlobalMCPServers } from "./mcp.js";

function envOr(key: string, defaultPath: string): string {
  return process.env[key] || join(homedir(), defaultPath);
}

const OPENCODE_CONFIG_DIR = join(envOr("XDG_CONFIG_HOME", ".config"), "opencode");

const OPENCODE_PATTERNS: ConfigPatterns = {
  mainConfig: ["opencode.json", "opencode.jsonc"],
  commands: "command/**/*.md",
  agents: "agent/**/*.md",
  skills: "skill/**/*",
  instructions: "AGENTS.md",
};

const PLUGIN_CONFIGS: Record<string, string> = {
  "antigravity.json": "OpenCode Antigravity Auth",
  "dcp.jsonc": "OpenCode DCP",
  "oh-my-opencode.json": "Oh My OpenCode",
  "smart-title.jsonc": "Smart Title",
};

const OPENCODE_BLOCKLIST = [
  "antigravity-accounts.json",
  "package.json",
  "package-lock.json",
  "bun.lock",
  "node_modules/**",
  "logs/**",
  "repos/**",
  ".git/**",
];

function isBlocked(relativePath: string): boolean {
  return OPENCODE_BLOCKLIST.some((pattern) => minimatch(relativePath, pattern));
}

class OpenCodeProvider implements AssistantProvider {
  readonly id: AssistantType = "opencode";
  readonly name = "OpenCode";
  readonly configDir = OPENCODE_CONFIG_DIR;
  readonly patterns = OPENCODE_PATTERNS;
  readonly blocklist = OPENCODE_BLOCKLIST;

  async isInstalled(): Promise<boolean> {
    return existsSync(this.configDir);
  }

  getAllPatterns(): string[] {
    return [
      ...this.patterns.mainConfig,
      this.patterns.commands,
      this.patterns.agents,
      this.patterns.skills,
      this.patterns.instructions,
      ...Object.keys(PLUGIN_CONFIGS),
    ];
  }

  getPluginConfigs(): Array<{ fileName: string; pluginName: string; filePath: string }> {
    const configs: Array<{ fileName: string; pluginName: string; filePath: string }> = [];
    
    for (const [fileName, pluginName] of Object.entries(PLUGIN_CONFIGS)) {
      const filePath = join(this.configDir, fileName);
      if (existsSync(filePath)) {
        configs.push({ fileName, pluginName, filePath });
      }
    }
    
    return configs;
  }

  async getMCPServers(): Promise<MCPServerConfig[]> {
    return getGlobalMCPServers();
  }

  async setMCPServer(name: string, config: Omit<MCPServerConfig, "name">): Promise<void> {
    const { setGlobalMCPServer } = await import("./mcp.js");
    setGlobalMCPServer(name, config);
  }

  async removeMCPServer(name: string): Promise<void> {
    const { removeGlobalMCPServer } = await import("./mcp.js");
    removeGlobalMCPServer(name);
  }

  async collectFiles(): Promise<ProviderCollectionResult> {
    const files: CollectedFile[] = [];

    if (!existsSync(this.configDir)) {
      return {
        providerId: this.id,
        files: [],
        combinedHash: "",
        configDir: this.configDir,
      };
    }

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

    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

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

  async applyFiles(files: CollectedFile[]): Promise<void> {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }

    for (const file of files) {
      const fullPath = join(this.configDir, file.relativePath);
      const dir = join(fullPath, "..");

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(fullPath, file.content, "utf8");
    }
  }
}

export const openCodeProvider = new OpenCodeProvider();
