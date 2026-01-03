import * as vscode from 'vscode';
import type { AssistantType, MCPServerConfig } from '../../providers/types.js';

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
    public readonly lastSync?: string
  ) {
    super(
      isConnected ? 'Connected to GitHub' : 'GitHub Not Connected',
      vscode.TreeItemCollapsibleState.None,
      isConnected ? 'syncStatus-connected' : 'syncStatus-disconnected'
    );

    this.iconPath = new vscode.ThemeIcon('github-inverted', isConnected ? new vscode.ThemeColor('testing.iconPassed') : undefined);
    this.description = isConnected ? 'Active Account' : 'Click to connect';
    this.tooltip = isConnected ? 'You are logged in to GitHub' : 'Connect to GitHub to manage remote environments';
  }
}

export class LocalGroupItem extends BaseTreeItem {
  constructor() {
    super('Local Environment', vscode.TreeItemCollapsibleState.Expanded, 'localGroup');
    this.iconPath = new vscode.ThemeIcon('device-desktop');
    this.tooltip = 'Local AI assistant configurations and MCP servers';
  }
}

export class RemoteEnvironmentItem extends BaseTreeItem {
  constructor(
    public readonly gistId: string,
    public readonly name: string,
    public readonly updatedAt: string
  ) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed, 'remoteEnvironment');
    this.iconPath = new vscode.ThemeIcon('cloud');
    const date = new Date(updatedAt).toLocaleString();
    this.description = `Updated: ${date}`;
    this.tooltip = `Remote environment stored in Gist: ${gistId}\nUpdated: ${updatedAt}`;
    this.contextValue = 'remoteEnvironment';
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
      isInstalled ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      'assistant'
    );

    this.iconPath = new vscode.ThemeIcon(this.getIcon());
    this.description = isInstalled ? configPath : '(not installed)';
  }

  private getIcon(): string {
    switch (this.providerId) {
      case 'claude-code': return 'hubot';
      case 'opencode': return 'terminal';
      case 'codex': return 'code';
      default: return 'symbol-misc';
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
      case 'settings': return 'settings-gear';
      case 'plugins': return 'extensions';
      case 'mcpServers': return 'server';
      case 'commands': return 'terminal';
      case 'agents': return 'person';
      case 'skills':
      case 'rules': return 'lightbulb';
      default: return 'folder';
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
  }
}

export class MCPServerItem extends BaseTreeItem {
  constructor(
    public readonly server: MCPServerConfig,
    public readonly source: 'global' | AssistantType | 'remote'
  ) {
    super(server.name, vscode.TreeItemCollapsibleState.None, 'mcpServer');
    this.iconPath = new vscode.ThemeIcon(this.getIcon());
    this.description = server.type;
    this.tooltip = `Type: ${server.type}${server.url ? '\nURL: ' + server.url : ''}`;
  }

  private getIcon(): string {
    if (this.server.enabled === false) return 'circle-slash';
    switch (this.server.type) {
      case 'stdio': return 'terminal';
      case 'http': return 'globe';
      case 'sse': return 'broadcast';
      default: return 'server';
    }
  }
}

export class RemoteProviderItem extends BaseTreeItem {
  constructor(
    public readonly gistId: string,
    public readonly providerId: AssistantType,
    public readonly fileCount: number
  ) {
    super(
      providerId === 'opencode' ? 'OpenCode' : 'Claude Code',
      vscode.TreeItemCollapsibleState.Collapsed,
      'remoteProvider'
    );
    this.description = `${fileCount} files`;
    this.iconPath = new vscode.ThemeIcon(providerId === 'opencode' ? 'terminal' : 'hubot');
  }
}

export class RemoteMCPGroupItem extends BaseTreeItem {
  constructor(
    public readonly gistId: string,
    public readonly serverCount: number
  ) {
    super(
      'MCP Servers (Remote)',
      serverCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      'remoteMcpGroup'
    );
    this.iconPath = new vscode.ThemeIcon('server');
    this.description = `(${serverCount})`;
  }
}

