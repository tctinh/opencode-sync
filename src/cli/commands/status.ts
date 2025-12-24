/**
 * Status command - Show sync status
 */

import { loadAuth } from "../../storage/auth.js";
import { loadSyncState, formatLastSync, hasPendingChanges } from "../../storage/state.js";
import { collectConfigFiles, getFileStats, formatSize } from "../../core/collector.js";
import { loadContexts, getContextsHash } from "../../storage/contexts.js";
import { paths } from "../../utils/paths.js";

interface StatusOptions {
  verbose?: boolean;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  console.log("\n📊 OpenCode Sync Status\n");
  
  // Check auth
  const auth = loadAuth();
  if (!auth) {
    console.log("Status: ❌ Not configured");
    console.log("\nRun 'opencodesync init' to set up sync.");
    return;
  }
  
  console.log("Status: ✅ Configured\n");
  
  // Paths
  console.log("Paths:");
  console.log(`  Config:  ${paths.config}`);
  console.log(`  Sync:    ${paths.sync}`);
  
  // Gist info
  console.log("\nGist:");
  if (auth.gistId) {
    console.log(`  ID: ${auth.gistId}`);
    console.log(`  URL: https://gist.github.com/${auth.gistId}`);
  } else {
    console.log("  Not yet created (run 'opencodesync push')");
  }
  
  // Sync state
  const syncState = loadSyncState();
  console.log("\nLast Sync:");
  console.log(`  ${formatLastSync()}`);
  
  // Collect current files
  console.log("\nLocal Config Files:");
  const collection = await collectConfigFiles();
  const stats = getFileStats(collection.files);
  
  if (collection.files.length === 0) {
    console.log("  No config files found");
  } else {
    console.log(`  Total: ${stats.total} files (${formatSize(stats.totalSize)})`);
    console.log(`  • ${stats.configs} config files`);
    console.log(`  • ${stats.agents} custom agents`);
    console.log(`  • ${stats.commands} custom commands`);
    console.log(`  • ${stats.instructions} instruction files`);
    if (stats.plugins > 0) console.log(`  • ${stats.plugins} plugin configs`);
    if (stats.skills > 0) console.log(`  • ${stats.skills} skill files`);
    
    if (options.verbose) {
      console.log("\n  Files:");
      for (const file of collection.files) {
        console.log(`    • ${file.relativePath}`);
      }
    }
  }
  
  // Contexts
  const contexts = loadContexts();
  const contextsHash = getContextsHash();
  
  console.log("\nSession Contexts:");
  if (contexts.contexts.length === 0) {
    console.log("  No contexts saved");
  } else {
    console.log(`  Total: ${contexts.contexts.length} contexts`);
    
    if (options.verbose) {
      console.log("\n  Contexts:");
      for (const ctx of contexts.contexts) {
        const date = new Date(ctx.createdAt);
        console.log(`    • ${ctx.name} (${date.toLocaleDateString()})`);
      }
    }
  }
  
  // Pending changes
  console.log("\nPending Changes:");
  if (auth.gistId && syncState.lastSync) {
    const hasChanges = hasPendingChanges(collection.combinedHash, contextsHash);
    
    if (hasChanges) {
      const configChanged = syncState.configHash !== collection.combinedHash;
      const contextsChanged = syncState.contextsHash !== contextsHash;
      
      console.log("  ⚠️  Local changes not pushed:");
      if (configChanged) console.log("    • Config files modified");
      if (contextsChanged) console.log("    • Contexts modified");
      console.log("\n  Run 'opencodesync push' to sync.");
    } else {
      console.log("  ✅ In sync with remote");
    }
  } else {
    console.log("  📤 Initial push required");
    console.log("\n  Run 'opencodesync push' to upload your settings.");
  }
  
  console.log("");
}
