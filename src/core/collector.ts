/**
 * Collect config files for sync
 * Supports multiple AI assistant providers
 */

import { glob } from "glob";
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { minimatch } from "minimatch";
import { paths, configPatterns, syncBlocklist } from "../utils/paths.js";
import { hashContent } from "../utils/hash.js";
import type {
  AssistantProvider,
  AssistantType,
  MultiCollectionResult,
  ProviderCollectionResult,
} from "../providers/types.js";
import { getProviders, initializeProviders } from "../providers/registry.js";

/**
 * Collected file with content and metadata
 */
export interface CollectedFile {
  /** Relative path from config directory */
  relativePath: string;
  /** File content */
  content: string;
  /** Content hash for change detection */
  hash: string;
}

/**
 * Collection result (legacy format for backward compatibility)
 */
export interface CollectionResult {
  /** Collected files */
  files: CollectedFile[];
  /** Combined hash of all files */
  combinedHash: string;
  /** Config directory path */
  configDir: string;
}

/**
 * Check if a file path is blocked from sync
 */
function isBlocked(relativePath: string): boolean {
  return syncBlocklist.some((pattern) => minimatch(relativePath, pattern));
}

/**
 * Collect all OpenCode config files (legacy function for backward compatibility)
 * @deprecated Use collectFromProviders instead
 */
export async function collectConfigFiles(): Promise<CollectionResult> {
  const configDir = paths.config;
  const files: CollectedFile[] = [];

  if (!existsSync(configDir)) {
    return {
      files: [],
      combinedHash: "",
      configDir,
    };
  }

  // Collect files matching each pattern
  for (const pattern of configPatterns.all) {
    const matches = await glob(pattern, {
      cwd: configDir,
      nodir: true,
      dot: false,
      follow: true, // Resolve symlinks (for skills directory)
    });

    for (const match of matches) {
      // Skip blocked files
      if (isBlocked(match)) {
        continue;
      }

      const fullPath = join(configDir, match);

      if (!existsSync(fullPath)) {
        continue;
      }

      // Resolve symlinks to get actual file content
      let realPath = fullPath;
      try {
        realPath = realpathSync(fullPath);
      } catch {
        // If realpath fails, use original path
      }

      try {
        const content = readFileSync(realPath, "utf8");
        const hash = hashContent(content);

        files.push({
          relativePath: match,
          content,
          hash,
        });
      } catch (error) {
        console.warn(`Failed to read ${fullPath}:`, error);
      }
    }
  }

  // Sort for consistent ordering
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Calculate combined hash
  const combinedHash =
    files.length > 0 ? hashContent(files.map((f) => `${f.relativePath}:${f.hash}`).join("\n")) : "";

  return {
    files,
    combinedHash,
    configDir,
  };
}

/**
 * Collect config files from multiple providers
 */
export async function collectFromProviders(options?: {
  providerIds?: AssistantType[];
  installedOnly?: boolean;
}): Promise<MultiCollectionResult> {
  // Initialize providers if not already done
  await initializeProviders();

  const providers = await getProviders({
    ids: options?.providerIds,
    installedOnly: options?.installedOnly ?? true,
  });

  const results = new Map<AssistantType, ProviderCollectionResult>();

  for (const provider of providers) {
    try {
      const result = await provider.collectFiles();
      results.set(provider.id, result);
    } catch (error) {
      console.warn(`Failed to collect from ${provider.name}:`, error);
    }
  }

  // Calculate combined hash across all providers
  const allHashes: string[] = [];
  for (const [id, result] of results) {
    if (result.combinedHash) {
      allHashes.push(`${id}:${result.combinedHash}`);
    }
  }
  allHashes.sort();

  const combinedHash = allHashes.length > 0 ? hashContent(allHashes.join("\n")) : "";

  return {
    results,
    combinedHash,
  };
}

/**
 * Collect config files from a single provider
 */
export async function collectFromProvider(
  provider: AssistantProvider
): Promise<ProviderCollectionResult> {
  return provider.collectFiles();
}

/**
 * Check if a path matches sync patterns
 */
export function shouldSync(relativePath: string): boolean {
  // Check blocklist first
  if (isBlocked(relativePath)) {
    return false;
  }

  // Check main config files
  if ((configPatterns.mainConfig as readonly string[]).includes(relativePath)) {
    return true;
  }

  // Check instructions
  if (relativePath === configPatterns.instructions) {
    return true;
  }

  // Check agent pattern
  if (relativePath.startsWith("agent/") && relativePath.endsWith(".md")) {
    return true;
  }

  // Check command pattern
  if (relativePath.startsWith("command/") && relativePath.endsWith(".md")) {
    return true;
  }

  // Check plugin configs (*.jsonc or known ecosystem configs)
  for (const pattern of configPatterns.pluginConfigs) {
    if (minimatch(relativePath, pattern)) {
      return true;
    }
  }

  // Check skills pattern
  if (relativePath.startsWith("skills/")) {
    return true;
  }

  return false;
}

/**
 * Get file stats for display
 */
export function getFileStats(files: CollectedFile[]): {
  total: number;
  configs: number;
  agents: number;
  commands: number;
  instructions: number;
  plugins: number;
  skills: number;
  totalSize: number;
} {
  let configs = 0;
  let agents = 0;
  let commands = 0;
  let instructions = 0;
  let plugins = 0;
  let skills = 0;
  let totalSize = 0;

  for (const file of files) {
    totalSize += Buffer.byteLength(file.content, "utf8");

    if ((configPatterns.mainConfig as readonly string[]).includes(file.relativePath)) {
      configs++;
    } else if (file.relativePath.startsWith("agent/")) {
      agents++;
    } else if (file.relativePath.startsWith("command/")) {
      commands++;
    } else if (file.relativePath === configPatterns.instructions) {
      instructions++;
    } else if (file.relativePath.startsWith("skills/") || file.relativePath.startsWith("skill/")) {
      skills++;
    } else if (
      file.relativePath.endsWith(".jsonc") ||
      file.relativePath === "oh-my-opencode.json"
    ) {
      plugins++;
    }
  }

  return {
    total: files.length,
    configs,
    agents,
    commands,
    instructions,
    plugins,
    skills,
    totalSize,
  };
}

/**
 * Get file stats for a multi-provider collection
 */
export function getMultiProviderStats(result: MultiCollectionResult): {
  byProvider: Map<
    AssistantType,
    {
      total: number;
      configs: number;
      agents: number;
      commands: number;
      instructions: number;
      plugins: number;
      skills: number;
      totalSize: number;
    }
  >;
  total: {
    providers: number;
    files: number;
    totalSize: number;
  };
} {
  const byProvider = new Map<
    AssistantType,
    ReturnType<typeof getFileStats>
  >();

  let totalFiles = 0;
  let totalSize = 0;

  for (const [id, providerResult] of result.results) {
    const stats = getFileStats(providerResult.files);
    byProvider.set(id, stats);
    totalFiles += stats.total;
    totalSize += stats.totalSize;
  }

  return {
    byProvider,
    total: {
      providers: result.results.size,
      files: totalFiles,
      totalSize,
    },
  };
}

/**
 * Format file size for display
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
