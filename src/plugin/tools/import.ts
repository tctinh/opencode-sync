/**
 * Context Import Tool
 * /context-import - Resume work from synced contexts
 */

import {
  getContext,
  getAllContexts,
  formatContext,
  type SessionContext,
} from "../../storage/contexts.js";

/**
 * Import result
 */
export interface ImportResult {
  success: boolean;
  contexts?: SessionContext[];
  combinedSummary?: string;
  error?: string;
}

/**
 * Import options
 */
export interface ImportOptions {
  /** Context names or IDs to import (can be multiple) */
  names: string[];
}

/**
 * Create the import tool definition for OpenCode plugin
 */
export function createImportTool() {
  return {
    name: "context-import",
    description: "Import saved contexts to resume work with full context",
    parameters: {
      type: "object" as const,
      properties: {
        names: {
          type: "array",
          items: { type: "string" },
          description: "Context names or IDs to import (supports partial matching)",
        },
      },
    },
    execute: async (
      params: { names?: string[] }
    ): Promise<ImportResult> => {
      try {
        // If no names provided, list all contexts
        if (!params.names || params.names.length === 0) {
          const allContexts = getAllContexts();
          
          if (allContexts.length === 0) {
            return {
              success: false,
              error: "No saved contexts found. Use /context-export to save a context first.",
            };
          }
          
          return {
            success: true,
            contexts: allContexts,
          };
        }
        
        // Find requested contexts
        const foundContexts: SessionContext[] = [];
        const notFound: string[] = [];
        
        for (const name of params.names) {
          const context = getContext(name);
          if (context) {
            foundContexts.push(context);
          } else {
            notFound.push(name);
          }
        }
        
        if (foundContexts.length === 0) {
          return {
            success: false,
            error: `No matching contexts found for: ${notFound.join(", ")}`,
          };
        }
        
        // Combine summaries if multiple contexts
        let combinedSummary: string;
        
        if (foundContexts.length === 1) {
          combinedSummary = foundContexts[0].summary;
        } else {
          combinedSummary = foundContexts
            .map((ctx, i) => `## Context ${i + 1}: ${ctx.name}\n\n${ctx.summary}`)
            .join("\n\n---\n\n");
        }
        
        return {
          success: true,
          contexts: foundContexts,
          combinedSummary,
        };
        
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  };
}

/**
 * Format import result for display
 */
export function formatImportResult(result: ImportResult): string {
  if (!result.success) {
    return `Failed to import context: ${result.error}`;
  }
  
  if (!result.combinedSummary && result.contexts) {
    // List mode
    let output = `Available contexts (${result.contexts.length}):\n\n`;
    
    for (const ctx of result.contexts) {
      output += formatContext(ctx) + "\n\n";
    }
    
    output += `\nUse /context-import <name> to import a specific context.`;
    return output;
  }
  
  if (result.contexts && result.combinedSummary) {
    const names = result.contexts.map(c => c.name).join(", ");
    return `Imported ${result.contexts.length} context(s): ${names}\n\nContext Summary:\n${result.combinedSummary}`;
  }
  
  return "Import completed.";
}

/**
 * Create initial prompt from imported contexts
 */
export function createResumePrompt(contexts: SessionContext[]): string {
  if (contexts.length === 0) {
    return "";
  }
  
  let prompt = `I'm resuming work from a previous session. Here's the context from my earlier work:\n\n`;
  
  if (contexts.length === 1) {
    prompt += contexts[0].summary;
  } else {
    for (let i = 0; i < contexts.length; i++) {
      prompt += `## Previous Session ${i + 1}: ${contexts[i].name}\n\n`;
      prompt += contexts[i].summary;
      prompt += "\n\n---\n\n";
    }
  }
  
  prompt += `\n\nPlease review this context and help me continue where I left off.`;
  
  return prompt;
}
