import * as vscode from 'vscode';
import type { ConfigTreeProvider } from '../views/TreeProvider.js';
import { loadAuth, saveAuth, clearAuth } from '../../storage/auth.js';
import { collectFromProviders } from '../../core/collector.js';
import { encryptObject, decryptObject } from '../../core/crypto.js';
import { createGist, updateGist, getGist, validateToken, listSyncGists } from '../../core/gist.js';
import { recordSync } from '../../storage/state.js';
import { loadContexts, getContextsHash, saveContexts } from '../../storage/contexts.js';
import { getProvider, initializeProviders } from '../../providers/registry.js';
import { getGlobalMCPServers } from '../../providers/mcp.js';
import type { SyncPayload, SyncPayloadV2 } from '../../providers/types.js';
import { isPayloadV2 } from '../../providers/types.js';
import { RemoteEnvironmentItem } from '../views/TreeItems.js';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Remote Content Provider for Diff View
 */
class RemoteContentProvider implements vscode.TextDocumentContentProvider {
  static scheme = 'coding-agent-sync-remote';
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;
  private contentCache = new Map<string, string>();

  setContent(uri: vscode.Uri, content: string) {
    this.contentCache.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contentCache.get(uri.toString()) || '';
  }
}

const remoteProvider = new RemoteContentProvider();

export function registerSyncCommands(
  context: vscode.ExtensionContext,
  treeProvider: ConfigTreeProvider
): void {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(RemoteContentProvider.scheme, remoteProvider)
  );

  // Connect to GitHub
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.connect', async () => {
      const token = await vscode.window.showInputBox({
        prompt: 'Enter your GitHub Personal Access Token',
        placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.length < 10) {
            return 'Please enter a valid GitHub token';
          }
          return null;
        },
      });

      if (!token) return;

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Validating GitHub token...',
          },
          async () => {
            const valid = await validateToken(token);
            if (!valid) throw new Error('Invalid token permissions');
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Invalid token: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        return;
      }

      const passphrase = await vscode.window.showInputBox({
        prompt: 'Enter your encryption passphrase',
        placeHolder: 'Your secret passphrase',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.length < 8) {
            return 'Passphrase must be at least 8 characters';
          }
          return null;
        },
      });

      if (!passphrase) return;

      saveAuth({
        githubToken: token,
        passphrase,
      });

      vscode.window.showInformationMessage('Connected to GitHub successfully!');
      treeProvider.refresh();
    })
  );

  // Disconnect
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.disconnect', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Disconnect from GitHub? Your sync settings will be removed.',
        { modal: true },
        'Disconnect'
      );

      if (confirm === 'Disconnect') {
        clearAuth();
        vscode.window.showInformationMessage('Disconnected from GitHub');
        treeProvider.refresh();
      }
    })
  );

  // Unified Push command (from Title bar or Menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.push', async () => {
      const auth = loadAuth();
      if (!auth?.githubToken) {
        vscode.window.showErrorMessage('Not connected. Please connect to GitHub first.');
        return;
      }

      const gists = await listSyncGists(auth.githubToken);
      const items: (vscode.QuickPickItem & { gistId?: string })[] = [
        { label: '$(add) Create New Environment...', alwaysShow: true, detail: 'Create a new private Gist for this sync state' },
        ...gists.map(g => ({
          label: g.description.split(':').pop()?.trim() || 'Unnamed',
          detail: `Gist ID: ${g.id}`,
          description: `Updated: ${new Date(g.updatedAt).toLocaleString()}`,
          gistId: g.id
        }))
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select target remote environment'
      });

      if (!selected) return;

      let targetGistId = selected.gistId;
      let environmentName = selected.label;

      if (!targetGistId) {
        const name = await vscode.window.showInputBox({
          prompt: 'Enter environment name',
          placeHolder: 'e.g. Work, Home, MacBook-Pro',
          validateInput: (v) => !v ? 'Name is required' : null
        });
        if (!name) return;
        environmentName = name;
      }

      await performPush(auth, targetGistId, environmentName, treeProvider);
    })
  );

  // Inline Push (Sync Local -> This Gist)
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.pushToGist', async (item: RemoteEnvironmentItem) => {
      const auth = loadAuth();
      if (!auth?.githubToken) return;
      await performPush(auth, item.gistId, item.name, treeProvider);
    })
  );

  // Inline Pull (Sync This Gist -> Local)
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.pullFromGist', async (item: RemoteEnvironmentItem) => {
      const auth = loadAuth();
      if (!auth?.githubToken) return;

      const confirm = await vscode.window.showWarningMessage(
        `Replace local configuration with data from "${item.name}"?`,
        { modal: true },
        'Replace Local'
      );

      if (confirm === 'Replace Local') {
        await performPull(auth, item.gistId, treeProvider);
      }
    })
  );
}

