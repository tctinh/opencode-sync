/**
 * Context Export Tool
 * /context-export - AI-powered session summarization for cross-device sync
 */

import {
  addContext,
  formatContextSize,
} from "../../storage/contexts.js";
import {
  SUMMARIZER_SYSTEM_PROMPT,
  createSummarizationPrompt,
  validateSummary,
  generateContextName,
} from "../../core/summarizer.js";

/**
 * Export result
 */
export interface ExportResult {
  success: boolean;
  contextId?: string;
  contextName?: string;
  size?: number;
  warnings?: string[];
  error?: string;
}

/**
 * Export options
 */
export interface ExportOptions {
  /** User guidance for what to focus on */
  guidance?: string;
  /** Custom name for the context */
  name?: string;
  /** Session ID for reference */
  sessionId?: string;
  /** Session title */
  sessionTitle?: string;
  /** Project name */
  project?: string;
}

/**
 * Create the export tool definition for OpenCode plugin
 */
export function createExportTool() {
  return {
    name: "context-export",
    description: "Export current session as a privacy-safe context for cross-device sync",
    parameters: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Custom name for this context (optional, auto-generated if not provided)",
        },
        guidance: {
          type: "string",
          description: "What to focus on in the summary (e.g., 'focus on auth work, skip DB details')",
        },
      },
    },
    execute: async (
      params: { name?: string; guidance?: string },
      context: {
        sessionId?: string;
        sessionTitle?: string;
        project?: string;
        generateSummary: (systemPrompt: string, userPrompt: string) => Promise<string>;
      }
    ): Promise<ExportResult> => {
      try {
        // Generate summary using AI
        const userPrompt = createSummarizationPrompt(
          params.guidance,
          context.sessionTitle,
          context.project
        );
        
        const summary = await context.generateSummary(
          SUMMARIZER_SYSTEM_PROMPT,
          userPrompt
        );
        
        // Validate summary for secrets
        const validation = validateSummary(summary);
        
        // Generate name if not provided
        const contextName = params.name || generateContextName(summary, context.sessionTitle);
        
        // Add to contexts storage
        const savedContext = addContext(contextName, summary, {
          sessionId: context.sessionId,
          project: context.project,
        });
        
        return {
          success: true,
          contextId: savedContext.id,
          contextName: savedContext.name,
          size: savedContext.size,
          warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
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
 * Format export result for display
 */
export function formatExportResult(result: ExportResult): string {
  if (!result.success) {
    return `Failed to export context: ${result.error}`;
  }
  
  let output = `Context saved successfully!\n`;
  output += `  Name: ${result.contextName}\n`;
  output += `  Size: ${formatContextSize(result.size || 0)}\n`;
  output += `  ID: ${result.contextId}\n`;
  
  if (result.warnings && result.warnings.length > 0) {
    output += `\nWarnings:\n`;
    for (const warning of result.warnings) {
      output += `  - ${warning}\n`;
    }
  }
  
  output += `\nRun 'opencodesync push' to sync to other devices.`;
  
  return output;
}
