import * as vscode from 'vscode';
import * as path from 'path';
import { homedir } from 'os';
import { existsSync, readdirSync, statSync } from 'fs';
import {
  BaseTreeItem,
  SyncStatusItem,
  GlobalMCPItem,
  AssistantItem,
  CategoryItem,
  SettingsItem,
  PluginConfigItem,
  MCPServerItem,
  SkillFolderItem,
  SkillItem,
  ProjectConfigItem,
  ProjectFileItem,
  RemoteProviderItem,
  RemoteCategoryItem,
  RemoteFolderItem,
  RemoteFileItem,
  EmptyItem,
} from './TreeItems';
import { getInstalledProviders, initializeProviders } from '../../providers/registry';
import { getGlobalMCPServers } from '../../providers/mcp';
import type { AssistantProvider, AssistantType, SyncPayload } from '../../providers/types';
import { isPayloadV2 } from '../../providers/types';
import { loadAuth } from '../../storage/auth';
import { loadSyncState, formatLastSync } from '../../storage/state';
import { getGist } from '../../core/gist';
import { decryptObject } from '../../core/crypto';

type TreeItem = BaseTreeItem | vscode.TreeItem;

interface SkillFolder {
  name: string;
  path: string;
  files: string[];
}

export class ConfigTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private providers: AssistantProvider[] = [];
  private initialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    await initializeProviders();
    this.providers = await getInstalledProviders();
    this.initialized = true;
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this.initialize();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!this.initialized) {
      return [];
    }

    if (!element) {
      return this.getRootItems();
    }

    if (element instanceof SyncStatusItem) {
      return this.getRemoteGistChildren();
    }

    if (element instanceof RemoteProviderItem) {
      return this.getRemoteProviderChildren(element);
    }

    if (element instanceof RemoteCategoryItem) {
      return this.getRemoteCategoryChildren(element);
    }

    if (element instanceof RemoteFolderItem) {
      return this.getRemoteFolderChildren(element);
    }

    if (element instanceof GlobalMCPItem) {
      return this.getGlobalMCPChildren();
    }

    if (element instanceof AssistantItem) {
      return this.getAssistantChildren(element.providerId);
    }

    if (element instanceof CategoryItem) {
      return this.getCategoryChildren(element.providerId, element.category);
    }

    if (element instanceof SkillFolderItem) {
      return this.getSkillFolderChildren(element);
    }

    if (element instanceof ProjectConfigItem) {
      return this.getProjectConfigChildren(element.workspacePath);
    }

    return [];
  }

  private async getRootItems(): Promise<TreeItem[]> {
    const items: TreeItem[] = [];

    const auth = loadAuth();
    const syncState = loadSyncState();
    items.push(
      new SyncStatusItem(
        !!auth?.gistId,
        auth?.gistId,
        syncState.lastSync ? formatLastSync() : undefined
      )
    );

    const globalMcpServers = getGlobalMCPServers();
    items.push(new GlobalMCPItem(globalMcpServers.length));

    const config = vscode.workspace.getConfiguration('codingAgentSync');
    const enabledProviders = config.get<string[]>('enabledProviders') || ['claude-code', 'opencode'];

    for (const provider of this.providers) {
      if (enabledProviders.includes(provider.id)) {
        const isInstalled = await provider.isInstalled();
        const configPath = provider.id === 'claude-code' ? '~/.claude/' : '~/.config/opencode/';
        items.push(new AssistantItem(provider.id, provider.name, isInstalled, configPath));
      }
    }

    const workspacePath = this.getWorkspacePath();
    if (workspacePath) {
      const projectConfigs = this.detectProjectConfigs(workspacePath);
      items.push(new ProjectConfigItem(workspacePath, projectConfigs.length));
    }

    return items;
  }

  private getGlobalMCPChildren(): TreeItem[] {
    const servers = getGlobalMCPServers();
    if (servers.length === 0) {
      return [new EmptyItem('No MCP servers in ~/.mcp.json')];
    }
    return servers.map((server) => new MCPServerItem(server, 'global'));
  }

  private async getAssistantChildren(providerId: AssistantType): Promise<TreeItem[]> {
    const provider = this.providers.find((p) => p.id === providerId);
    if (!provider) {
      return [new EmptyItem('Provider not found')];
    }

    const isInstalled = await provider.isInstalled();
    if (!isInstalled) {
      return [new EmptyItem('Not installed')];
    }

    const items: TreeItem[] = [];

    const settingsFiles = this.getSettingsFiles(provider);
    items.push(new CategoryItem('Settings', 'settings', providerId, settingsFiles.length));

    if (providerId === 'opencode') {
      const pluginConfigs = (provider as any).getPluginConfigs?.() || [];
      if (pluginConfigs.length > 0) {
        items.push(new CategoryItem('Plugins', 'plugins', providerId, pluginConfigs.length));
      }
    }

    const commands = this.getFilesInCategory(provider, 'commands');
    if (commands.length > 0 || providerId === 'claude-code') {
      items.push(new CategoryItem('Commands', 'commands', providerId, commands.length));
    }

    const agents = this.getFilesInCategory(provider, 'agents');
    if (agents.length > 0 || providerId === 'opencode') {
      items.push(new CategoryItem('Agents', 'agents', providerId, agents.length));
    }

    const skillsLabel = providerId === 'claude-code' ? 'Rules' : 'Skills';
    const skillsCategory = providerId === 'claude-code' ? 'rules' : 'skills';
    const skillFolders = this.getSkillFolders(provider);
    items.push(new CategoryItem(skillsLabel, skillsCategory as 'skills' | 'rules', providerId, skillFolders.length));

    return items;
  }

  private async getCategoryChildren(
    providerId: AssistantType,
    category: 'settings' | 'plugins' | 'mcpServers' | 'commands' | 'agents' | 'skills' | 'rules'
  ): Promise<TreeItem[]> {
    const provider = this.providers.find((p) => p.id === providerId);
    if (!provider) {
      return [];
    }

    switch (category) {
      case 'settings':
        return this.getSettingsItems(provider);
      case 'plugins':
        return this.getPluginItems(provider);
      case 'mcpServers':
        return this.getMcpServerItems(provider);
      case 'commands':
      case 'agents':
        return this.getSkillItems(provider, category);
      case 'skills':
      case 'rules':
        return this.getSkillFolderItems(provider);
      default:
        return [];
    }
  }

  private getSettingsFiles(provider: AssistantProvider): string[] {
    const files: string[] = [];
    for (const pattern of provider.patterns.mainConfig) {
      const filePath = path.join(provider.configDir, pattern);
      if (existsSync(filePath)) {
        files.push(pattern);
      }
    }
    return files;
  }

  private getSettingsItems(provider: AssistantProvider): TreeItem[] {
    const items: TreeItem[] = [];
    for (const pattern of provider.patterns.mainConfig) {
      const filePath = path.join(provider.configDir, pattern);
      if (existsSync(filePath)) {
        items.push(new SettingsItem(pattern, filePath, provider.id));
      }
    }

    if (provider.id === 'claude-code') {
      const claudeJson = path.join(homedir(), '.claude.json');
      if (existsSync(claudeJson)) {
        items.push(new SettingsItem('.claude.json', claudeJson, provider.id));
      }
    }

    if (items.length === 0) {
      return [new EmptyItem('No settings files')];
    }
    return items;
  }

  private getPluginItems(provider: AssistantProvider): TreeItem[] {
    const pluginConfigs = (provider as any).getPluginConfigs?.() || [];
    if (pluginConfigs.length === 0) {
      return [new EmptyItem('No plugin configs')];
    }
    return pluginConfigs.map((cfg: { fileName: string; pluginName: string; filePath: string }) =>
      new PluginConfigItem(cfg.fileName, cfg.filePath, cfg.pluginName)
    );
  }

  private async getMcpServerItems(provider: AssistantProvider): Promise<TreeItem[]> {
    const servers = getGlobalMCPServers();
    if (servers.length === 0) {
      return [new EmptyItem('No MCP servers configured')];
    }
    return servers.map((server) => new MCPServerItem(server, provider.id));
  }

  private getSkillFolders(provider: AssistantProvider): SkillFolder[] {
    const pattern = provider.patterns.skills;
    const dir = pattern.split('/')[0];
    const fullDir = path.join(provider.configDir, dir);

    if (!existsSync(fullDir)) {
      return [];
    }

    const folders: SkillFolder[] = [];
    try {
      const entries = readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const folderPath = path.join(fullDir, entry.name);
          const files = this.getFilesRecursive(folderPath);
          folders.push({
            name: entry.name,
            path: folderPath,
            files,
          });
        }
      }
    } catch {
      // Ignore
    }
    return folders;
  }

  private getSkillFolderItems(provider: AssistantProvider): TreeItem[] {
    const folders = this.getSkillFolders(provider);
    if (folders.length === 0) {
      return [new EmptyItem('No skills')];
    }
    return folders.map((folder) =>
      new SkillFolderItem(folder.name, folder.path, folder.files.length, provider.id)
    );
  }

  private getSkillFolderChildren(folder: SkillFolderItem): TreeItem[] {
    const files = this.getFilesRecursive(folder.folderPath);
    if (files.length === 0) {
      return [new EmptyItem('Empty folder')];
    }
    return files.map((filePath) => {
      const name = path.basename(filePath);
      return new SkillItem(name, filePath, 'skill', folder.providerId);
    });
  }

  private getFilesInCategory(
    provider: AssistantProvider,
    category: 'commands' | 'agents'
  ): string[] {
    let pattern: string;
    switch (category) {
      case 'commands':
        pattern = provider.patterns.commands;
        break;
      case 'agents':
        pattern = provider.patterns.agents;
        break;
      default:
        return [];
    }

    const dir = pattern.split('/')[0];
    const fullDir = path.join(provider.configDir, dir);

    if (!existsSync(fullDir)) {
      return [];
    }

    try {
      return this.getFilesRecursive(fullDir);
    } catch {
      return [];
    }
  }

  private getFilesRecursive(dir: string): string[] {
    const files: string[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...this.getFilesRecursive(fullPath));
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore
    }
    return files;
  }

  private getSkillItems(
    provider: AssistantProvider,
    category: 'commands' | 'agents'
  ): TreeItem[] {
    const files = this.getFilesInCategory(provider, category);
    if (files.length === 0) {
      return [new EmptyItem(`No ${category}`)];
    }

    return files.map((filePath) => {
      const name = path.basename(filePath, path.extname(filePath));
      const fileType = category.slice(0, -1) as 'command' | 'agent';
      return new SkillItem(name, filePath, fileType, provider.id);
    });
  }

  private getWorkspacePath(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return folders[0].uri.fsPath;
    }
    return undefined;
  }

  private detectProjectConfigs(workspacePath: string): string[] {
    const configs: string[] = [];
    const checks = [
      { name: '.claude', type: 'dir' },
      { name: '.opencode', type: 'dir' },
      { name: '.mcp.json', type: 'file' },
      { name: 'CLAUDE.md', type: 'file' },
      { name: 'AGENTS.md', type: 'file' },
    ];

    for (const check of checks) {
      const fullPath = path.join(workspacePath, check.name);
      if (existsSync(fullPath)) {
        try {
          const stat = statSync(fullPath);
          if ((check.type === 'dir' && stat.isDirectory()) || (check.type === 'file' && stat.isFile())) {
            configs.push(check.name);
          }
        } catch {
          // Ignore
        }
      }
    }
    return configs;
  }

  private getProjectConfigChildren(workspacePath: string): TreeItem[] {
    const items: TreeItem[] = [];

    const claudeDir = path.join(workspacePath, '.claude');
    if (existsSync(claudeDir) && statSync(claudeDir).isDirectory()) {
      items.push(new ProjectFileItem('.claude/', claudeDir, 'claude-dir'));
    }

    const opencodeDir = path.join(workspacePath, '.opencode');
    if (existsSync(opencodeDir) && statSync(opencodeDir).isDirectory()) {
      items.push(new ProjectFileItem('.opencode/', opencodeDir, 'opencode-dir'));
    }

    const mcpJson = path.join(workspacePath, '.mcp.json');
    if (existsSync(mcpJson) && statSync(mcpJson).isFile()) {
      items.push(new ProjectFileItem('.mcp.json', mcpJson, 'mcp-json'));
    }

    const claudeMd = path.join(workspacePath, 'CLAUDE.md');
    if (existsSync(claudeMd) && statSync(claudeMd).isFile()) {
      items.push(new ProjectFileItem('CLAUDE.md', claudeMd, 'instructions'));
    }

    const agentsMd = path.join(workspacePath, 'AGENTS.md');
    if (existsSync(agentsMd) && statSync(agentsMd).isFile()) {
      items.push(new ProjectFileItem('AGENTS.md', agentsMd, 'instructions'));
    }

    if (items.length === 0) {
      return [new EmptyItem('No project configs detected')];
    }
    return items;
  }

  private async getRemoteGistChildren(): Promise<TreeItem[]> {
    const auth = loadAuth();
    if (!auth || !auth.gistId || !auth.githubToken) {
      return [];
    }

    try {
      const gist = await getGist(auth.githubToken, auth.gistId);
      const file = gist.files?.['opencodesync.json'];
      if (!file?.content) {
        return [new EmptyItem('No sync data in Gist')];
      }

      const encrypted = JSON.parse(file.content);
      const payload = decryptObject<SyncPayload>(encrypted, auth.passphrase);

      const items: TreeItem[] = [];

      if (isPayloadV2(payload)) {
        for (const [providerId, data] of Object.entries(payload.providers)) {
          if (data && data.files.length > 0) {
            items.push(new RemoteProviderItem(providerId as AssistantType, data.files.length));
          }
        }
      } else {
        if (payload.config.files.length > 0) {
          items.push(new RemoteProviderItem('opencode', payload.config.files.length));
        }
      }

      if (items.length === 0) {
        return [new EmptyItem('Gist is empty')];
      }

      return items;
    } catch (error) {
      return [new EmptyItem(`Error fetching Gist: ${error instanceof Error ? error.message : 'Unknown'}`)];
    }
  }

  private async getRemoteProviderChildren(providerItem: RemoteProviderItem): Promise<TreeItem[]> {
    const auth = loadAuth();
    if (!auth || !auth.gistId || !auth.githubToken) return [];

    try {
      const gist = await getGist(auth.githubToken, auth.gistId);
      const file = gist.files?.['opencodesync.json'];
      if (!file?.content) return [];

      const encrypted = JSON.parse(file.content);
      const payload = decryptObject<SyncPayload>(encrypted, auth.passphrase);

      let files: Array<{ path: string }> = [];
      if (isPayloadV2(payload)) {
        files = payload.providers[providerItem.providerId]?.files || [];
      } else if (providerItem.providerId === 'opencode') {
        files = payload.config.files;
      }

      const items: TreeItem[] = [];
      const categories: Record<string, number> = {};

      for (const f of files) {
        let cat = 'other';
        if (f.path.startsWith('settings.json') || f.path.startsWith('settings.local.json') || f.path.startsWith('opencode.json')) cat = 'settings';
        else if (f.path.startsWith('skill/') || f.path.startsWith('skills/')) cat = 'skills';
        else if (f.path.startsWith('rules/')) cat = 'rules';
        else if (f.path.startsWith('command/')) cat = 'commands';
        else if (f.path.startsWith('agent/')) cat = 'agents';

        categories[cat] = (categories[cat] || 0) + 1;
      }

      if (categories['settings']) items.push(new RemoteCategoryItem('Settings', 'settings', providerItem.providerId, categories['settings']));
      if (categories['skills']) items.push(new RemoteCategoryItem('Skills', 'skills', providerItem.providerId, categories['skills']));
      if (categories['rules']) items.push(new RemoteCategoryItem('Rules', 'rules', providerItem.providerId, categories['rules']));
      if (categories['commands']) items.push(new RemoteCategoryItem('Commands', 'commands', providerItem.providerId, categories['commands']));
      if (categories['agents']) items.push(new RemoteCategoryItem('Agents', 'agents', providerItem.providerId, categories['agents']));

      return items;
    } catch {
      return [];
    }
  }

  private async getRemoteCategoryChildren(categoryItem: RemoteCategoryItem): Promise<TreeItem[]> {
    const auth = loadAuth();
    if (!auth || !auth.gistId || !auth.githubToken) return [];

    try {
      const gist = await getGist(auth.githubToken, auth.gistId);
      const file = gist.files?.['opencodesync.json'];
      if (!file?.content) return [];

      const encrypted = JSON.parse(file.content);
      const payload = decryptObject<SyncPayload>(encrypted, auth.passphrase);

      let files: Array<{ path: string }> = [];
      if (isPayloadV2(payload)) {
        files = payload.providers[categoryItem.providerId]?.files || [];
      } else if (categoryItem.providerId === 'opencode') {
        files = payload.config.files;
      }

      const prefix = this.getPrefixForCategory(categoryItem.category);
      const filtered = files.filter(f => f.path.startsWith(prefix));

      if (categoryItem.category === 'settings') {
        return filtered.map(f => new RemoteFileItem(path.basename(f.path), f.path, categoryItem.providerId));
      }

      // Group by immediate subfolder under prefix
      const folders = new Set<string>();
      const rootFiles: Array<{ path: string }> = [];

      for (const f of filtered) {
        const relative = f.path.slice(prefix.length);
        const parts = relative.split('/');
        if (parts.length > 1) {
          folders.add(parts[0]);
        } else if (parts[0]) {
          rootFiles.push(f);
        }
      }

      const items: TreeItem[] = [];
      for (const folder of folders) {
        items.push(new RemoteFolderItem(folder, prefix + folder + '/', categoryItem.providerId, categoryItem.category));
      }
      for (const f of rootFiles) {
        items.push(new RemoteFileItem(path.basename(f.path), f.path, categoryItem.providerId));
      }

      return items;
    } catch {
      return [];
    }
  }

  private getPrefixForCategory(category: string): string {
    switch (category) {
      case 'settings': return '';
      case 'skills': return 'skill/';
      case 'rules': return 'rules/';
      case 'commands': return 'command/';
      case 'agents': return 'agent/';
      default: return '';
    }
  }

  private async getRemoteFolderChildren(folderItem: RemoteFolderItem): Promise<TreeItem[]> {
    const auth = loadAuth();
    if (!auth || !auth.gistId || !auth.githubToken) return [];

    try {
      const gist = await getGist(auth.githubToken, auth.gistId);
      const file = gist.files?.['opencodesync.json'];
      if (!file?.content) return [];

      const encrypted = JSON.parse(file.content);
      const payload = decryptObject<SyncPayload>(encrypted, auth.passphrase);

      let files: Array<{ path: string }> = [];
      if (isPayloadV2(payload)) {
        files = payload.providers[folderItem.providerId]?.files || [];
      } else if (folderItem.providerId === 'opencode') {
        files = payload.config.files;
      }

      const prefix = folderItem.folderPath;
      const filtered = files.filter(f => f.path.startsWith(prefix));

      const folders = new Set<string>();
      const rootFiles: Array<{ path: string }> = [];

      for (const f of filtered) {
        const relative = f.path.slice(prefix.length);
        const parts = relative.split('/');
        if (parts.length > 1) {
          folders.add(parts[0]);
        } else if (parts[0]) {
          rootFiles.push(f);
        }
      }

      const items: TreeItem[] = [];
      for (const folder of folders) {
        items.push(new RemoteFolderItem(folder, prefix + folder + '/', folderItem.providerId, folderItem.category));
      }
      for (const f of rootFiles) {
        items.push(new RemoteFileItem(path.basename(f.path), f.path, folderItem.providerId));
      }

      return items;
    } catch {
      return [];
    }
  }
}
