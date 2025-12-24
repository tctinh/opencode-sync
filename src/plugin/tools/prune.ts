/**
 * Context Prune Tool
 * /context-prune - Delete saved contexts
 */

import {
  deleteContext,
  deleteAllContexts,
  getContext,
  getAllContexts,
} from "../../storage/contexts.js";

/**
 * Prune result
 */
export interface PruneResult {
  success: boolean;
  deleted: number;
  names?: string[];
  error?: string;
}

/**
 * Create the prune tool definition for OpenCode plugin
 */
export function createPruneTool() {
  return {
    name: "context-prune",
    description: "Delete saved session contexts",
    parameters: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Name or ID of context to delete",
        },
        all: {
          type: "boolean",
          description: "Delete all contexts (requires confirmation)",
        },
      },
    },
    execute: async (
      params: { name?: string; all?: boolean },
      context?: { confirm?: () => Promise<boolean> }
    ): Promise<PruneResult> => {
      try {
        // Delete all contexts
        if (params.all) {
          const contexts = getAllContexts();
          if (contexts.length === 0) {
            return {
              success: true,
              deleted: 0,
            };
          }
          
          // Request confirmation if available
          if (context?.confirm) {
            const confirmed = await context.confirm();
            if (!confirmed) {
              return {
                success: false,
                deleted: 0,
                error: "Cancelled by user",
              };
            }
          }
          
          const names = contexts.map((c) => c.name);
          const count = deleteAllContexts();
          
          return {
            success: true,
            deleted: count,
            names,
          };
        }
        
        // Delete specific context
        if (!params.name) {
          return {
            success: false,
            deleted: 0,
            error: "Please provide a context name to delete, or use --all to delete all contexts",
          };
        }
        
        const ctx = getContext(params.name);
        if (!ctx) {
          return {
            success: false,
            deleted: 0,
            error: `Context not found: ${params.name}`,
          };
        }
        
        const deleted = deleteContext(params.name);
        
        return {
          success: deleted,
          deleted: deleted ? 1 : 0,
          names: deleted ? [ctx.name] : undefined,
          error: deleted ? undefined : "Failed to delete context",
        };
        
      } catch (error) {
        return {
          success: false,
          deleted: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  };
}

/**
 * Format prune result for display
 */
export function formatPruneResult(result: PruneResult): string {
  if (!result.success) {
    return `Failed to delete: ${result.error}`;
  }
  
  if (result.deleted === 0) {
    return "No contexts deleted.";
  }
  
  if (result.deleted === 1 && result.names) {
    return `Deleted context: ${result.names[0]}`;
  }
  
  return `Deleted ${result.deleted} context(s)${result.names ? `: ${result.names.join(", ")}` : ""}`;
}
