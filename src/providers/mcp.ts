import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { MCPServerConfig, MCPTransportType } from './types.js';

const GLOBAL_MCP_PATH = join(homedir(), '.mcp.json');

export function getGlobalMCPPath(): string {
  return GLOBAL_MCP_PATH;
}

export function getGlobalMCPServers(): MCPServerConfig[] {
  if (!existsSync(GLOBAL_MCP_PATH)) {
    return [];
  }

  try {
    const content = readFileSync(GLOBAL_MCP_PATH, 'utf8');
    const config = JSON.parse(content);
    const servers: MCPServerConfig[] = [];

    if (config.mcpServers && typeof config.mcpServers === 'object') {
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        const server = serverConfig as Record<string, unknown>;
        servers.push({
          name,
          type: (server.type as MCPTransportType) || 'stdio',
          command: server.command as string | undefined,
          args: server.args as string[] | undefined,
          env: server.env as Record<string, string> | undefined,
          url: server.url as string | undefined,
          headers: server.headers as Record<string, string> | undefined,
          cwd: server.cwd as string | undefined,
          enabled: server.disabled !== true,
        });
      }
    }

    return servers;
  } catch {
    return [];
  }
}

export function setGlobalMCPServer(name: string, config: Omit<MCPServerConfig, 'name'>): void {
  let existingConfig: Record<string, unknown> = {};

  if (existsSync(GLOBAL_MCP_PATH)) {
    try {
      const content = readFileSync(GLOBAL_MCP_PATH, 'utf8');
      existingConfig = JSON.parse(content);
    } catch {
      existingConfig = {};
    }
  }

  if (!existingConfig.mcpServers) {
    existingConfig.mcpServers = {};
  }

  const serverConfig: Record<string, unknown> = {};
  if (config.type) serverConfig.type = config.type;
  if (config.command) serverConfig.command = config.command;
  if (config.args) serverConfig.args = config.args;
  if (config.env) serverConfig.env = config.env;
  if (config.url) serverConfig.url = config.url;
  if (config.headers) serverConfig.headers = config.headers;
  if (config.cwd) serverConfig.cwd = config.cwd;
  if (config.enabled === false) serverConfig.disabled = true;

  (existingConfig.mcpServers as Record<string, unknown>)[name] = serverConfig;

  writeFileSync(GLOBAL_MCP_PATH, JSON.stringify(existingConfig, null, 4));
}

export function removeGlobalMCPServer(name: string): void {
  if (!existsSync(GLOBAL_MCP_PATH)) {
    return;
  }

  try {
    const content = readFileSync(GLOBAL_MCP_PATH, 'utf8');
    const config = JSON.parse(content);

    if (config.mcpServers && typeof config.mcpServers === 'object') {
      delete (config.mcpServers as Record<string, unknown>)[name];
      writeFileSync(GLOBAL_MCP_PATH, JSON.stringify(config, null, 4));
    }
  } catch {
    // Ignore
  }
}

export function getProjectMCPServers(workspacePath: string): MCPServerConfig[] {
  const projectMcpPath = join(workspacePath, '.mcp.json');
  
  if (!existsSync(projectMcpPath)) {
    return [];
  }

  try {
    const content = readFileSync(projectMcpPath, 'utf8');
    const config = JSON.parse(content);
    const servers: MCPServerConfig[] = [];

    if (config.mcpServers && typeof config.mcpServers === 'object') {
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        const server = serverConfig as Record<string, unknown>;
        servers.push({
          name,
          type: (server.type as MCPTransportType) || 'stdio',
          command: server.command as string | undefined,
          args: server.args as string[] | undefined,
          env: server.env as Record<string, string> | undefined,
          url: server.url as string | undefined,
          headers: server.headers as Record<string, string> | undefined,
          cwd: server.cwd as string | undefined,
          enabled: server.disabled !== true,
        });
      }
    }

    return servers;
  } catch {
    return [];
  }
}
