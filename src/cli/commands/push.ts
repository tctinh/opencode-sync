/**
 * Push command - Upload config files to GitHub Gist
 */

import { loadAuth, updateGistId } from "../../storage/auth.js";
import { collectConfigFiles, getFileStats, formatSize } from "../../core/collector.js";
import { loadContexts, getContextsHash } from "../../storage/contexts.js";
import { loadSyncState, recordSync } from "../../storage/state.js";
import { encryptObject } from "../../core/crypto.js";
import { createGist, updateGist, type GistFile } from "../../core/gist.js";

interface PushOptions {
  force?: boolean;
  verbose?: boolean;
}

/**
 * Sync payload structure
 */
interface SyncPayload {
  /** Config files */
  config: {
    files: Array<{
      path: string;
      content: string;
    }>;
    hash: string;
  };
  /** Session contexts */
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
  /** Sync metadata */
  meta: {
    version: 1;
    updatedAt: string;
    source: string;
  };
}

export async function pushCommand(options: PushOptions): Promise<void> {
  console.log("\n📤 Pushing to GitHub Gist...\n");
  
  // Check auth
  const auth = loadAuth();
  if (!auth) {
    console.error("✗ Not configured. Run 'opencodesync init' first.");
    process.exit(1);
  }
  
  // Collect config files
  console.log("Collecting config files...");
  const collection = await collectConfigFiles();
  const stats = getFileStats(collection.files);
  
  if (collection.files.length === 0) {
    console.log("✗ No config files found in:");
    console.log(`  ${collection.configDir}`);
    console.log("\nMake sure you have OpenCode config files.");
    process.exit(1);
  }
  
  console.log(`✓ Found ${stats.total} files (${formatSize(stats.totalSize)})`);
  if (options.verbose) {
    console.log(`  • ${stats.configs} config files`);
    console.log(`  • ${stats.agents} custom agents`);
    console.log(`  • ${stats.commands} custom commands`);
    console.log(`  • ${stats.instructions} instruction files`);
  }
  
  // Load contexts
  const contextsStorage = loadContexts();
  const contextsHash = getContextsHash();
  console.log(`✓ Found ${contextsStorage.contexts.length} session contexts`);
  
  // Check for changes
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
  
  // Build payload
  const payload: SyncPayload = {
    config: {
      files: collection.files.map(f => ({
        path: f.relativePath,
        content: f.content,
      })),
      hash: collection.combinedHash,
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
      version: 1,
      updatedAt: new Date().toISOString(),
      source: process.platform,
    },
  };
  
  // Encrypt payload
  console.log("\nEncrypting data...");
  const encrypted = encryptObject(payload, auth.passphrase);
  
  // Prepare Gist files
  const gistFiles: GistFile[] = [
    {
      filename: "opencodesync.json",
      content: JSON.stringify(encrypted, null, 2),
    },
  ];
  
  // Upload to Gist
  console.log("Uploading to GitHub...");
  
  try {
    let gistId: string;
    
    if (auth.gistId) {
      // Update existing Gist
      const gist = await updateGist(
        auth.githubToken,
        auth.gistId,
        "opencodesync - OpenCode settings sync",
        gistFiles
      );
      gistId = gist.id;
      console.log(`✓ Updated Gist: ${gistId}`);
    } else {
      // Create new Gist
      const gist = await createGist(
        auth.githubToken,
        "opencodesync - OpenCode settings sync",
        gistFiles
      );
      gistId = gist.id;
      updateGistId(gistId);
      console.log(`✓ Created Gist: ${gistId}`);
    }
    
    // Record sync state
    recordSync(gistId, collection.combinedHash, contextsHash);
    
    console.log("\n✓ Push complete!");
    console.log(`  Config files: ${stats.total}`);
    console.log(`  Contexts: ${contextsStorage.contexts.length}`);
    console.log(`  Total size: ${formatSize(Buffer.byteLength(JSON.stringify(encrypted), "utf8"))}`);
    
  } catch (error) {
    console.error("\n✗ Push failed:", error);
    process.exit(1);
  }
}
