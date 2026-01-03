/**
 * Provider types for multi-assistant support
 */

import { CollectedFile } from "../core/collector.js";

/**
 * Supported AI assistant types
 */
export type AssistantType = "opencode" | "claude-code" | "codex";

/**
 * MCP server transport type
 */
export type MCPTransportType = "stdio" | "http" | "sse";

/**
 * MCP server configuration (unified across assistants)
 */
export interface MCPServerConfig {
  /** Server name/identifier */
  name: string;
  /** Transport type */
  type: MCPTransportType;
  /** Command to run (for stdio) */
  command?: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** URL (for http/sse) */
  url?: string;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Whether server is enabled */
  enabled?: boolean;
}

/**
 * Config file patterns for an assistant
 */
export interface ConfigPatterns {
  /** Main config files (e.g., opencode.json, settings.json) */
  mainConfig: string[];
  /** Custom commands directory pattern */
  commands: string;
  /** Custom agents directory pattern */
  agents: string;
  /** Skills/rules directory pattern */
  skills: string;
  /** Global instructions file */
  instructions: string;
  /** MCP config file (if separate from main config) */
  mcpConfig?: string;
}

/**
 * Collection result for a single provider
 */
export interface ProviderCollectionResult {
  /** Provider ID */
  providerId: AssistantType;
  /** Collected files */
  files: CollectedFile[];
  /** Combined hash of all files */
  combinedHash: string;
  /** Config directory path */
  configDir: string;
}

/**
 * Multi-provider collection result
 */
export interface MultiCollectionResult {
  /** Results per provider */
  results: Map<AssistantType, ProviderCollectionResult>;
  /** Combined hash of all providers */
  combinedHash: string;
}

/**
 * AI Assistant Provider interface
 * Each supported assistant implements this interface
 */
export interface AssistantProvider {
  /** Unique identifier */
  readonly id: AssistantType;

  /** Display name for UI */
  readonly name: string;

  /** Config directory path */
  readonly configDir: string;

  /** File patterns to sync */
  readonly patterns: ConfigPatterns;

  /** Files/patterns to exclude from sync */
  readonly blocklist: string[];

  /**
   * Check if this assistant is installed on the system
   */
  isInstalled(): Promise<boolean>;

  /**
   * Get all MCP servers configured for this assistant
   */
  getMCPServers(): Promise<MCPServerConfig[]>;

  /**
   * Add or update an MCP server
   */
  setMCPServer(name: string, config: Omit<MCPServerConfig, "name">): Promise<void>;

  /**
   * Remove an MCP server
   */
  removeMCPServer(name: string): Promise<void>;

  /**
   * Collect all config files for sync
   */
  collectFiles(): Promise<ProviderCollectionResult>;

  /**
   * Apply files from sync
   */
  applyFiles(files: CollectedFile[]): Promise<void>;

  /**
   * Get all pattern strings for glob matching
   */
  getAllPatterns(): string[];
}

/**
 * Sync payload structure (v2 with multi-provider support)
 */
export interface SyncPayloadV2 {
  /** Provider-specific config files */
  providers: {
    [key in AssistantType]?: {
      files: Array<{ path: string; content: string }>;
      hash: string;
    };
  };
  /** Global MCP servers (~/.mcp.json) */
  mcpServers?: MCPServerConfig[];
  /** Session contexts (OpenCode-specific for now) */
  contexts: {
    items: Array<{
      id: string;
      name: string;
      summary: string;
      createdAt: string;
      project?: string;
    }>;
    hash: string | null;
  };
  /** Metadata */
  meta: {
    version: 2;
    updatedAt: string;
    source: string;
  };
}

/**
 * Legacy sync payload (v1 - OpenCode only)
 */
export interface SyncPayloadV1 {
  config: {
    files: Array<{ path: string; content: string }>;
    hash: string;
  };
  contexts: {
    items: Array<{
      id: string;
      name: string;
      summary: string;
      createdAt: string;
      project?: string;
    }>;
    hash: string | null;
  };
  meta: {
    version: 1;
    updatedAt: string;
    source: string;
  };
}

/**
 * Union type for sync payloads
 */
export type SyncPayload = SyncPayloadV1 | SyncPayloadV2;

/**
 * Type guard for v2 payload
 */
export function isPayloadV2(payload: SyncPayload): payload is SyncPayloadV2 {
  return payload.meta.version === 2;
}

/**
 * Type guard for v1 payload
 */
export function isPayloadV1(payload: SyncPayload): payload is SyncPayloadV1 {
  return payload.meta.version === 1;
}
