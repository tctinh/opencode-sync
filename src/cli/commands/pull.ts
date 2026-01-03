/**
 * Pull command - Download config files from GitHub Gist
 */

import inquirer from "inquirer";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadAuth } from "../../storage/auth.js";
import { getGist } from "../../core/gist.js";
import { decryptObject } from "../../core/crypto.js";
import { recordSync } from "../../storage/state.js";
import { saveContexts } from "../../storage/contexts.js";
import { initializeProviders, getProvider } from "../../providers/registry.js";
import type { SyncPayload, AssistantType } from "../../providers/types.js";
import { isPayloadV2 } from "../../providers/types.js";

interface PullOptions {
  force?: boolean;
  verbose?: boolean;
  claude?: boolean;
  opencode?: boolean;
  codex?: boolean;
  gemini?: boolean;
  all?: boolean;
}

function determineProviders(options: PullOptions): AssistantType[] {
  const ids: AssistantType[] = [];
  if (options.claude) ids.push("claude-code");
  if (options.opencode) ids.push("opencode");
  if (options.codex) ids.push("codex");
  if (options.gemini) ids.push("gemini");
  
  if (ids.length === 0 || options.all) {
    return ["claude-code", "opencode", "codex", "gemini"];
  }
  return ids;
}

export async function pullCommand(options: PullOptions): Promise<void> {
  console.log("\n📥 Pulling from GitHub Gist...\n");

  await initializeProviders();

  const auth = loadAuth();
  if (!auth?.gistId) {
    console.error("✗ Not configured or no Gist ID. Run 'coding-agent-sync init' first.");
    process.exit(1);
  }

  const providerIds = determineProviders(options);

  console.log("Fetching from GitHub...");

  try {
    const gist = await getGist(auth.githubToken, auth.gistId);
    const syncFile = gist.files["coding-agent-sync.json"] || gist.files["opencodesync.json"];
    
    if (!syncFile) {
      console.error("✗ Sync data not found in Gist.");
      process.exit(1);
    }

    console.log("Decrypting data...");
    const payload = decryptObject<SyncPayload>(JSON.parse(syncFile.content), auth.passphrase);

    if (!options.force) {
      const { proceed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "proceed",
          message: "This will REPLACE all your local configurations for the selected assistants with the remote version. Proceed?",
          default: false,
        },
      ]);
      if (!proceed) return;
    }

    console.log("\nReplacing local configuration...");
    let writtenCount = 0;

    if (isPayloadV2(payload)) {
      // 1. Replace MCP Servers (~/.mcp.json)
      if (payload.mcpServers) {
        const mcpPath = join(homedir(), ".mcp.json");
        const mcpConfig = { mcpServers: {} as Record<string, any> };
        
        for (const server of payload.mcpServers) {
          const serverConfig: any = { type: server.type };
          if (server.command) serverConfig.command = server.command;
          if (server.args) serverConfig.args = server.args;
          if (server.env) serverConfig.env = server.env;
          if (server.url) serverConfig.url = server.url;
          if (server.headers) serverConfig.headers = server.headers;
          if (server.cwd) serverConfig.cwd = server.cwd;
          if (server.enabled === false) serverConfig.disabled = true;
          mcpConfig.mcpServers[server.name] = serverConfig;
        }
        
        writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 4));
        console.log("✓ Updated ~/.mcp.json");
      }

      // 2. Replace Assistant Configs
      for (const providerId of providerIds) {
        const providerData = payload.providers[providerId];
        if (providerData) {
          const provider = getProvider(providerId);
          if (provider) {
            await provider.applyFiles(
              providerData.files.map(f => ({
                relativePath: f.path,
                content: f.content,
                hash: "",
              }))
            );
            writtenCount += providerData.files.length;
            console.log(`✓ Replaced ${providerData.files.length} files for ${providerId}`);
          }
        }
      }

      // 3. Replace Contexts
      if (payload.contexts) {
        saveContexts({
          contexts: payload.contexts.items.map(c => ({ ...c, size: Buffer.byteLength(c.summary) })),
          version: 1
        });
        console.log(`✓ Updated ${payload.contexts.items.length} contexts`);
      }
    } else {
      // V1 Fallback (OpenCode only)
      const opencodeProvider = getProvider('opencode');
      if (opencodeProvider) {
        await opencodeProvider.applyFiles(
          payload.config.files.map((f) => ({
            relativePath: f.path,
            content: f.content,
            hash: "",
          }))
        );
        writtenCount = payload.config.files.length;
        console.log(`✓ Replaced ${writtenCount} files for opencode`);
      }
      
      saveContexts({
        contexts: payload.contexts.items.map(c => ({ ...c, size: Buffer.byteLength(c.summary) })),
        version: 1
      });
    }

    recordSync(auth.gistId, isPayloadV2(payload) ? "" : payload.config.hash, null);
    console.log("\n✓ Pull complete!");

  } catch (error) {
    console.error("\n✗ Pull failed:", error);
    process.exit(1);
  }
}
