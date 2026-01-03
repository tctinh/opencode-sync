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
  MCPTransportType
} from "./types.js";
import type { CollectedFile } from "../core/collector.js";
import { hashContent } from "../utils/hash.js";

const GEMINI_CONFIG_DIR = join(homedir(), ".gemini");
const GEMINI_MCP_PATH = join(GEMINI_CONFIG_DIR, "antigravity", "mcp_config.json");

const GEMINI_PATTERNS: ConfigPatterns = {
  mainConfig: ["settings.json"],
  commands: "", 
  agents: "",
  skills: "antigravity/brain/**/*.md",
  instructions: "GEMINI.md",
  mcpConfig: "antigravity/mcp_config.json"
};

const GEMINI_BLOCKLIST = [
  "google_accounts.json",
  "oauth_creds.json",
  "code_tracker/**",
  "node_modules/**",
  ".git/**",
];

function isBlocked(relativePath: string): boolean {
  return GEMINI_BLOCKLIST.some((pattern) => minimatch(relativePath, pattern));
}

class GeminiProvider implements AssistantProvider {
  readonly id: AssistantType = "gemini";
  readonly name = "Gemini CLI";
  readonly configDir = GEMINI_CONFIG_DIR;
  readonly patterns = GEMINI_PATTERNS;
  readonly blocklist = GEMINI_BLOCKLIST;

  async isInstalled(): Promise<boolean> {
    return existsSync(this.configDir);
  }

  getAllPatterns(): string[] {
    return [
      ...this.patterns.mainConfig,
      this.patterns.skills,
      this.patterns.instructions,
      this.patterns.mcpConfig!
    ].filter(Boolean);
  }

  async getMCPServers(): Promise<MCPServerConfig[]> {
    if (!existsSync(GEMINI_MCP_PATH)) return [];
    try {
      const content = readFileSync(GEMINI_MCP_PATH, "utf8");
      const config = JSON.parse(content);
      const servers: MCPServerConfig[] = [];
      if (config.mcpServers && typeof config.mcpServers === 'object') {
        for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
          const server = serverConfig as Record<string, unknown>;
          servers.push({
            name,
            type: (server.type as MCPTransportType) || 'stdio',
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
    } catch { return []; }
  }

  async setMCPServer(name: string, config: Omit<MCPServerConfig, "name">): Promise<void> {
    let existingConfig: Record<string, any> = {};
    if (existsSync(GEMINI_MCP_PATH)) {
      try { existingConfig = JSON.parse(readFileSync(GEMINI_MCP_PATH, "utf8")); } catch {}
    }
    if (!existingConfig.mcpServers) existingConfig.mcpServers = {};
    const serverConfig: Record<string, any> = { type: config.type };
    if (config.command) serverConfig.command = config.command;
    if (config.args) serverConfig.args = config.args;
    if (config.env) serverConfig.env = config.env;
    if (config.url) serverConfig.url = config.url;
    if (config.headers) serverConfig.headers = config.headers;
    if (config.cwd) serverConfig.cwd = config.cwd;
    if (config.enabled === false) serverConfig.disabled = true;
    existingConfig.mcpServers[name] = serverConfig;
    const dir = join(GEMINI_MCP_PATH, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(GEMINI_MCP_PATH, JSON.stringify(existingConfig, null, 2));
  }

  async removeMCPServer(name: string): Promise<void> {
    if (!existsSync(GEMINI_MCP_PATH)) return;
    try {
      const config = JSON.parse(readFileSync(GEMINI_MCP_PATH, "utf8"));
      if (config.mcpServers) {
        delete config.mcpServers[name];
        writeFileSync(GEMINI_MCP_PATH, JSON.stringify(config, null, 2));
      }
    } catch {}
  }

  async collectFiles(): Promise<ProviderCollectionResult> {
    const files: CollectedFile[] = [];
    if (!existsSync(this.configDir)) return { providerId: this.id, files: [], combinedHash: "", configDir: this.configDir };
    const allPatterns = this.getAllPatterns();
    for (const pattern of allPatterns) {
      const matches = await glob(pattern, { cwd: this.configDir, nodir: true, follow: true });
      for (const match of matches) {
        if (isBlocked(match)) continue;
        const fullPath = join(this.configDir, match);
        try {
          const content = readFileSync(realpathSync(fullPath), "utf8");
          files.push({ relativePath: match, content, hash: hashContent(content) });
        } catch {}
      }
    }
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const combinedHash = files.length > 0 ? hashContent(files.map(f => `${f.relativePath}:${f.hash}`).join("\n")) : "";
    return { providerId: this.id, files, combinedHash, configDir: this.configDir };
  }

  async applyFiles(files: CollectedFile[]): Promise<void> {
    if (!existsSync(this.configDir)) mkdirSync(this.configDir, { recursive: true });
    for (const file of files) {
      const fullPath = join(this.configDir, file.relativePath);
      const dir = join(fullPath, "..");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, file.content, "utf8");
    }
  }
}

export const geminiProvider = new GeminiProvider();
