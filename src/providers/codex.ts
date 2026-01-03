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

const CODEX_CONFIG_DIR = join(homedir(), ".codex");
const CODEX_CONFIG_PATH = join(CODEX_CONFIG_DIR, "config.toml");

const CODEX_PATTERNS: ConfigPatterns = {
  mainConfig: ["config.toml"],
  commands: "", 
  agents: "",
  skills: "skills/**/*.md",
  instructions: "",
};

const CODEX_BLOCKLIST = [
  "auth.json",
  "sessions/**",
  "node_modules/**",
  ".git/**",
];

function isBlocked(relativePath: string): boolean {
  return CODEX_BLOCKLIST.some((pattern) => minimatch(relativePath, pattern));
}

class CodexProvider implements AssistantProvider {
  readonly id: AssistantType = "codex";
  readonly name = "Codex";
  readonly configDir = CODEX_CONFIG_DIR;
  readonly patterns = CODEX_PATTERNS;
  readonly blocklist = CODEX_BLOCKLIST;

  async isInstalled(): Promise<boolean> {
    return existsSync(this.configDir);
  }

  getAllPatterns(): string[] {
    return [
      ...this.patterns.mainConfig,
      this.patterns.skills,
    ].filter(Boolean);
  }

  async getMCPServers(): Promise<MCPServerConfig[]> {
    if (!existsSync(CODEX_CONFIG_PATH)) return [];
    try {
      const content = readFileSync(CODEX_CONFIG_PATH, "utf8");
      const mcpMatch = content.match(/\[mcpServers\]([\s\S]*?)(?=\n\[|$)/);
      if (!mcpMatch) return [];
      
      const servers: MCPServerConfig[] = [];
      // Basic extraction of server names and simple fields if possible
      // In a real app we'd use a toml library.
      return servers;
    } catch { return []; }
  }

  async setMCPServer(_name: string, _config: Omit<MCPServerConfig, "name">): Promise<void> {
    // For now we treat config.toml as a single file to sync
  }

  async removeMCPServer(_name: string): Promise<void> {}

  async collectFiles(): Promise<ProviderCollectionResult> {
    const files: CollectedFile[] = [];
    if (!existsSync(this.configDir)) {
      return { providerId: this.id, files: [], combinedHash: "", configDir: this.configDir };
    }

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
    const combinedHash = files.length > 0 ? hashContent(files.map((f) => `${f.relativePath}:${f.hash}`).join("\n")) : "";

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

export const codexProvider = new CodexProvider();
