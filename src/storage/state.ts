/**
 * Sync state tracking
 * Tracks last sync timestamp, gist ID, and content hashes
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { paths, ensureSyncDir } from "../utils/paths.js";

/**
 * Sync state structure
 */
export interface SyncState {
  /** Last successful sync timestamp (ISO string) */
  lastSync: string | null;
  /** Gist ID for sync storage */
  gistId: string | null;
  /** Hash of last synced config content */
  configHash: string | null;
  /** Hash of last synced contexts */
  contextsHash: string | null;
  /** Version for migrations */
  version: 1;
}

/**
 * Default empty state
 */
const DEFAULT_STATE: SyncState = {
  lastSync: null,
  gistId: null,
  configHash: null,
  contextsHash: null,
  version: 1,
};

/**
 * Load sync state from disk
 */
export function loadSyncState(): SyncState {
  if (!existsSync(paths.syncState)) {
    return { ...DEFAULT_STATE };
  }
  
  try {
    const content = readFileSync(paths.syncState, "utf8");
    const state = JSON.parse(content) as SyncState;
    
    // Validate version
    if (state.version !== 1) {
      console.warn(`Unknown sync state version: ${state.version}`);
      return { ...DEFAULT_STATE };
    }
    
    return state;
  } catch (error) {
    console.warn("Failed to load sync state:", error);
    return { ...DEFAULT_STATE };
  }
}

/**
 * Save sync state to disk
 */
export function saveSyncState(state: SyncState): void {
  ensureSyncDir();
  writeFileSync(paths.syncState, JSON.stringify(state, null, 2), "utf8");
}

/**
 * Update sync state with new values
 */
export function updateSyncState(updates: Partial<Omit<SyncState, "version">>): SyncState {
  const current = loadSyncState();
  const updated: SyncState = {
    ...current,
    ...updates,
    version: 1,
  };
  saveSyncState(updated);
  return updated;
}

/**
 * Record a successful sync
 */
export function recordSync(gistId: string, configHash: string, contextsHash: string | null): SyncState {
  return updateSyncState({
    lastSync: new Date().toISOString(),
    gistId,
    configHash,
    contextsHash,
  });
}

/**
 * Check if there are pending changes
 */
export function hasPendingChanges(currentConfigHash: string, currentContextsHash: string | null): boolean {
  const state = loadSyncState();
  
  if (state.configHash !== currentConfigHash) {
    return true;
  }
  
  if (state.contextsHash !== currentContextsHash) {
    return true;
  }
  
  return false;
}

/**
 * Format last sync time for display
 */
export function formatLastSync(): string {
  const state = loadSyncState();
  
  if (!state.lastSync) {
    return "Never synced";
  }
  
  const date = new Date(state.lastSync);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // Less than a minute
  if (diff < 60 * 1000) {
    return "Just now";
  }
  
  // Less than an hour
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  }
  
  // Less than a day
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }
  
  // More than a day
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days < 7) {
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }
  
  // Format as date
  return date.toLocaleDateString();
}

/**
 * Clear sync state
 */
export function clearSyncState(): void {
  saveSyncState({ ...DEFAULT_STATE });
}
