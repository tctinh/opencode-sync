/**
 * OpenCode Sync Plugin
 * Registers context management tools with OpenCode
 */

// Import tool creators
import { createExportTool } from "./tools/export.js";
import { createImportTool } from "./tools/import.js";
import { createListTool } from "./tools/list.js";
import { createPruneTool } from "./tools/prune.js";

// Export tool creators
export { createExportTool, formatExportResult, type ExportResult, type ExportOptions } from "./tools/export.js";
export { createImportTool, formatImportResult, createResumePrompt, type ImportResult } from "./tools/import.js";
export { createListTool, formatListResult, type ListResult } from "./tools/list.js";
export { createPruneTool, formatPruneResult, type PruneResult } from "./tools/prune.js";

// Export summarizer utilities
export { SUMMARIZER_SYSTEM_PROMPT, createSummarizationPrompt, validateSummary, generateContextName } from "../core/summarizer.js";

// Export storage utilities for direct access
export {
  addContext,
  getContext,
  getAllContexts,
  deleteContext,
  deleteAllContexts,
  searchContexts,
  formatContext,
  formatContextSize,
  MAX_CONTEXTS,
  MAX_CONTEXT_SIZE,
  type SessionContext,
  type ContextsStorage,
} from "../storage/contexts.js";

// Export paths for configuration
export { paths, configPatterns } from "../utils/paths.js";

// Export event system
export {
  createEventHooks,
  initializeEventHandlers,
  on,
  emit,
  toast,
  setToastHandler,
  type EventType,
  type ToastOptions,
  type SessionCompactedEvent,
  type SessionEndedEvent,
  type ContextExportedEvent,
  type ContextImportedEvent,
} from "./events.js";

// Export error handling
export {
  SyncError,
  ErrorCode,
  toSyncError,
  formatError,
  withErrorHandling,
} from "../core/errors.js";

/**
 * Plugin configuration
 */
export interface PluginConfig {
  /** Maximum contexts to store */
  maxContexts?: number;
  /** Maximum size per context in bytes */
  maxContextSize?: number;
}

/**
 * Create all plugin tools
 */
export function createPluginTools() {
  return {
    export: createExportTool(),
    import: createImportTool(),
    list: createListTool(),
    prune: createPruneTool(),
  };
}

/**
 * Plugin metadata
 */
export const pluginInfo = {
  name: "opencodesync",
  version: "0.1.0",
  description: "Sync OpenCode settings and session contexts across devices",
  commands: [
    {
      name: "/context-export",
      description: "Export current session as a privacy-safe context",
      usage: "/context-export [name] [--guidance 'focus on...']",
    },
    {
      name: "/context-import",
      description: "Import saved contexts to resume work",
      usage: "/context-import [name...]",
    },
    {
      name: "/context-list",
      description: "List all saved contexts",
      usage: "/context-list [--search query]",
    },
    {
      name: "/context-prune",
      description: "Delete saved contexts",
      usage: "/context-prune <name> | --all",
    },
  ],
};
