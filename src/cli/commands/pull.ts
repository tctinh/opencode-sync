/**
 * Pull command - Download config files from GitHub Gist
 */

import inquirer from "inquirer";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadAuth } from "../../storage/auth.js";
import { getGist } from "../../core/gist.js";
import { decryptObject } from "../../core/crypto.js";
import { recordSync } from "../../storage/state.js";
import { saveContexts, type ContextsStorage, type SessionContext } from "../../storage/contexts.js";
import { hashContent } from "../../utils/hash.js";
import { initializeProviders } from "../../providers/registry.js";
import type { AssistantType, SyncPayloadV1, SyncPayloadV2 } from "../../providers/types.js";
import { getProvider } from "../../providers/registry.js";

interface PullOptions {
  force?: boolean;
  verbose?: boolean;
  claude?: boolean;
  opencode?: boolean;
  all?: boolean;
}

function determineProviders(options: PullOptions): AssistantType[] {
  if (options.claude) return ['claude-code'];
  if (options.opencode) return ['opencode'];
  if (options.all === false) return [];
  return ['claude-code', 'opencode'];
}

export async function pullCommand(options: PullOptions): Promise<void> {
  console.log("\n📥 Pulling from GitHub Gist...\n");

  await initializeProviders();

  const auth = loadAuth();
  if (!auth) {
    console.error("✗ Not configured. Run 'coding-agent-sync init' first.");
    process.exit(1);
  }

  if (!auth.gistId) {
    console.error("✗ No Gist ID found. Run 'coding-agent-sync push' first to create one.");
    console.error("  Or run 'coding-agent-sync init' to link to an existing Gist.");
    process.exit(1);
  }

  const providerIds = determineProviders(options);

  console.log("Fetching from GitHub...");

  try {
    const gist = await getGist(auth.githubToken, auth.gistId);

    const syncFile = gist.files["coding-agent-sync.json"] || gist.files["opencodesync.json"];
    if (!syncFile) {
      console.error("✗ Sync data not found in Gist.");
      console.error("  The Gist may be empty or corrupted.");
      process.exit(1);
    }

    console.log("Decrypting data...");
    const encrypted = JSON.parse(syncFile.content);

    let payload: SyncPayloadV1 | SyncPayloadV2;
    try {
      payload = decryptObject<SyncPayloadV1 | SyncPayloadV2>(encrypted, auth.passphrase);
    } catch {
      console.error("✗ Decryption failed.");
      console.error("  Check that your passphrase is correct.");
      process.exit(1);
    }

    const isV1 = payload.meta.version === 1;
    const isV2 = payload.meta.version === 2;

    console.log(`✓ Decrypted successfully (v${payload.meta.version})`);
    console.log(`  Last updated: ${new Date(payload.meta.updatedAt).toLocaleString()}`);
    console.log(`  Source: ${payload.meta.source}`);

    let filesToPull: Array<{ path: string; content: string; provider?: AssistantType }> = [];
    let contextsToPull: Array<{ id: string; name: string; summary: string; createdAt: string; project?: string }> = [];

    if (isV1) {
      const v1Payload = payload as SyncPayloadV1;
      filesToPull = v1Payload.config.files.map(f => ({ ...f, provider: 'opencode' }));
      contextsToPull = v1Payload.contexts.items;
    } else if (isV2) {
      const v2Payload = payload as SyncPayloadV2;

      for (const providerId of providerIds) {
        const providerData = v2Payload.providers[providerId];
        if (providerData) {
          filesToPull = filesToPull.concat(
            providerData.files.map(f => ({ ...f, provider: providerId }))
          );
        }
      }
      contextsToPull = v2Payload.contexts.items;
    }

    if (filesToPull.length === 0) {
      console.log("\n✗ No config files to pull for selected providers.");
      process.exit(1);
    }

    console.log(`\nConfig files: ${filesToPull.length}`);
    console.log(`Contexts: ${contextsToPull.length}`);

    if (options.verbose) {
      console.log("\nFiles to pull:");
      for (const file of filesToPull) {
        console.log(`  • ${file.provider || '?'}: ${file.path}`);
      }
    }

    const conflicts: Array<{ path: string; provider?: AssistantType }> = [];

    for (const file of filesToPull) {
      let localPath: string;

      if (file.provider) {
        const provider = getProvider(file.provider);
        if (!provider) {
          console.warn(`⚠️  Unknown provider: ${file.provider}, skipping`);
          continue;
        }
        localPath = join(provider.configDir, file.path);
      } else {
        continue;
      }

      if (existsSync(localPath)) {
        const localContent = readFileSync(localPath, "utf8");
        if (localContent !== file.content) {
          conflicts.push(file);
        }
      }
    }

    if (conflicts.length > 0 && !options.force) {
      console.log(`\n⚠️  ${conflicts.length} file(s) will be overwritten:`);
      for (const file of conflicts) {
        console.log(`  • ${file.provider || '?'}: ${file.path}`);
      }

      const { proceed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "proceed",
          message: "Overwrite local files?",
          default: false,
        },
      ]);

      if (!proceed) {
        console.log("\nPull cancelled.");
        return;
      }
    }

    console.log("\nWriting config files...");
    let writtenCount = 0;

    for (const file of filesToPull) {
      if (!file.provider) continue;

      const provider = getProvider(file.provider);
      if (!provider) {
        console.warn(`⚠️  Unknown provider: ${file.provider}, skipping`);
        continue;
      }

      const localPath = join(provider.configDir, file.path);
      const dir = dirname(localPath);

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(localPath, file.content, "utf8");
      writtenCount++;

      if (options.verbose) {
        console.log(`  ✓ ${file.provider}: ${file.path}`);
      }
    }

    console.log(`✓ Wrote ${writtenCount} config files`);

    console.log("\nUpdating contexts...");
    const contextsStorage: ContextsStorage = {
      contexts: contextsToPull.map(item => ({
        id: item.id,
        name: item.name,
        summary: item.summary,
        createdAt: item.createdAt,
        project: item.project,
        size: Buffer.byteLength(item.summary, "utf8"),
      } as SessionContext)),
      version: 1,
    };
    saveContexts(contextsStorage);
    console.log(`✓ Updated ${contextsToPull.length} contexts`);

    const configHash = isV1 ? (payload as SyncPayloadV1).config.hash : "";
    const contextsHash = contextsToPull.length > 0
      ? hashContent(JSON.stringify(contextsToPull))
      : null;

    recordSync(auth.gistId, configHash, contextsHash);

    console.log("\n✓ Pull complete!");
    console.log(`  Updated providers: ${providerIds.join(', ')}`);

  } catch (error) {
    console.error("\n✗ Pull failed:", error);
    process.exit(1);
  }
}
