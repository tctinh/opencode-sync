import * as vscode from 'vscode';
import type { AssistantType, MCPServerConfig } from '../../providers/types';

export abstract class BaseTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: string
  ) {
    super(label, collapsibleState);
    this.contextValue = itemType;
  }
}

export class SyncStatusItem extends BaseTreeItem {
  constructor(
    public readonly isConnected: boolean,
    public readonly gistId?: string,
    public readonly lastSync?: string
  ) {
    super(
      isConnected ? 'Connected' : 'Not Connected',
      vscode.TreeItemCollapsibleState.None,
      isConnected ? 'syncStatus-connected' : 'syncStatus-disconnected'
    );

    this.iconPath = new vscode.ThemeIcon(isConnected ? 'cloud' : 'cloud-upload');

    if (isConnected && gistId) {
      this.description = `Gist: ${gistId.slice(0, 8)}...`;
      this.tooltip = `Connected to GitHub Gist\nID: ${gistId}\nLast sync: ${lastSync || 'Never'}`;
    } else {
      this.description = 'Click to connect';
      this.tooltip = 'Connect to GitHub to sync your settings';
    }
  }
}

export class GlobalMCPItem extends BaseTreeItem {
  constructor(public readonly serverCount: number) {
    super(
      'MCP Servers',
      serverCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      'globalMcpServers'
    );
    this.iconPath = new vscode.ThemeIcon('server');
    this.description = `~/.mcp.json (${serverCount})`;
    this.tooltip = 'Global MCP servers shared across all assistants';
  }
}

export class AssistantItem extends BaseTreeItem {
  constructor(
    public readonly providerId: AssistantType,
    public readonly providerName: string,
    public readonly isInstalled: boolean,
    public readonly configPath: string
  ) {
    super(
      providerName,
      isInstalled ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
      'assistant'
    );

    this.iconPath = new vscode.ThemeIcon(this.getIcon());
    this.description = isInstalled ? configPath : '(not installed)';
    this.tooltip = isInstalled
      ? `${providerName} configuration\n${configPath}`
      : `${providerName} is not installed on this system`;
  }

  private getIcon(): string {
    switch (this.providerId) {
      case 'claude-code':
        return 'hubot';
      case 'opencode':
        return 'terminal';
      case 'codex':
        return 'code';
      default:
        return 'symbol-misc';
    }
  }
}

export class CategoryItem extends BaseTreeItem {
  constructor(
    label: string,
    public readonly category: 'settings' | 'plugins' | 'mcpServers' | 'commands' | 'agents' | 'skills' | 'rules',
    public readonly providerId: AssistantType,
    public readonly itemCount: number = 0
  ) {
    super(
      label,
      itemCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      category
    );

    this.iconPath = new vscode.ThemeIcon(this.getIcon());
    this.description = itemCount > 0 ? `${itemCount}` : '';
  }

  private getIcon(): string {
    switch (this.category) {
      case 'settings':
        return 'settings-gear';
      case 'plugins':
        return 'extensions';
      case 'mcpServers':
        return 'server';
      case 'commands':
        return 'terminal';
      case 'agents':
        return 'person';
      case 'skills':
      case 'rules':
        return 'lightbulb';
      default:
        return 'folder';
    }
  }
}

export class SettingsItem extends BaseTreeItem {
  constructor(
    public readonly fileName: string,
    public readonly filePath: string,
    public readonly providerId: AssistantType
  ) {
    super(fileName, vscode.TreeItemCollapsibleState.None, 'settings');

    this.iconPath = new vscode.ThemeIcon('json');
    this.tooltip = filePath;
    this.command = {
      command: 'codingAgentSync.openInEditor',
      title: 'Open',
      arguments: [filePath],
    };
  }
}

export class PluginConfigItem extends BaseTreeItem {
  constructor(
    public readonly fileName: string,
    public readonly filePath: string,
    public readonly pluginName: string
  ) {
    super(pluginName, vscode.TreeItemCollapsibleState.None, 'pluginConfig');

    this.iconPath = new vscode.ThemeIcon('extensions');
    this.description = fileName;
    this.tooltip = filePath;
    this.command = {
      command: 'codingAgentSync.openInEditor',
      title: 'Open',
      arguments: [filePath],
    };
  }
}

