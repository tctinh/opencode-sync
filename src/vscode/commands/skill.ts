import * as vscode from 'vscode';
import * as path from 'path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import type { ConfigTreeProvider } from '../views/TreeProvider';
import { SkillItem, CategoryItem } from '../views/TreeItems';
import { getProvider } from '../../providers/registry';
import type { AssistantType } from '../../providers/types';

export function registerSkillCommands(
  context: vscode.ExtensionContext,
  treeProvider: ConfigTreeProvider
): void {
  // Create Skill/Command
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.createSkill', async (item?: CategoryItem) => {
      let providerId: AssistantType | undefined;
      let category: 'command' | 'agent' | 'skill' | 'rule' | undefined;

      if (item instanceof CategoryItem) {
        providerId = item.providerId;
        category = item.category === 'commands' ? 'command' :
                   item.category === 'agents' ? 'agent' :
                   item.category === 'rules' ? 'rule' : 'skill';
      } else {
        // Ask user
        providerId = await selectProvider();
        if (!providerId) {
          return;
        }

        const categoryChoice = await vscode.window.showQuickPick([
          { label: 'Command', value: 'command' },
          { label: 'Agent', value: 'agent' },
          { label: providerId === 'claude-code' ? 'Rule' : 'Skill', value: providerId === 'claude-code' ? 'rule' : 'skill' },
        ], { placeHolder: 'Select type' });

        if (!categoryChoice) {
          return;
        }
        category = categoryChoice.value as 'command' | 'agent' | 'skill' | 'rule';
      }

      const provider = getProvider(providerId);
      if (!provider) {
        vscode.window.showErrorMessage('Provider not found');
        return;
      }

      // Get name
      const name = await vscode.window.showInputBox({
        prompt: `Enter ${category} name`,
        placeHolder: 'my-command',
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

      // Determine directory
      let dir: string;
      switch (category) {
        case 'command':
          dir = path.join(provider.configDir, providerId === 'claude-code' ? 'commands' : 'command');
          break;
        case 'agent':
          dir = path.join(provider.configDir, providerId === 'claude-code' ? 'agents' : 'agent');
          break;
        case 'skill':
          dir = path.join(provider.configDir, 'skill');
          break;
        case 'rule':
          dir = path.join(provider.configDir, 'rules');
          break;
        default:
          return;
      }

      // Create directory if needed
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Create file
      const filePath = path.join(dir, `${name}.md`);
      if (existsSync(filePath)) {
        vscode.window.showErrorMessage(`File already exists: ${filePath}`);
        return;
      }

      // Template content
      const template = getTemplate(category, name, providerId);
      writeFileSync(filePath, template, 'utf8');

      // Open in editor
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);

      vscode.window.showInformationMessage(`Created ${category}: ${name}`);
      treeProvider.refresh();
    })
  );

  // Edit Skill/Command
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.editSkill', async (item: SkillItem) => {
      if (!item || !(item instanceof SkillItem)) {
        vscode.window.showErrorMessage('Please select a file to edit');
        return;
      }

      const doc = await vscode.workspace.openTextDocument(item.filePath);
      await vscode.window.showTextDocument(doc);
    })
  );

  // Delete Skill/Command
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.deleteSkill', async (item: SkillItem) => {
      if (!item || !(item instanceof SkillItem)) {
        vscode.window.showErrorMessage('Please select a file to delete');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Delete "${item.name}"?`,
        { modal: true },
        'Delete'
      );

      if (confirm !== 'Delete') {
        return;
      }

      try {
        unlinkSync(item.filePath);
        vscode.window.showInformationMessage(`Deleted: ${item.name}`);
        treeProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    })
  );

  // Open Settings
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.openSettings', async (item: { filePath?: string }) => {
      if (item?.filePath) {
        const doc = await vscode.workspace.openTextDocument(item.filePath);
        await vscode.window.showTextDocument(doc);
      }
    })
  );

  // Open in Editor
  context.subscriptions.push(
    vscode.commands.registerCommand('codingAgentSync.openInEditor', async (filePath: string) => {
      if (filePath && existsSync(filePath)) {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
      }
    })
  );
}

async function selectProvider(): Promise<AssistantType | undefined> {
  const items = [
    { label: 'Claude Code', id: 'claude-code' as AssistantType },
    { label: 'OpenCode', id: 'opencode' as AssistantType },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select AI assistant',
  });

  return selected?.id;
}

function getTemplate(
  category: 'command' | 'agent' | 'skill' | 'rule',
  name: string,
  providerId: AssistantType
): string {
  const title = name.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  switch (category) {
    case 'command':
      if (providerId === 'claude-code') {
        return `# ${title}

A custom command for Claude Code.

## Usage

\`/${name}\`

## Description

Describe what this command does.

## Instructions

Add instructions for Claude to follow when this command is invoked.
`;
      } else {
        return `# ${title}

A custom command for OpenCode.

## Usage

\`/${name}\`

## Instructions

Add instructions for the AI to follow when this command is invoked.
`;
      }

    case 'agent':
      return `# ${title}

A custom agent definition.

## Purpose

Describe the purpose of this agent.

## Capabilities

- Capability 1
- Capability 2

## Instructions

Add specific instructions for this agent.
`;

    case 'skill':
    case 'rule':
      return `# ${title}

A ${category} that provides persistent instructions.

## When to Apply

Describe when this ${category} should be applied.

## Instructions

Add the instructions that should be followed.
`;

    default:
      return `# ${title}\n\nAdd content here.\n`;
  }
}
