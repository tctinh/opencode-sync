/**
 * Context List Tool
 * /context-list - Show all saved contexts
 */

import {
  getAllContexts,
  formatContextSize,
  type SessionContext,
} from "../../storage/contexts.js";

/**
 * List result
 */
export interface ListResult {
  success: boolean;
  contexts: SessionContext[];
  totalSize: number;
}

/**
 * Create the list tool definition for OpenCode plugin
 */
export function createListTool() {
  return {
    name: "context-list",
    description: "List all saved session contexts",
    parameters: {
      type: "object" as const,
      properties: {
        search: {
          type: "string",
          description: "Optional search query to filter contexts",
        },
      },
    },
    execute: async (
      params: { search?: string }
    ): Promise<ListResult> => {
      let contexts = getAllContexts();
      
      // Filter by search query if provided
      if (params.search) {
        const query = params.search.toLowerCase();
        contexts = contexts.filter(
          (c) =>
            c.name.toLowerCase().includes(query) ||
            c.summary.toLowerCase().includes(query) ||
            (c.project?.toLowerCase().includes(query) ?? false)
        );
      }
      
      const totalSize = contexts.reduce((sum, c) => sum + c.size, 0);
      
      return {
        success: true,
        contexts,
        totalSize,
      };
    },
  };
}

/**
 * Format list result for display
 */
export function formatListResult(result: ListResult): string {
  if (result.contexts.length === 0) {
    return "No saved contexts found.\n\nUse /context-export to save the current session.";
  }
  
  let output = `Saved Contexts (${result.contexts.length})\n`;
  output += `Total size: ${formatContextSize(result.totalSize)}\n`;
  output += "─".repeat(40) + "\n\n";
  
  for (const ctx of result.contexts) {
    const date = new Date(ctx.createdAt);
    output += `${ctx.name}\n`;
    output += `  Created: ${date.toLocaleString()}\n`;
    output += `  Size: ${formatContextSize(ctx.size)}\n`;
    if (ctx.project) {
      output += `  Project: ${ctx.project}\n`;
    }
    // Show preview (first 100 chars of summary)
    const preview = ctx.summary.substring(0, 100).replace(/\n/g, " ");
    output += `  Preview: ${preview}${ctx.summary.length > 100 ? "..." : ""}\n`;
    output += "\n";
  }
  
  return output;
}