export class RemoteCategoryItem extends BaseTreeItem {
  constructor(
    public readonly gistId: string,
    label: string,
    public readonly category: 'settings' | 'skills' | 'rules' | 'commands' | 'agents' | 'plugins',
    public readonly providerId: AssistantType,
    public readonly itemCount: number
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed, 'remoteCategory');
    this.description = `${itemCount}`;
    this.iconPath = new vscode.ThemeIcon(this.getIcon());
  }

  private getIcon(): string {
    switch (this.category) {
      case 'settings': return 'settings-gear';
      case 'plugins': return 'extensions';
      case 'commands': return 'terminal';
      case 'agents': return 'person';
      case 'skills':
      case 'rules': return 'lightbulb';
      default: return 'folder';
    }
  }
}

export class RemoteFolderItem extends BaseTreeItem {
  constructor(
    public readonly gistId: string,
    public readonly folderName: string,
    public readonly folderPath: string,
    public readonly providerId: AssistantType,
    public readonly category: 'skills' | 'rules' | 'commands' | 'agents'
  ) {
    super(folderName, vscode.TreeItemCollapsibleState.Collapsed, 'remoteFolder');
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

export class RemoteFileItem extends BaseTreeItem {
  constructor(
    public readonly fileName: string,
    public readonly relativePath: string,
    public readonly providerId: AssistantType
  ) {
    super(fileName, vscode.TreeItemCollapsibleState.None, 'remoteFile');
    this.iconPath = new vscode.ThemeIcon('file-code');
    this.tooltip = relativePath;
  }
}

export class SettingsItem extends BaseTreeItem {
  constructor(public readonly fileName: string, public readonly filePath: string, public readonly providerId: AssistantType) {
    super(fileName, vscode.TreeItemCollapsibleState.None, 'settings');
    this.iconPath = new vscode.ThemeIcon('json');
    this.command = { command: 'codingAgentSync.openInEditor', title: 'Open', arguments: [filePath] };
  }
}

export class PluginConfigItem extends BaseTreeItem {
  constructor(public readonly fileName: string, public readonly filePath: string, public readonly pluginName: string) {
    super(pluginName, vscode.TreeItemCollapsibleState.None, 'pluginConfig');
    this.iconPath = new vscode.ThemeIcon('extensions');
    this.description = fileName;
    this.command = { command: 'codingAgentSync.openInEditor', title: 'Open', arguments: [filePath] };
  }
}

export class SkillFolderItem extends BaseTreeItem {
  constructor(public readonly folderName: string, public readonly folderPath: string, public readonly fileCount: number, public readonly providerId: AssistantType) {
    super(folderName, vscode.TreeItemCollapsibleState.Collapsed, 'skillFolder');
    this.iconPath = new vscode.ThemeIcon('folder');
    this.description = `${fileCount} files`;
  }
}

export class SkillItem extends BaseTreeItem {
  constructor(public readonly name: string, public readonly filePath: string, public readonly fileType: 'command' | 'agent' | 'skill' | 'rule', public readonly providerId: AssistantType) {
    super(name, vscode.TreeItemCollapsibleState.None, 'skill');
    this.iconPath = new vscode.ThemeIcon(this.getIcon());
    this.command = { command: 'codingAgentSync.openInEditor', title: 'Open', arguments: [filePath] };
  }
  private getIcon(): string {
    switch (this.fileType) {
      case 'command': return 'terminal';
      case 'agent': return 'person';
      case 'skill':
      case 'rule': return 'lightbulb';
      default: return 'file';
    }
  }
}

export class ProjectConfigItem extends BaseTreeItem {
  constructor(public readonly workspacePath: string, public readonly configCount: number) {
    super('Project Config (Workspace)', configCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, 'projectConfig');
    this.iconPath = new vscode.ThemeIcon('root-folder');
    this.description = `${configCount} files`;
  }
}

export class ProjectFileItem extends BaseTreeItem {
  constructor(public readonly name: string, public readonly filePath: string, public readonly fileType: string) {
    super(name, fileType.endsWith('-dir') ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, 'projectFile');
    this.iconPath = new vscode.ThemeIcon(fileType.endsWith('-dir') ? 'folder' : fileType === 'mcp-json' ? 'server' : 'book');
    if (!fileType.endsWith('-dir')) {
      this.command = { command: 'codingAgentSync.openInEditor', title: 'Open', arguments: [filePath] };
    }
  }
}

export class EmptyItem extends BaseTreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None, 'empty');
    this.iconPath = new vscode.ThemeIcon('info');
  }
}
