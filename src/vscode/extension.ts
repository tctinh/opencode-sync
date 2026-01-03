import * as vscode from 'vscode';
import { homedir } from 'os';
import { ConfigTreeProvider } from './views/TreeProvider';
import { registerSyncCommands } from './commands/sync';
import { registerMcpCommands } from './commands/mcp';
import { registerSkillCommands } from './commands/skill';
import { initializeProviders } from '../providers/registry';

let treeProvider: ConfigTreeProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    await initializeProviders();

    treeProvider = new ConfigTreeProvider();

    const treeView = vscode.window.createTreeView('codingAgentSyncExplorer', {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
    });
    context.subscriptions.push(treeView);

    context.subscriptions.push(
      vscode.commands.registerCommand('codingAgentSync.refresh', () => {
        treeProvider.refresh();
      })
    );

    registerSyncCommands(context, treeProvider);
    registerMcpCommands(context, treeProvider);
    registerSkillCommands(context, treeProvider);

    const config = vscode.workspace.getConfiguration('codingAgentSync');
    if (config.get<boolean>('autoSync')) {
      setupFileWatcher(context);
    }

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('codingAgentSync.autoSync')) {
          const newConfig = vscode.workspace.getConfiguration('codingAgentSync');
          if (newConfig.get<boolean>('autoSync')) {
            setupFileWatcher(context);
          }
        }
        if (e.affectsConfiguration('codingAgentSync.enabledProviders')) {
          treeProvider.refresh();
        }
      })
    );

    console.log('Coding Agent Sync extension activated');
  } catch (error) {
    console.error('Failed to activate Coding Agent Sync:', error);
    vscode.window.showErrorMessage(`Coding Agent Sync failed to activate: ${error}`);
  }
}

function setupFileWatcher(context: vscode.ExtensionContext): void {
  const home = homedir();

  const claudeWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(home), '.claude/**')
  );

  claudeWatcher.onDidChange(() => treeProvider.refresh());
  claudeWatcher.onDidCreate(() => treeProvider.refresh());
  claudeWatcher.onDidDelete(() => treeProvider.refresh());

  context.subscriptions.push(claudeWatcher);

  const opencodeWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(home), '.config/opencode/**')
  );

  opencodeWatcher.onDidChange(() => treeProvider.refresh());
  opencodeWatcher.onDidCreate(() => treeProvider.refresh());
  opencodeWatcher.onDidDelete(() => treeProvider.refresh());

  context.subscriptions.push(opencodeWatcher);
}

export function deactivate(): void {}