async function performPush(auth: any, gistId: string | undefined, name: string, treeProvider: ConfigTreeProvider) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: gistId ? `Updating environment "${name}"...` : `Creating environment "${name}"...`,
    },
    async () => {
      try {
        const collection = await collectFromProviders({ installedOnly: true });
        const contextsStorage = loadContexts();
        const mcpServers = getGlobalMCPServers();
        const contextsHash = getContextsHash();

        const payload: SyncPayloadV2 = {
          providers: {},
          mcpServers,
          contexts: {
            items: contextsStorage.contexts.map((c) => ({
              id: c.id,
              name: c.name,
              summary: c.summary,
              createdAt: c.createdAt,
              project: c.project,
            })),
            hash: contextsHash,
          },
          meta: {
            version: 2,
            updatedAt: new Date().toISOString(),
            source: process.platform,
          },
        };

        for (const [id, result] of collection.results) {
          payload.providers[id] = {
            files: result.files.map((f) => ({ path: f.relativePath, content: f.content })),
            hash: result.combinedHash,
          };
        }

        const encrypted = encryptObject(payload, auth.passphrase);
        const gistFiles = [{ filename: 'opencodesync.json', content: JSON.stringify(encrypted, null, 2) }];

        let finalGistId = gistId;
        if (gistId) {
          await updateGist(auth.githubToken, gistId, `coding-agent-sync: ${name}`, gistFiles);
        } else {
          const gist = await createGist(auth.githubToken, `coding-agent-sync: ${name}`, gistFiles);
          finalGistId = gist.id;
        }

        recordSync(finalGistId!, collection.combinedHash, contextsHash);
        vscode.window.showInformationMessage(`Push to "${name}" complete!`);
        treeProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Push failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  );
}

interface Conflict {
  name: string;
  localPath: string;
  localContent: string;
  remoteContent: string;
  remoteUri: vscode.Uri;
  localUri: vscode.Uri;
}

