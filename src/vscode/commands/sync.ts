import * as vscode from 'vscode';
import type { ConfigTreeProvider } from '../views/TreeProvider';
import { loadAuth, saveAuth, clearAuth } from '../../storage/auth';
import { collectFromProviders } from '../../core/collector';
import { encryptObject, decryptObject } from '../../core/crypto';
import { createGist, updateGist, getGist, findSyncGist, validateToken } from '../../core/gist';
import { recordSync } from '../../storage/state';
import { loadContexts, getContextsHash } from '../../storage/contexts';
import type { SyncPayloadV1 } from '../../providers/types';

export function registerSyncCommands(
  context: vscode.ExtensionContext,
  treeProvider: ConfigTreeProvider
): void {
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

      if (!token) {
        return;
      }

      // Validate token
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Validating GitHub token...',
          },
          async () => {
            await validateToken(token);
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Invalid token: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        return;
      }

      // Get passphrase
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

      if (!passphrase) {
        return;
      }

      // Find existing gist
      let gistId: string | undefined;
      try {
        const existingGist = await findSyncGist(token);
        if (existingGist) {
          const choice = await vscode.window.showInformationMessage(
            'Found existing sync gist. Use it?',
            'Yes',
            'Create New'
          );
          if (choice === 'Yes') {
            gistId = existingGist.id;
          }
        }
      } catch {
        // Ignore errors
      }

      // Save auth
      saveAuth({
        githubToken: token,
        passphrase,
        gistId,
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

  // Push
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.push', async () => {
      const auth = loadAuth();
      if (!auth) {
        vscode.window.showErrorMessage('Not connected. Please connect to GitHub first.');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Pushing to GitHub...',
          cancellable: false,
        },
        async (progress) => {
          try {
            progress.report({ message: 'Collecting config files...' });

            // Collect from all providers
            const collection = await collectFromProviders({ installedOnly: true });

            // For now, use v1 format for backward compatibility with OpenCode
            const opencodeResult = collection.results.get('opencode');
            const contextsStorage = loadContexts();
            const contextsHash = getContextsHash();

            const payload: SyncPayloadV1 = {
              config: {
                files: opencodeResult?.files.map((f) => ({
                  path: f.relativePath,
                  content: f.content,
                })) || [],
                hash: opencodeResult?.combinedHash || '',
              },
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
                version: 1,
                updatedAt: new Date().toISOString(),
                source: process.platform,
              },
            };

            progress.report({ message: 'Encrypting...' });
            const encrypted = encryptObject(payload, auth.passphrase);

            progress.report({ message: 'Uploading...' });
            const gistFiles = [
              {
                filename: 'opencodesync.json',
                content: JSON.stringify(encrypted, null, 2),
              },
            ];

            let gistId: string;
            if (auth.gistId) {
              const gist = await updateGist(
                auth.githubToken,
                auth.gistId,
                'opencodesync - OpenCode settings sync',
                gistFiles
              );
              gistId = gist.id;
            } else {
              const gist = await createGist(
                auth.githubToken,
                'opencodesync - OpenCode settings sync',
                gistFiles
              );
              gistId = gist.id;
              saveAuth({ ...auth, gistId });
            }

            recordSync(gistId, opencodeResult?.combinedHash || '', contextsHash);

            const config = vscode.workspace.getConfiguration('codingAgentSync');
            if (config.get<boolean>('showNotifications')) {
              vscode.window.showInformationMessage('Push complete!');
            }

            treeProvider.refresh();
          } catch (error) {
            vscode.window.showErrorMessage(
              `Push failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      );
    })
  );

  // Pull
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.pull', async () => {
      const auth = loadAuth();
      if (!auth || !auth.gistId) {
        vscode.window.showErrorMessage('Not connected or no gist configured.');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Pulling from GitHub...',
          cancellable: false,
        },
        async (progress) => {
          try {
            progress.report({ message: 'Fetching gist...' });
            const gist = await getGist(auth.githubToken, auth.gistId!);

            const file = gist.files?.['opencodesync.json'];
            if (!file?.content) {
              throw new Error('Sync file not found in gist');
            }

            progress.report({ message: 'Decrypting...' });
            const encrypted = JSON.parse(file.content);
            const payload = decryptObject<SyncPayloadV1>(encrypted, auth.passphrase);

            progress.report({ message: 'Applying changes...' });

            // For now, just show what would be applied
            const fileCount = payload.config.files.length;
            const contextCount = payload.contexts.items.length;

            const config = vscode.workspace.getConfiguration('codingAgentSync');
            if (config.get<boolean>('showNotifications')) {
              vscode.window.showInformationMessage(
                `Pull complete! Found ${fileCount} files and ${contextCount} contexts.`
              );
            }

            treeProvider.refresh();
          } catch (error) {
            vscode.window.showErrorMessage(
              `Pull failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      );
    })
  );
}
