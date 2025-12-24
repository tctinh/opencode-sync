/**
 * Pull command - Download config files from GitHub Gist
 */

import inquirer from "inquirer";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadAuth } from "../../storage/auth.js";
import { getGist } from "../../core/gist.js";
import { decryptObject } from "../../core/crypto.js";
import { paths } from "../../utils/paths.js";
import { recordSync } from "../../storage/state.js";
import { saveContexts, type ContextsStorage, type SessionContext } from "../../storage/contexts.js";
import { hashContent } from "../../utils/hash.js";

interface PullOptions {
  force?: boolean;
  verbose?: boolean;
}

/**
 * Sync payload structure (must match push.ts)
 */
interface SyncPayload {
  config: {
    files: Array<{
      path: string;
      content: string;
    }>;
    hash: string;
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
    version: 1;
    updatedAt: string;
    source: string;
  };
}

export async function pullCommand(options: PullOptions): Promise<void> {
  console.log("\n📥 Pulling from GitHub Gist...\n");
  
  // Check auth
  const auth = loadAuth();
  if (!auth) {
    console.error("✗ Not configured. Run 'opencodesync init' first.");
    process.exit(1);
  }
  
  if (!auth.gistId) {
    console.error("✗ No Gist ID found. Run 'opencodesync push' first to create one.");
    console.error("  Or run 'opencodesync init' to link to an existing Gist.");
    process.exit(1);
  }
  
  // Fetch from Gist
  console.log("Fetching from GitHub...");
  
  try {
    const gist = await getGist(auth.githubToken, auth.gistId);
    
    const syncFile = gist.files["opencodesync.json"];
    if (!syncFile) {
      console.error("✗ Sync data not found in Gist.");
      console.error("  The Gist may be empty or corrupted.");
      process.exit(1);
    }
    
    // Decrypt payload
    console.log("Decrypting data...");
    const encrypted = JSON.parse(syncFile.content);
    
    let payload: SyncPayload;
    try {
      payload = decryptObject<SyncPayload>(encrypted, auth.passphrase);
    } catch {
      console.error("✗ Decryption failed.");
      console.error("  Check that your passphrase is correct.");
      process.exit(1);
    }
    
    console.log(`✓ Decrypted successfully`);
    console.log(`  Last updated: ${new Date(payload.meta.updatedAt).toLocaleString()}`);
    console.log(`  Source: ${payload.meta.source}`);
    
    // Show what will be pulled
    console.log(`\nConfig files: ${payload.config.files.length}`);
    console.log(`Contexts: ${payload.contexts.items.length}`);
    
    if (options.verbose) {
      console.log("\nFiles to pull:");
      for (const file of payload.config.files) {
        console.log(`  • ${file.path}`);
      }
    }
    
    // Check for conflicts
    const conflicts: string[] = [];
    for (const file of payload.config.files) {
      const localPath = join(paths.config, file.path);
      if (existsSync(localPath)) {
        const localContent = readFileSync(localPath, "utf8");
        if (localContent !== file.content) {
          conflicts.push(file.path);
        }
      }
    }
    
    if (conflicts.length > 0 && !options.force) {
      console.log(`\n⚠️  ${conflicts.length} file(s) will be overwritten:`);
      for (const path of conflicts) {
        console.log(`  • ${path}`);
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
    
    // Write config files
    console.log("\nWriting config files...");
    for (const file of payload.config.files) {
      const localPath = join(paths.config, file.path);
      const dir = dirname(localPath);
      
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      writeFileSync(localPath, file.content, "utf8");
      
      if (options.verbose) {
        console.log(`  ✓ ${file.path}`);
      }
    }
    console.log(`✓ Wrote ${payload.config.files.length} config files`);
    
    // Update contexts
    console.log("\nUpdating contexts...");
    const contextsStorage: ContextsStorage = {
      contexts: payload.contexts.items.map(item => ({
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
    console.log(`✓ Updated ${payload.contexts.items.length} contexts`);
    
    // Record sync state
    const contextsHash = payload.contexts.items.length > 0
      ? hashContent(JSON.stringify(payload.contexts.items))
      : null;
    recordSync(auth.gistId, payload.config.hash, contextsHash);
    
    console.log("\n✓ Pull complete!");
    console.log(`  Config dir: ${paths.config}`);
    
  } catch (error) {
    console.error("\n✗ Pull failed:", error);
    process.exit(1);
  }
}