async function performPull(auth: any, gistId: string, treeProvider: ConfigTreeProvider) {
  try {
    const gist = await getGist(auth.githubToken, gistId);
    const file = gist.files['coding-agent-sync.json'] || gist.files['opencodesync.json'];
    if (!file?.content) throw new Error('No sync data in Gist');

    const payload = decryptObject<SyncPayload>(JSON.parse(file.content), auth.passphrase);
    await initializeProviders();

    const conflicts: Conflict[] = [];
    const mcpPath = join(homedir(), '.mcp.json');

    // 1. Detect MCP Conflicts
    if (isPayloadV2(payload) && payload.mcpServers) {
      const mcpConfig = { mcpServers: {} as Record<string, any> };
      payload.mcpServers.forEach(s => {
        const { name, ...cfg } = s;
        mcpConfig.mcpServers[name] = cfg;
      });
      const remoteMcpContent = JSON.stringify(mcpConfig, null, 4);
      if (existsSync(mcpPath)) {
        const localMcpContent = readFileSync(mcpPath, 'utf8');
        if (localMcpContent !== remoteMcpContent) {
          const uri = vscode.Uri.parse(`${RemoteContentProvider.scheme}:/.mcp.json?gistId=${gistId}`);
          remoteProvider.setContent(uri, remoteMcpContent);
          conflicts.push({
            name: '.mcp.json',
            localPath: mcpPath,
            localContent: localMcpContent,
            remoteContent: remoteMcpContent,
            remoteUri: uri,
            localUri: vscode.Uri.file(mcpPath)
          });
        }
      }
    }

    // 2. Detect Provider Conflicts
    if (isPayloadV2(payload)) {
      for (const [providerId, data] of Object.entries(payload.providers)) {
        const provider = getProvider(providerId as any);
        if (provider && data) {
          for (const f of data.files) {
            const localFilePath = join(provider.configDir, f.path);
            if (existsSync(localFilePath)) {
              const localContent = readFileSync(localFilePath, 'utf8');
              if (localContent !== f.content) {
                const uri = vscode.Uri.parse(`${RemoteContentProvider.scheme}:${providerId}/${f.path}?gistId=${gistId}`);
                remoteProvider.setContent(uri, f.content);
                conflicts.push({
                  name: `${providerId}/${f.path}`,
                  localPath: localFilePath,
                  localContent: localContent,
                  remoteContent: f.content,
                  remoteUri: uri,
                  localUri: vscode.Uri.file(localFilePath)
                });
              }
            }
          }
        }
      }
    } else {
      const opencode = getProvider('opencode');
      if (opencode) {
        for (const f of payload.config.files) {
          const localFilePath = join(opencode.configDir, f.path);
          if (existsSync(localFilePath)) {
            const localContent = readFileSync(localFilePath, 'utf8');
            if (localContent !== f.content) {
              const uri = vscode.Uri.parse(`${RemoteContentProvider.scheme}:opencode/${f.path}?gistId=${gistId}`);
              remoteProvider.setContent(uri, f.content);
              conflicts.push({
                name: `opencode/${f.path}`,
                localPath: localFilePath,
                localContent: localContent,
                remoteContent: f.content,
                remoteUri: uri,
                localUri: vscode.Uri.file(localFilePath)
              });
            }
          }
        }
      }
    }

    if (conflicts.length > 0) {
      const choice = await vscode.window.showWarningMessage(
        `Conflicts detected in ${conflicts.length} files. Review changes or overwrite all?`,
        { modal: true },
        'Review Changes',
        'Overwrite All'
      );

      if (!choice) return;

      if (choice === 'Review Changes') {
        await reviewConflicts(conflicts, async () => {
          await applyPull(gistId, payload, treeProvider);
        });
        return;
      }
    }

    await applyPull(gistId, payload, treeProvider);

  } catch (error) {
    vscode.window.showErrorMessage(`Pull failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function reviewConflicts(conflicts: Conflict[], onConfirm: () => Promise<void>) {
  const items = conflicts.map(c => ({
    label: c.name,
    description: 'Click to view diff',
    conflict: c
  }));

  const pick = vscode.window.createQuickPick<typeof items[0]>();
  pick.items = items;
  pick.placeholder = 'Select a file to review differences';
  pick.title = 'Conflicting Files';
  pick.buttons = [{ iconPath: new vscode.ThemeIcon('check'), tooltip: 'Confirm and Apply All' }];

  pick.onDidAccept(async () => {
    const selected = pick.selectedItems[0];
    if (selected) {
      await vscode.commands.executeCommand(
        'vscode.diff',
        selected.conflict.localUri,
        selected.conflict.remoteUri,
        `${selected.conflict.name} (Local ↔ Remote)`
      );
    }
  });

  pick.onDidTriggerButton(async () => {
    pick.hide();
    await onConfirm();
  });

  pick.show();
}

async function applyPull(gistId: string, payload: SyncPayload, treeProvider: ConfigTreeProvider) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Applying remote configuration...',
    },
    async () => {
      let fileCount = 0;
      let configHash = '';
      let contextsHash = null;

      if (isPayloadV2(payload)) {
        configHash = ''; 
        contextsHash = payload.contexts.hash;
        
        if (payload.mcpServers) {
          const mcpPath = join(homedir(), '.mcp.json');
          const mcpConfig = { mcpServers: {} as Record<string, any> };
          payload.mcpServers.forEach(s => {
            const cfg: any = { type: s.type };
            if (s.command) cfg.command = s.command;
            if (s.args) cfg.args = s.args;
            if (s.env) cfg.env = s.env;
            if (s.url) cfg.url = s.url;
            if (s.headers) cfg.headers = s.headers;
            if (s.cwd) cfg.cwd = s.cwd;
            if (s.enabled === false) cfg.disabled = true;
            mcpConfig.mcpServers[s.name] = cfg;
          });
          writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 4));
        }

        for (const [id, data] of Object.entries(payload.providers)) {
          const provider = getProvider(id as any);
          if (provider && data) {
            await provider.applyFiles(data.files.map(f => ({ relativePath: f.path, content: f.content, hash: '' })));
            fileCount += data.files.length;
          }
        }

        if (payload.contexts) {
          saveContexts({ contexts: payload.contexts.items.map(c => ({ ...c, size: Buffer.byteLength(c.summary) })), version: 1 });
        }
      } else {
        configHash = payload.config.hash;
        contextsHash = payload.contexts.hash;
        const opencode = getProvider('opencode');
        if (opencode) {
          await opencode.applyFiles(payload.config.files.map(f => ({ relativePath: f.path, content: f.content, hash: '' })));
          fileCount = payload.config.files.length;
        }
        saveContexts({ contexts: payload.contexts.items.map(c => ({ ...c, size: Buffer.byteLength(c.summary) })), version: 1 });
      }

      recordSync(gistId, configHash, contextsHash);
      vscode.window.showInformationMessage('Pull complete! Local environment replaced.');
      treeProvider.refresh();
    }
  );
}
