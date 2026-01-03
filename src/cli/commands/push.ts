/**
 * Push command - Upload config files to GitHub Gist
 */

import { loadAuth, updateGistId } from "../../storage/auth.js";
import { collectFromProviders, getFileStats, formatSize } from "../../core/collector.js";
import { loadContexts, getContextsHash } from "../../storage/contexts.js";
import { loadSyncState, recordSync } from "../../storage/state.js";
import { encryptObject } from "../../core/crypto.js";
import { createGist, updateGist, type GistFile } from "../../core/gist.js";
import type { AssistantType } from "../../providers/types.js";

interface PushOptions {
  force?: boolean;
  verbose?: boolean;
  claude?: boolean;
  opencode?: boolean;
  all?: boolean;
}

interface SyncPayloadV2Internal {
  providers: {
    [key in AssistantType]?: {
      files: Array<{
        path: string;
        content: string;
      }>;
      hash: string;
    };
  };
  contexts: {
    items: Array<{
      id: string;
      name: string;
      summary: string;
      createdAt: string;
      project?: string;
    }>;
    hash: string | null;
  };
  meta: {
    version: 2;
    updatedAt: string;
    source: string;
  };
}

function determineProviders(options: PushOptions): AssistantType[] {
  if (options.claude) return ['claude-code'];
  if (options.opencode) return ['opencode'];
  if (options.all === false) {
    return [];
  }
  return ['claude-code', 'opencode'];
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

    if (options.verbose && stats.total > 0) {
      console.log(`  • ${stats.configs} config files`);
      console.log(`  • ${stats.agents} custom agents`);
      console.log(`  • ${stats.commands} custom commands`);
      console.log(`  • ${stats.instructions} instruction files`);
      if (stats.plugins > 0) console.log(`  • ${stats.plugins} plugin configs`);
      if (stats.skills > 0) console.log(`  • ${stats.skills} skill files`);
    }
  }

  console.log(`\n✓ Total: ${totalFiles} files (${formatSize(totalSize)})`);

  const contextsStorage = loadContexts();
  const contextsHash = getContextsHash();
  console.log(`✓ Session contexts: ${contextsStorage.contexts.length}`);

  const syncState = loadSyncState();
  const hasConfigChanges = syncState.configHash !== collection.combinedHash;
  const hasContextChanges = syncState.contextsHash !== contextsHash;

  if (!hasConfigChanges && !hasContextChanges && !options.force) {
    console.log("\n✓ No changes to push.");
    console.log("  Use --force to push anyway.");
    return;
  }

  if (options.verbose) {
    if (hasConfigChanges) console.log("  • Config files changed");
    if (hasContextChanges) console.log("  • Contexts changed");
  }

  console.log("\nEncrypting data...");

  const opencodeResult = collection.results.get('opencode');
  const claudeResult = collection.results.get('claude-code');

  const payloadV2: SyncPayloadV2Internal = {
    providers: {
      ...(opencodeResult && {
        opencode: {
          files: opencodeResult.files.map(f => ({
            path: f.relativePath,
            content: f.content,
          })),
          hash: opencodeResult.combinedHash,
        },
      }),
      ...(claudeResult && {
        'claude-code': {
          files: claudeResult.files.map(f => ({
            path: f.relativePath,
            content: f.content,
          })),
          hash: claudeResult.combinedHash,
        },
      }),
    },
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

  const encrypted = encryptObject(payloadV2, auth.passphrase);

  const gistFiles: GistFile[] = [
    {
      filename: "coding-agent-sync.json",
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
    console.log(`  Config files: ${totalFiles}`);
    console.log(`  Contexts: ${contextsStorage.contexts.length}`);
    console.log(`  Total size: ${formatSize(Buffer.byteLength(JSON.stringify(encrypted), "utf8"))}`);

  } catch (error) {
    console.error("\n✗ Push failed:", error);
    process.exit(1);
  }
}
