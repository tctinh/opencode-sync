/**
 * Status command - Show sync status
 */

import { loadAuth } from "../../storage/auth.js";
import { loadSyncState, formatLastSync, hasPendingChanges } from "../../storage/state.js";
import { collectFromProviders, getFileStats, formatSize } from "../../core/collector.js";
import { loadContexts, getContextsHash } from "../../storage/contexts.js";
import { initializeProviders } from "../../providers/registry.js";
import type { AssistantType } from "../../providers/types.js";

interface StatusOptions {
  verbose?: boolean;
  claude?: boolean;
  opencode?: boolean;
  codex?: boolean;
  gemini?: boolean;
  all?: boolean;
}

function determineProviders(options: StatusOptions): AssistantType[] {
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

export async function statusCommand(options: StatusOptions): Promise<void> {
  console.log("\n📊 Coding Agent Sync Status\n");

  await initializeProviders();

  const auth = loadAuth();
  if (!auth) {
    console.log("Status: ❌ Not configured");
    console.log("\nRun 'coding-agent-sync init' to set up sync.");
    return;
  }

  console.log("Status: ✅ Configured\n");

  const providerIds = determineProviders(options);

  console.log("Providers:");
  for (const providerId of providerIds) {
    console.log(`  • ${providerId}`);
  }

  console.log("\nGist:");
  if (auth.gistId) {
    console.log(`  ID: ${auth.gistId}`);
    console.log(`  URL: https://gist.github.com/${auth.gistId}`);
  } else {
    console.log("  Not yet created (run 'coding-agent-sync push')");
  }

  const syncState = loadSyncState();
  console.log("\nLast Sync:");
  console.log(`  ${formatLastSync()}`);

  console.log("\nLocal Config Files:");
  const collection = await collectFromProviders({
    providerIds,
    installedOnly: true,
  });

  if (collection.results.size === 0) {
    console.log("  No AI assistants found or configured");
  } else {
    let totalFiles = 0;
    let totalSize = 0;

    for (const [id, result] of collection.results) {
      const stats = getFileStats(result.files);
      totalFiles += stats.total;
      totalSize += stats.totalSize;

      console.log(`\n  ${id}:`);
      console.log(`    Config: ${result.configDir}`);
      console.log(`    Files: ${stats.total} (${formatSize(stats.totalSize)})`);
      console.log(`      • ${stats.configs} config`);
      console.log(`      • ${stats.agents} agents`);
      console.log(`      • ${stats.commands} commands`);
      console.log(`      • ${stats.instructions} instructions`);
      if (stats.plugins > 0) console.log(`      • ${stats.plugins} plugins`);
      if (stats.skills > 0) console.log(`      • ${stats.skills} skills`);

      if (options.verbose && stats.total > 0) {
        console.log("      Files:");
        for (const file of result.files) {
          console.log(`        • ${file.relativePath}`);
        }
      }
    }

    console.log(`\n  Total: ${totalFiles} files (${formatSize(totalSize)})`);
  }

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

  console.log("\nPending Changes:");
  if (auth.gistId && syncState.lastSync) {
    const hasChanges = hasPendingChanges(collection.combinedHash, contextsHash);

    if (hasChanges) {
      const configChanged = syncState.configHash !== collection.combinedHash;
      const contextsChanged = syncState.contextsHash !== contextsHash;

      console.log("  ⚠️  Local changes not pushed:");
      if (configChanged) console.log("    • Config files modified");
      if (contextsChanged) console.log("    • Contexts modified");
      console.log("\n  Run 'coding-agent-sync push' to sync.");
    } else {
      console.log("  ✅ In sync with remote");
    }
  } else {
    console.log("  📤 Initial push required");
    console.log("\n  Run 'coding-agent-sync push' to upload your settings.");
  }

  console.log("");
}
