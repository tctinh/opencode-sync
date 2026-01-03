/**
 * Push command - Upload config files to GitHub Gist
 */

import { loadAuth, updateGistId } from "../../storage/auth.js";
import { collectFromProviders, getFileStats, formatSize } from "../../core/collector.js";
import { loadContexts, getContextsHash } from "../../storage/contexts.js";
import { recordSync } from "../../storage/state.js";
import { encryptObject } from "../../core/crypto.js";
import { createGist, updateGist, type GistFile } from "../../core/gist.js";
import { getGlobalMCPServers } from "../../providers/mcp.js";
import type { AssistantType, SyncPayloadV2 } from "../../providers/types.js";

interface PushOptions {
  force?: boolean;
  verbose?: boolean;
  claude?: boolean;
  opencode?: boolean;
  codex?: boolean;
  gemini?: boolean;
  all?: boolean;
}

function determineProviders(options: PushOptions): AssistantType[] {
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

export async function pushCommand(options: PushOptions): Promise<void> {
  console.log("\n📤 Pushing to GitHub Gist...\n");

  const auth = loadAuth();
  if (!auth) {
    console.error("✗ Not configured. Run 'coding-agent-sync init' first.");
    process.exit(1);
  }

  const providerIds = determineProviders(options);

  console.log(`Collecting config files from ${providerIds.length} provider(s)...`);
  const collection = await collectFromProviders({
    providerIds,
    installedOnly: true,
  });

  if (collection.results.size === 0) {
    console.log("✗ No AI assistants found or configured.");
    process.exit(1);
  }

  let totalFiles = 0;
  let totalSize = 0;

  for (const [, result] of collection.results) {
    const stats = getFileStats(result.files);
    totalFiles += stats.total;
    totalSize += stats.totalSize;

    console.log(`✓ ${result.configDir}: ${stats.total} files (${formatSize(stats.totalSize)})`);
  }

  const mcpServers = getGlobalMCPServers();
  console.log(`✓ Global MCP servers: ${mcpServers.length}`);

  const contextsStorage = loadContexts();
  const contextsHash = getContextsHash();
  console.log(`✓ Session contexts: ${contextsStorage.contexts.length}`);

  console.log("\nEncrypting data...");

  const payload: SyncPayloadV2 = {
    providers: {},
    mcpServers,
    contexts: {
      items: contextsStorage.contexts.map(c => ({
        id: c.id,
        name: c.name,
        summary: c.summary,
        createdAt: c.createdAt,
        project: c.project,
      })),
      hash: contextsHash,
    },
    meta: {
      version: 2,
      updatedAt: new Date().toISOString(),
      source: process.platform,
    },
  };

  for (const [id, result] of collection.results) {
    payload.providers[id] = {
      files: result.files.map(f => ({
        path: f.relativePath,
        content: f.content,
      })),
      hash: result.combinedHash,
    };
  }

  const encrypted = encryptObject(payload, auth.passphrase);

  const gistFiles: GistFile[] = [
    {
      filename: "opencodesync.json",
      content: JSON.stringify(encrypted, null, 2),
    },
  ];

  console.log("Uploading to GitHub...");

  try {
    let gistId: string;

    if (auth.gistId) {
      const gist = await updateGist(
        auth.githubToken,
        auth.gistId,
        "coding-agent-sync - AI assistant settings sync",
        gistFiles
      );
      gistId = gist.id;
      console.log(`✓ Updated Gist: ${gistId}`);
    } else {
      const gist = await createGist(
        auth.githubToken,
        "coding-agent-sync - AI assistant settings sync",
        gistFiles
      );
      gistId = gist.id;
      updateGistId(gistId);
      console.log(`✓ Created Gist: ${gistId}`);
    }

    recordSync(gistId, collection.combinedHash, contextsHash);
    console.log("\n✓ Push complete!");

  } catch (error) {
    console.error("\n✗ Push failed:", error);
    process.exit(1);
  }
}
