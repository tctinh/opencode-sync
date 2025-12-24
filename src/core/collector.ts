/**
 * Collect OpenCode config files for sync
 */

import { glob } from "glob";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { paths, configPatterns } from "../utils/paths.js";
import { hashContent } from "../utils/hash.js";

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
 * Collection result
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
 * Collect all OpenCode config files
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
    });
    
    for (const match of matches) {
      const fullPath = join(configDir, match);
      
      if (!existsSync(fullPath)) {
        continue;
      }
      
      try {
        const content = readFileSync(fullPath, "utf8");
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
  const combinedHash = files.length > 0
    ? hashContent(files.map(f => `${f.relativePath}:${f.hash}`).join("\n"))
    : "";
  
  return {
    files,
    combinedHash,
    configDir,
  };
}

/**
 * Check if a path matches sync patterns
 */
export function shouldSync(relativePath: string): boolean {
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
  totalSize: number;
} {
  let configs = 0;
  let agents = 0;
  let commands = 0;
  let instructions = 0;
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
    }
  }
  
  return {
    total: files.length,
    configs,
    agents,
    commands,
    instructions,
    totalSize,
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