export class MCPServerItem extends BaseTreeItem {
  constructor(
    public readonly server: MCPServerConfig,
    public readonly source: 'global' | AssistantType
  ) {
    super(server.name, vscode.TreeItemCollapsibleState.None, 'mcpServer');

    this.iconPath = new vscode.ThemeIcon(this.getIcon());
    this.description = server.type;
    this.tooltip = this.buildTooltip();
  }

  private getIcon(): string {
    if (this.server.enabled === false) {
      return 'circle-slash';
    }
    switch (this.server.type) {
      case 'stdio':
        return 'terminal';
      case 'http':
        return 'globe';
      case 'sse':
        return 'broadcast';
      default:
        return 'server';
    }
  }

  private buildTooltip(): string {
    const parts = [`Type: ${this.server.type}`];
    if (this.server.command) {
      parts.push(`Command: ${this.server.command}`);
    }
    if (this.server.url) {
      parts.push(`URL: ${this.server.url}`);
    }
    if (this.server.enabled === false) {
      parts.push('Status: Disabled');
    }
    return parts.join('\n');
  }
}

export class SkillFolderItem extends BaseTreeItem {
  constructor(
    public readonly folderName: string,
    public readonly folderPath: string,
    public readonly fileCount: number,
    public readonly providerId: AssistantType
  ) {
    super(folderName, vscode.TreeItemCollapsibleState.Collapsed, 'skillFolder');

    this.iconPath = new vscode.ThemeIcon('folder');
    this.description = `${fileCount} file${fileCount !== 1 ? 's' : ''}`;
    this.tooltip = folderPath;
  }
}

export class SkillItem extends BaseTreeItem {
  constructor(
    public readonly name: string,
    public readonly filePath: string,
    public readonly fileType: 'command' | 'agent' | 'skill' | 'rule',
    public readonly providerId: AssistantType
  ) {
    super(name, vscode.TreeItemCollapsibleState.None, 'skill');

    this.iconPath = new vscode.ThemeIcon(this.getIcon());
    this.tooltip = filePath;
    this.command = {
      command: 'codingAgentSync.openInEditor',
      title: 'Open',
      arguments: [filePath],
    };
  }

  private getIcon(): string {
    switch (this.fileType) {
      case 'command':
        return 'terminal';
      case 'agent':
        return 'person';
      case 'skill':
      case 'rule':
        return 'lightbulb';
      default:
        return 'file';
    }
  }
}

export class ProjectConfigItem extends BaseTreeItem {
  constructor(public readonly workspacePath: string, public readonly configCount: number) {
    super(
      'Project Config',
      configCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      'projectConfig'
    );
    this.iconPath = new vscode.ThemeIcon('root-folder');
    this.description = configCount > 0 ? `${configCount} found` : 'None detected';
    this.tooltip = `Project-level AI configurations in:\n${workspacePath}`;
  }
}

export class ProjectFileItem extends BaseTreeItem {
  constructor(
    public readonly name: string,
    public readonly filePath: string,
    public readonly fileType: 'claude-dir' | 'opencode-dir' | 'mcp-json' | 'instructions'
  ) {
    super(
      name,
      fileType.endsWith('-dir') ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      'projectFile'
    );

    this.iconPath = new vscode.ThemeIcon(this.getIcon());
    this.tooltip = filePath;

    if (!fileType.endsWith('-dir')) {
      this.command = {
        command: 'codingAgentSync.openInEditor',
        title: 'Open',
        arguments: [filePath],
      };
    }
  }

  private getIcon(): string {
    switch (this.fileType) {
      case 'claude-dir':
      case 'opencode-dir':
        return 'folder';
      case 'mcp-json':
        return 'server';
      case 'instructions':
        return 'book';
      default:
        return 'file';
    }
  }
}

export class LoadingItem extends BaseTreeItem {
  constructor() {
    super('Loading...', vscode.TreeItemCollapsibleState.None, 'loading');
    this.iconPath = new vscode.ThemeIcon('loading~spin');
  }
}

export class ErrorItem extends BaseTreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None, 'error');
    this.iconPath = new vscode.ThemeIcon('error');
  }
}

export class EmptyItem extends BaseTreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None, 'empty');
    this.iconPath = new vscode.ThemeIcon('info');
  }
}
