import * as vscode from 'vscode';
import * as path from 'path';
import { homedir } from 'os';
import { existsSync, readdirSync, statSync } from 'fs';
import {
  BaseTreeItem,
  SyncStatusItem,
  LocalGroupItem,
  RemoteEnvironmentItem,
  GlobalMCPItem,
  AssistantItem,
  CategoryItem,
  SettingsItem,
  PluginConfigItem,
  MCPServerItem,
  RemoteProviderItem,
  RemoteMCPGroupItem,
  RemoteCategoryItem,
  RemoteFolderItem,
  RemoteFileItem,
  SkillFolderItem,
  SkillItem,
  ProjectConfigItem,
  ProjectFileItem,
  EmptyItem,
} from './TreeItems.js';
import { initializeProviders, getAllProviders } from '../../providers/registry.js';
import { getGlobalMCPServers } from '../../providers/mcp.js';
import { listSyncGists, getGist } from '../../core/gist.js';
import type { AssistantProvider, AssistantType, SyncPayload } from '../../providers/types.js';
import { isPayloadV2 } from '../../providers/types.js';
import { loadAuth } from '../../storage/auth.js';
import { loadSyncState, formatLastSync } from '../../storage/state.js';
import { decryptObject } from '../../core/crypto.js';

type TreeItem = BaseTreeItem | vscode.TreeItem;

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
    this.providers = getAllProviders();
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
    if (!this.initialized) return [];

    if (!element) return this.getRootItems();

    if (element instanceof LocalGroupItem) return this.getLocalEnvironmentItems();
    if (element instanceof AssistantItem) return this.getAssistantChildren(element.providerId);
    if (element instanceof CategoryItem) return this.getCategoryChildren(element.providerId, element.category);
    if (element instanceof SkillFolderItem) return this.getSkillFolderChildren(element);
    if (element instanceof ProjectConfigItem) return this.getProjectConfigChildren(element.workspacePath);

    if (element instanceof RemoteEnvironmentItem) return this.getRemoteEnvironmentChildren(element.gistId);
    if (element instanceof RemoteProviderItem) return this.getRemoteProviderChildren(element);
    if (element instanceof RemoteCategoryItem) return this.getRemoteCategoryChildren(element);
    if (element instanceof RemoteFolderItem) return this.getRemoteFolderChildren(element);
    if (element instanceof RemoteMCPGroupItem) return this.getRemoteMCPChildren(element);

    return [];
  }

  private async getRootItems(): Promise<TreeItem[]> {
    const items: TreeItem[] = [];
    const auth = loadAuth();
    const syncState = loadSyncState();
    
    items.push(new SyncStatusItem(!!auth?.githubToken, syncState.lastSync ? formatLastSync() : undefined));
    items.push(new LocalGroupItem());

    if (auth?.githubToken) {
      try {
        const gists = await listSyncGists(auth.githubToken);
        for (const gist of gists) {
          const name = gist.description.split(':').pop()?.trim() || 'Unnamed Environment';
          items.push(new RemoteEnvironmentItem(gist.id, name, gist.updatedAt));
        }
      } catch {}
    }

    return items;
  }

  private async getLocalEnvironmentItems(): Promise<TreeItem[]> {
    const items: TreeItem[] = [];
    items.push(new GlobalMCPItem(getGlobalMCPServers().length));

    const config = vscode.workspace.getConfiguration('codingAgentSync');
    const enabledProviders = config.get<string[]>('enabledProviders') || ['claude-code', 'opencode', 'codex', 'gemini'];

    for (const provider of this.providers) {
      if (enabledProviders.includes(provider.id)) {
        const isInstalled = await provider.isInstalled();
        let configPath = '';
        switch(provider.id) {
          case 'claude-code': configPath = '~/.claude/'; break;
          case 'opencode': configPath = '~/.config/opencode/'; break;
          case 'codex': configPath = '~/.codex/'; break;
          case 'gemini': configPath = '~/.gemini/'; break;
        }
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

  private async getRemoteEnvironmentChildren(gistId: string): Promise<TreeItem[]> {
    const auth = loadAuth();
    if (!auth?.githubToken) return [];

    try {
      const gist = await getGist(auth.githubToken, gistId);
      const file = gist.files['coding-agent-sync.json'] || gist.files['opencodesync.json'];
      if (!file?.content) return [new EmptyItem('Empty environment')];

      const payload = decryptObject<SyncPayload>(JSON.parse(file.content), auth.passphrase);
      const items: TreeItem[] = [];

      if (isPayloadV2(payload) && payload.mcpServers?.length) {
        items.push(new RemoteMCPGroupItem(gistId, payload.mcpServers.length));
      }

      if (isPayloadV2(payload)) {
        for (const [id, data] of Object.entries(payload.providers)) {
          if (data?.files.length) {
            items.push(new RemoteProviderItem(gistId, id as AssistantType, data.files.length));
          }
        }
      } else if (payload.config.files.length) {
        items.push(new RemoteProviderItem(gistId, 'opencode', payload.config.files.length));
      }

      return items;
    } catch { return [new EmptyItem('Failed to load remote data')]; }
  }

  private async getRemoteMCPChildren(group: RemoteMCPGroupItem): Promise<TreeItem[]> {
    const auth = loadAuth();
    if (!auth?.githubToken) return [];
    try {
      const gist = await getGist(auth.githubToken, group.gistId);
      const file = gist.files['coding-agent-sync.json'] || gist.files['opencodesync.json'];
      if (!file?.content) return [];
      const payload = decryptObject<SyncPayload>(JSON.parse(file.content), auth.passphrase);
      if (isPayloadV2(payload) && payload.mcpServers) {
        return payload.mcpServers.map(s => new MCPServerItem(s, 'remote'));
      }
    } catch {}
    return [];
  }

  private async getAssistantChildren(providerId: AssistantType): Promise<TreeItem[]> {
    const provider = this.providers.find((p) => p.id === providerId);
    if (!provider || !(await provider.isInstalled())) return [];

    const items: TreeItem[] = [];
    items.push(new CategoryItem('Settings', 'settings', providerId, this.getSettingsFiles(provider).length));

    if (providerId === 'opencode') {
      const pluginConfigs = (provider as any).getPluginConfigs?.() || [];
      if (pluginConfigs.length > 0) items.push(new CategoryItem('Plugins', 'plugins', providerId, pluginConfigs.length));
    }

    const commands = this.getFilesInCategory(provider, 'commands');
    if (commands.length > 0 || providerId === 'claude-code') items.push(new CategoryItem('Commands', 'commands', providerId, commands.length));

    const agents = this.getFilesInCategory(provider, 'agents');
    if (agents.length > 0 || providerId === 'opencode') items.push(new CategoryItem('Agents', 'agents', providerId, agents.length));

    const skillFolders = this.getSkillFolders(provider);
    items.push(new CategoryItem(providerId === 'claude-code' ? 'Rules' : 'Skills', providerId === 'claude-code' ? 'rules' : 'skills', providerId, skillFolders.length));

    return items;
  }

  private async getCategoryChildren(providerId: AssistantType, category: any): Promise<TreeItem[]> {
    const provider = this.providers.find((p) => p.id === providerId);
    if (!provider) return [];

    switch (category) {
      case 'settings': return this.getSettingsItems(provider);
      case 'plugins': return this.getPluginItems(provider);
      case 'mcpServers': return this.getMcpServerItems();
      case 'commands':
      case 'agents': return this.getSkillItems(provider, category);
      case 'skills':
      case 'rules': return this.getSkillFolderItems(provider);
      default: return [];
    }
  }

  private getSettingsFiles(provider: AssistantProvider): string[] {
    const files: string[] = [];
    for (const pattern of provider.patterns.mainConfig) {
      if (existsSync(path.join(provider.configDir, pattern))) files.push(pattern);
    }
    return files;
  }

  private getSettingsItems(provider: AssistantProvider): TreeItem[] {
    const items: TreeItem[] = [];
    for (const pattern of provider.patterns.mainConfig) {
      const fullPath = path.join(provider.configDir, pattern);
      if (existsSync(fullPath)) items.push(new SettingsItem(pattern, fullPath, provider.id));
    }
    if (provider.id === 'claude-code') {
      const claudeJson = path.join(homedir(), '.claude.json');
      if (existsSync(claudeJson)) items.push(new SettingsItem('.claude.json', claudeJson, provider.id));
    }
    return items.length > 0 ? items : [new EmptyItem('No settings files')];
  }

  private getPluginItems(provider: AssistantProvider): TreeItem[] {
    const configs = (provider as any).getPluginConfigs?.() || [];
    return configs.length > 0 ? configs.map((cfg: any) => new PluginConfigItem(cfg.fileName, cfg.filePath, cfg.pluginName)) : [new EmptyItem('No plugin configs')];
  }

  private async getMcpServerItems(): Promise<TreeItem[]> {
    const servers = getGlobalMCPServers();
    return servers.length > 0 ? servers.map((server) => new MCPServerItem(server, 'global')) : [new EmptyItem('No MCP servers')];
  }

  private getSkillFolders(provider: AssistantProvider): any[] {
    const dir = provider.patterns.skills.split('/')[0];
    const fullDir = path.join(provider.configDir, dir);
    if (!existsSync(fullDir)) return [];
    const folders: any[] = [];
    try {
      for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const folderPath = path.join(fullDir, entry.name);
          folders.push({ name: entry.name, path: folderPath, files: this.getFilesRecursive(folderPath) });
        }
      }
    } catch {}
    return folders;
  }

  private getSkillFolderItems(provider: AssistantProvider): TreeItem[] {
    const folders = this.getSkillFolders(provider);
    return folders.length > 0 ? folders.map((f) => new SkillFolderItem(f.name, f.path, f.files.length, provider.id)) : [new EmptyItem('No skills')];
  }

  private getSkillFolderChildren(folder: SkillFolderItem): TreeItem[] {
    const files = this.getFilesRecursive(folder.folderPath);
    return files.length > 0 ? files.map((f) => new SkillItem(path.basename(f), f, 'skill', folder.providerId)) : [new EmptyItem('Empty folder')];
  }

  private getFilesInCategory(provider: AssistantProvider, category: string): string[] {
    const dir = (provider.patterns as any)[category]?.split('/')[0];
    if (!dir) return [];
    const fullDir = path.join(provider.configDir, dir);
    return existsSync(fullDir) ? this.getFilesRecursive(fullDir) : [];
  }

  private getFilesRecursive(dir: string): string[] {
    const files: string[] = [];
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...this.getFilesRecursive(fullPath));
        else if (entry.isFile()) files.push(fullPath);
      }
    } catch {}
    return files;
  }

  private getSkillItems(provider: AssistantProvider, category: string): TreeItem[] {
    const files = this.getFilesInCategory(provider, category);
    return files.length > 0 ? files.map((f) => new SkillItem(path.basename(f, path.extname(f)), f, category.slice(0, -1) as any, provider.id)) : [new EmptyItem(`No ${category}`)];
  }

  private getWorkspacePath(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private detectProjectConfigs(workspacePath: string): string[] {
    const configs: string[] = [];
    const checks = [{ name: '.claude', type: 'dir' }, { name: '.opencode', type: 'dir' }, { name: '.mcp.json', type: 'file' }, { name: 'CLAUDE.md', type: 'file' }, { name: 'AGENTS.md', type: 'file' }];
    for (const check of checks) {
      const fullPath = path.join(workspacePath, check.name);
      if (existsSync(fullPath)) {
        try {
          const stat = statSync(fullPath);
          if ((check.type === 'dir' && stat.isDirectory()) || (check.type === 'file' && stat.isFile())) configs.push(check.name);
        } catch {}
      }
    }
    return configs;
  }

  private getProjectConfigChildren(workspacePath: string): TreeItem[] {
    const items: TreeItem[] = [];
    const pushIfExist = (name: string, type: any, label: string) => {
      const fullPath = path.join(workspacePath, name);
      if (existsSync(fullPath)) items.push(new ProjectFileItem(label, fullPath, type));
    };
    pushIfExist('.claude', 'claude-dir', '.claude/');
    pushIfExist('.opencode', 'opencode-dir', '.opencode/');
    pushIfExist('.mcp.json', 'mcp-json', '.mcp.json');
    pushIfExist('CLAUDE.md', 'instructions', 'CLAUDE.md');
    pushIfExist('AGENTS.md', 'instructions', 'AGENTS.md');
    return items.length > 0 ? items : [new EmptyItem('No project configs')];
  }

  private async getRemoteProviderChildren(providerItem: RemoteProviderItem): Promise<TreeItem[]> {
    const auth = loadAuth();
    if (!auth?.githubToken) return [];
    try {
      const gist = await getGist(auth.githubToken, providerItem.gistId);
      const file = gist.files['coding-agent-sync.json'] || gist.files['opencodesync.json'];
      if (!file?.content) return [];
      const payload = decryptObject<SyncPayload>(JSON.parse(file.content), auth.passphrase);
      
      let files: any[] = [];
      if (isPayloadV2(payload)) files = payload.providers[providerItem.providerId]?.files || [];
      else if (providerItem.providerId === 'opencode') files = payload.config.files;

      const items: TreeItem[] = [];
      const categories: Record<string, number> = {};
      files.forEach(f => {
        let cat = 'other';
        if (f.path === 'opencode.json' || f.path === 'settings.json' || f.path === 'settings.local.json' || f.path === '.claude.json') cat = 'settings';
        else if (f.path.startsWith('skill/') || f.path.startsWith('skills/')) cat = 'skills';
        else if (f.path.startsWith('rules/')) cat = 'rules';
        else if (f.path.startsWith('command/')) cat = 'commands';
        else if (f.path.startsWith('agent/')) cat = 'agents';
        else if (f.path.endsWith('.jsonc') || f.path === 'oh-my-opencode.json' || f.path === 'antigravity.json') cat = 'plugins';
        categories[cat] = (categories[cat] || 0) + 1;
      });

      const addCat = (label: string, id: any) => {
        if (categories[id]) items.push(new RemoteCategoryItem(providerItem.gistId, label, id, providerItem.providerId, categories[id]));
      };
      addCat('Settings', 'settings');
      addCat('Plugins', 'plugins');
      addCat(providerItem.providerId === 'claude-code' ? 'Rules' : 'Skills', providerItem.providerId === 'claude-code' ? 'rules' : 'skills');
      addCat('Commands', 'commands');
      addCat('Agents', 'agents');
      return items;
    } catch { return []; }
  }

  private async getRemoteCategoryChildren(categoryItem: RemoteCategoryItem): Promise<TreeItem[]> {
    const auth = loadAuth();
    if (!auth?.githubToken) return [];
    try {
      const gist = await getGist(auth.githubToken, categoryItem.gistId);
      const file = gist.files['coding-agent-sync.json'] || gist.files['opencodesync.json'];
      if (!file?.content) return [];
      const payload = decryptObject<SyncPayload>(JSON.parse(file.content), auth.passphrase);
      let files: any[] = [];
      if (isPayloadV2(payload)) files = payload.providers[categoryItem.providerId]?.files || [];
      else if (categoryItem.providerId === 'opencode') files = payload.config.files;

      const prefix = this.getPrefixForCategory(categoryItem.category);
      const filtered = files.filter(f => {
        if (categoryItem.category === 'settings') return f.path === 'opencode.json' || f.path === 'settings.json' || f.path === 'settings.local.json' || f.path === '.claude.json';
        if (categoryItem.category === 'plugins') return f.path.endsWith('.jsonc') || f.path === 'oh-my-opencode.json' || f.path === 'antigravity.json';
        return f.path.startsWith(prefix);
      });

      if (categoryItem.category === 'settings' || categoryItem.category === 'plugins') {
        return filtered.map(f => new RemoteFileItem(path.basename(f.path), f.path, categoryItem.providerId));
      }

      const folders = new Set<string>();
      const rootFiles: any[] = [];
      filtered.forEach(f => {
        const relative = f.path.slice(prefix.length);
        const parts = relative.split('/');
        if (parts.length > 1) folders.add(parts[0]);
        else if (parts[0]) rootFiles.push(f);
      });

      const items: TreeItem[] = [];
      folders.forEach(f => items.push(new RemoteFolderItem(categoryItem.gistId, f, prefix + f + '/', categoryItem.providerId, categoryItem.category as any)));
      rootFiles.forEach(f => items.push(new RemoteFileItem(path.basename(f.path), f.path, categoryItem.providerId)));
      return items;
    } catch { return []; }
  }

  private getPrefixForCategory(category: string): string {
    return { settings: '', plugins: '', skills: 'skill/', rules: 'rules/', commands: 'command/', agents: 'agent/' }[category] || '';
  }

  private async getRemoteFolderChildren(folderItem: RemoteFolderItem): Promise<TreeItem[]> {
    const auth = loadAuth();
    if (!auth?.githubToken) return [];
    try {
      const gist = await getGist(auth.githubToken, folderItem.gistId);
      const file = gist.files['coding-agent-sync.json'] || gist.files['opencodesync.json'];
      if (!file?.content) return [];
      const payload = decryptObject<SyncPayload>(JSON.parse(file.content), auth.passphrase);
      let files: any[] = [];
      if (isPayloadV2(payload)) files = payload.providers[folderItem.providerId]?.files || [];
      else if (folderItem.providerId === 'opencode') files = payload.config.files;

      const prefix = folderItem.folderPath;
      const filtered = files.filter(f => f.path.startsWith(prefix));
      const folders = new Set<string>();
      const rootFiles: any[] = [];

      filtered.forEach(f => {
        const relative = f.path.slice(prefix.length);
        const parts = relative.split('/');
        if (parts.length > 1) folders.add(parts[0]);
        else if (parts[0]) rootFiles.push(f);
      });

      const items: TreeItem[] = [];
      folders.forEach(f => items.push(new RemoteFolderItem(folderItem.gistId, f, prefix + f + '/', folderItem.providerId, folderItem.category)));
      rootFiles.forEach(f => items.push(new RemoteFileItem(path.basename(f.path), f.path, folderItem.providerId)));
      return items;
    } catch { return []; }
  }
}
