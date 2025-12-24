/**
 * Session contexts storage
 * Manages AI-generated session summaries for cross-device sync
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { paths, ensureSyncDir } from "../utils/paths.js";
import { hashContent } from "../utils/hash.js";

/**
 * Maximum number of contexts to store
 */
export const MAX_CONTEXTS = 20;

/**
 * Maximum size per context in bytes (20KB)
 */
export const MAX_CONTEXT_SIZE = 20 * 1024;

/**
 * Session context metadata
 */
export interface SessionContext {
  /** Unique ID */
  id: string;
  /** User-provided or auto-generated name */
  name: string;
  /** AI-generated summary */
  summary: string;
  /** Creation timestamp (ISO string) */
  createdAt: string;
  /** Source session ID (for reference) */
  sessionId?: string;
  /** Project name or path */
  project?: string;
  /** Size in bytes */
  size: number;
}

/**
 * Contexts storage structure
 */
export interface ContextsStorage {
  /** List of contexts, newest first */
  contexts: SessionContext[];
  /** Version for migrations */
  version: 1;
}

/**
 * Default empty storage
 */
const DEFAULT_STORAGE: ContextsStorage = {
  contexts: [],
  version: 1,
};

/**
 * Generate a unique context ID
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Load contexts from disk
 */
export function loadContexts(): ContextsStorage {
  if (!existsSync(paths.contexts)) {
    return { ...DEFAULT_STORAGE, contexts: [] };
  }
  
  try {
    const content = readFileSync(paths.contexts, "utf8");
    const storage = JSON.parse(content) as ContextsStorage;
    
    if (storage.version !== 1) {
      console.warn(`Unknown contexts version: ${storage.version}`);
      return { ...DEFAULT_STORAGE, contexts: [] };
    }
    
    return storage;
  } catch (error) {
    console.warn("Failed to load contexts:", error);
    return { ...DEFAULT_STORAGE, contexts: [] };
  }
}

/**
 * Save contexts to disk
 */
export function saveContexts(storage: ContextsStorage): void {
  ensureSyncDir();
  writeFileSync(paths.contexts, JSON.stringify(storage, null, 2), "utf8");
}

/**
 * Add a new context
 * Enforces MAX_CONTEXTS limit by removing oldest
 */
export function addContext(
  name: string,
  summary: string,
  options?: {
    sessionId?: string;
    project?: string;
  }
): SessionContext {
  const storage = loadContexts();
  
  // Truncate summary if too large
  let truncatedSummary = summary;
  if (Buffer.byteLength(summary, "utf8") > MAX_CONTEXT_SIZE) {
    // Truncate to fit, preserving complete sentences
    const bytes = Buffer.from(summary, "utf8");
    truncatedSummary = bytes.subarray(0, MAX_CONTEXT_SIZE).toString("utf8");
    // Try to end at a sentence boundary
    const lastPeriod = truncatedSummary.lastIndexOf(". ");
    if (lastPeriod > truncatedSummary.length / 2) {
      truncatedSummary = truncatedSummary.substring(0, lastPeriod + 1);
    }
    truncatedSummary += "\n\n[Truncated due to size limit]";
  }
  
  const context: SessionContext = {
    id: generateId(),
    name,
    summary: truncatedSummary,
    createdAt: new Date().toISOString(),
    sessionId: options?.sessionId,
    project: options?.project,
    size: Buffer.byteLength(truncatedSummary, "utf8"),
  };
  
  // Add to beginning (newest first)
  storage.contexts.unshift(context);
  
  // Enforce limit
  if (storage.contexts.length > MAX_CONTEXTS) {
    storage.contexts = storage.contexts.slice(0, MAX_CONTEXTS);
  }
  
  saveContexts(storage);
  return context;
}

/**
 * Get a context by ID or name
 */
export function getContext(idOrName: string): SessionContext | null {
  const storage = loadContexts();
  
  // Try exact ID match
  let context = storage.contexts.find(c => c.id === idOrName);
  if (context) return context;
  
  // Try exact name match
  context = storage.contexts.find(c => c.name === idOrName);
  if (context) return context;
  
  // Try case-insensitive name match
  const lowerName = idOrName.toLowerCase();
  context = storage.contexts.find(c => c.name.toLowerCase() === lowerName);
  if (context) return context;
  
  // Try partial name match
  context = storage.contexts.find(c => 
    c.name.toLowerCase().includes(lowerName)
  );
  
  return context ?? null;
}

/**
 * Get all contexts
 */
export function getAllContexts(): SessionContext[] {
  return loadContexts().contexts;
}

/**
 * Delete a context by ID or name
 */
export function deleteContext(idOrName: string): boolean {
  const storage = loadContexts();
  const initialLength = storage.contexts.length;
  
  // Find context to delete
  const context = getContext(idOrName);
  if (!context) return false;
  
  storage.contexts = storage.contexts.filter(c => c.id !== context.id);
  
  if (storage.contexts.length < initialLength) {
    saveContexts(storage);
    return true;
  }
  
  return false;
}

/**
 * Delete all contexts
 */
export function deleteAllContexts(): number {
  const storage = loadContexts();
  const count = storage.contexts.length;
  
  storage.contexts = [];
  saveContexts(storage);
  
  return count;
}

/**
 * Get contexts hash for change detection
 */
export function getContextsHash(): string | null {
  const storage = loadContexts();
  
  if (storage.contexts.length === 0) {
    return null;
  }
  
  const content = JSON.stringify(storage.contexts);
  return hashContent(content);
}

/**
 * Search contexts by name or content
 */
export function searchContexts(query: string): SessionContext[] {
  const storage = loadContexts();
  const lowerQuery = query.toLowerCase();
  
  return storage.contexts.filter(c =>
    c.name.toLowerCase().includes(lowerQuery) ||
    c.summary.toLowerCase().includes(lowerQuery) ||
    (c.project?.toLowerCase().includes(lowerQuery) ?? false)
  );
}

/**
 * Format context info for display
 */
export function formatContext(context: SessionContext): string {
  const date = new Date(context.createdAt);
  const lines = [
    `Name: ${context.name}`,
    `Created: ${date.toLocaleString()}`,
    `Size: ${formatContextSize(context.size)}`,
  ];
  
  if (context.project) {
    lines.push(`Project: ${context.project}`);
  }
  
  return lines.join("\n");
}

/**
 * Format context size for display
 */
export function formatContextSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}
