import * as vscode from 'vscode';
import type { ConfigTreeProvider } from '../views/TreeProvider';
import { MCPServerItem } from '../views/TreeItems';
import type { MCPServerConfig } from '../../providers/types';
import { setGlobalMCPServer, removeGlobalMCPServer } from '../../providers/mcp';

export function registerMcpCommands(
  context: vscode.ExtensionContext,
  treeProvider: ConfigTreeProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.addMcpServer', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter MCP server name',
        placeHolder: 'my-server',
        validateInput: (value) => {
          if (!value || value.length < 1) {
            return 'Name is required';
          }
          if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
            return 'Name can only contain letters, numbers, hyphens, and underscores';
          }
          return null;
        },
      });

      if (!name) {
        return;
      }

      const type = await vscode.window.showQuickPick(
        [
          { label: 'stdio', description: 'Run a local command' },
          { label: 'http', description: 'Connect to an HTTP endpoint' },
          { label: 'sse', description: 'Connect via Server-Sent Events' },
        ],
        { placeHolder: 'Select server type' }
      );

      if (!type) {
        return;
      }

      const serverConfig: Omit<MCPServerConfig, 'name'> = {
        type: type.label as 'stdio' | 'http' | 'sse',
      };

      if (type.label === 'stdio') {
        const command = await vscode.window.showInputBox({
          prompt: 'Enter command to run',
          placeHolder: 'npx -y @modelcontextprotocol/server-filesystem',
        });

        if (!command) {
          return;
        }

        const parts = command.split(' ');
        serverConfig.command = parts[0];
        if (parts.length > 1) {
          serverConfig.args = parts.slice(1);
        }
      } else {
        const url = await vscode.window.showInputBox({
          prompt: 'Enter server URL',
          placeHolder: 'http://localhost:8080',
          validateInput: (value) => {
            if (!value) {
              return 'URL is required';
            }
            try {
              new URL(value);
              return null;
            } catch {
              return 'Invalid URL';
            }
          },
        });

        if (!url) {
          return;
        }

        serverConfig.url = url;
      }

      try {
        setGlobalMCPServer(name, serverConfig);
        vscode.window.showInformationMessage(`MCP server "${name}" added to ~/.mcp.json`);
        treeProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to add MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.editMcpServer', async (item: MCPServerItem) => {
      if (!item || !(item instanceof MCPServerItem)) {
        vscode.window.showErrorMessage('Please select an MCP server to edit');
        return;
      }

      const currentConfig = item.server;

      if (currentConfig.type === 'stdio') {
        const command = await vscode.window.showInputBox({
          prompt: 'Edit command',
          value: [currentConfig.command, ...(currentConfig.args || [])].join(' '),
        });

        if (command === undefined) {
          return;
        }

        const parts = command.split(' ');
        setGlobalMCPServer(currentConfig.name, {
          ...currentConfig,
          command: parts[0],
          args: parts.length > 1 ? parts.slice(1) : undefined,
        });
      } else {
        const url = await vscode.window.showInputBox({
          prompt: 'Edit URL',
          value: currentConfig.url,
        });

        if (url === undefined) {
          return;
        }

        setGlobalMCPServer(currentConfig.name, {
          ...currentConfig,
          url,
        });
      }

      vscode.window.showInformationMessage(`MCP server "${currentConfig.name}" updated`);
      treeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.deleteMcpServer', async (item: MCPServerItem) => {
      if (!item || !(item instanceof MCPServerItem)) {
        vscode.window.showErrorMessage('Please select an MCP server to delete');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Delete MCP server "${item.server.name}"?`,
        { modal: true },
        'Delete'
      );

      if (confirm !== 'Delete') {
        return;
      }

      try {
        removeGlobalMCPServer(item.server.name);
        vscode.window.showInformationMessage(`MCP server "${item.server.name}" deleted`);
        treeProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to delete MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.testMcpServer', async (item: MCPServerItem) => {
      if (!item || !(item instanceof MCPServerItem)) {
        vscode.window.showErrorMessage('Please select an MCP server to test');
        return;
      }

      vscode.window.showInformationMessage(
        `Testing MCP server "${item.server.name}"... (Not implemented yet)`
      );
    })
  );
}
