import * as vscode from 'vscode';
import type { MCPServerConfig } from '../../providers/types';
import { getProvider } from '../../providers/registry';

export class MCPServerPanel {
  private static currentPanel: MCPServerPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private serverConfig: MCPServerConfig | null = null;
  private providerId: string | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    _extensionUri: vscode.Uri,
    serverConfig?: MCPServerConfig,
    providerId?: string
  ) {
    this.panel = panel;
    this.serverConfig = serverConfig || null;
    this.providerId = providerId || null;

    this.update();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.onDidChangeViewState(
      () => {
        if (this.panel.visible) {
          this.update();
        }
      },
      null,
      this.disposables
    );

    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    serverConfig?: MCPServerConfig,
    providerId?: string
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

    if (MCPServerPanel.currentPanel) {
      MCPServerPanel.currentPanel.panel.reveal(column);
      MCPServerPanel.currentPanel.serverConfig = serverConfig || null;
      MCPServerPanel.currentPanel.providerId = providerId || null;
      MCPServerPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'mcpServerPanel',
      serverConfig ? `Edit ${serverConfig.name}` : 'Add MCP Server',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    MCPServerPanel.currentPanel = new MCPServerPanel(panel, extensionUri, serverConfig, providerId);
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'save':
        await this.saveServer(message.config);
        break;

      case 'cancel':
        this.panel.dispose();
        break;

      case 'validateUrl':
        await this.validateUrl(message.url);
        break;
    }
  }

  private async saveServer(config: Omit<MCPServerConfig, 'name'> & { name: string }): Promise<void> {
    if (!this.providerId) {
      vscode.window.showErrorMessage('No provider selected');
      return;
    }

    const provider = getProvider(this.providerId as any);
    if (!provider) {
      vscode.window.showErrorMessage('Provider not found');
      return;
    }

    try {
      await provider.setMCPServer(config.name, config);
      vscode.window.showInformationMessage(`MCP server "${config.name}" saved successfully`);
      this.panel.dispose();
      vscode.commands.executeCommand('codingAgentSync.refresh');
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to save MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async validateUrl(url: string): Promise<void> {
    try {
      new URL(url);
      this.panel.webview.postMessage({ type: 'validationResult', valid: true });
    } catch {
      this.panel.webview.postMessage({ type: 'validationResult', valid: false, error: 'Invalid URL' });
    }
  }

  private update(): void {
    this.panel.title = this.serverConfig ? `Edit ${this.serverConfig.name}` : 'Add MCP Server';
    this.panel.webview.html = this.getHtmlForWebview();
  }

  private getHtmlForWebview(): string {
    const config = this.serverConfig;
    const isEdit = !!config;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isEdit ? 'Edit' : 'Add'} MCP Server</title>
  <style>
    body {
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }

    h1 {
      margin-top: 0;
      color: var(--vscode-foreground);
    }

    .form-group {
      margin-bottom: 16px;
    }

    label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: var(--vscode-foreground);
    }

    input[type="text"],
    input[type="password"],
    select,
    textarea {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--vscode-panel-border);
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 14px;
      box-sizing: border-box;
    }

    input:focus,
    select:focus,
    textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .radio-group {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .radio-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .helper-text {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    .error {
      color: var(--vscode-errorForeground);
      font-size: 12px;
      margin-top: 4px;
    }

    .button-group {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }

    button.primary {
      background-color: var(--vscode-button-foreground);
      color: var(--vscode-button-background);
    }

    button.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button:hover {
      opacity: 0.9;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .env-row {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }

    .env-key, .env-value {
      flex: 1;
    }

    #validationResult {
      margin-top: 8px;
      padding: 8px;
      border-radius: 4px;
      display: none;
    }

    #validationResult.success {
      background-color: var(--vscode-testing-iconPassed);
      color: var(--vscode-foreground);
    }

    #validationResult.error {
      background-color: var(--vscode-errorBackground);
      color: var(--vscode-errorForeground);
    }
  </style>
</head>
<body>
  <h1>${isEdit ? 'Edit MCP Server' : 'Add MCP Server'}</h1>

  <form id="mcpForm">
    <div class="form-group">
      <label for="name">Server Name *</label>
      <input type="text" id="name" required value="${config?.name || ''}" placeholder="my-mcp-server">
    </div>

    <div class="form-group">
      <label>Transport Type *</label>
      <div class="radio-group">
        <div class="radio-item">
          <input type="radio" id="type-stdio" name="type" value="stdio" ${config?.type === 'stdio' || !config ? 'checked' : ''}>
          <label for="type-stdio" style="margin: 0;">Command (stdio)</label>
        </div>
        <div class="radio-item">
          <input type="radio" id="type-http" name="type" value="http" ${config?.type === 'http' ? 'checked' : ''}>
          <label for="type-http" style="margin: 0;">HTTP</label>
        </div>
        <div class="radio-item">
          <input type="radio" id="type-sse" name="type" value="sse" ${config?.type === 'sse' ? 'checked' : ''}>
          <label for="type-sse" style="margin: 0;">SSE</label>
        </div>
      </div>
    </div>

    <div id="stdio-fields" style="display: ${config?.type === 'stdio' || !config ? 'block' : 'none'};">
      <div class="form-group">
        <label for="command">Command *</label>
        <input type="text" id="command" ${config?.type === 'stdio' || !config ? 'required' : ''} value="${config?.command || ''}" placeholder="npx -y @modelcontextprotocol/server-filesystem">
        <div class="helper-text">The command to execute. Use 'npx -y' for global packages.</div>
      </div>

      <div class="form-group">
        <label for="args">Arguments</label>
        <input type="text" id="args" value="${config?.args?.join(' ') || ''}" placeholder="/path/to/workspace">
        <div class="helper-text">Space-separated arguments for the command.</div>
      </div>

      <div class="form-group">
        <label for="cwd">Working Directory</label>
        <input type="text" id="cwd" value="${config?.cwd || ''}" placeholder="/home/user/project">
        <div class="helper-text">Directory where the command should run.</div>
      </div>
    </div>

    <div id="http-fields" style="display: ${config?.type === 'http' || config?.type === 'sse' ? 'block' : 'none'};">
      <div class="form-group">
        <label for="url">URL *</label>
        <input type="text" id="url" ${config?.type === 'http' || config?.type === 'sse' ? 'required' : ''} value="${config?.url || ''}" placeholder="http://localhost:8080">
        <div class="helper-text">The HTTP endpoint URL for the MCP server.</div>
        <div id="validationResult"></div>
      </div>

      <div class="form-group">
        <label for="headers">Headers (JSON)</label>
        <textarea id="headers" rows="3" placeholder='{"Authorization": "Bearer token"}'>${config?.headers ? JSON.stringify(config.headers, null, 2) : ''}</textarea>
        <div class="helper-text">HTTP headers to send with requests (JSON format).</div>
      </div>
    </div>

    <div class="form-group">
      <label for="env">Environment Variables (JSON)</label>
      <textarea id="env" rows="3" placeholder='{"API_KEY": "your-key"}'>${config?.env ? JSON.stringify(config.env, null, 2) : ''}</textarea>
      <div class="helper-text">Environment variables to pass to the server (JSON format).</div>
    </div>

    <div class="form-group">
      <div class="checkbox-item">
        <input type="checkbox" id="enabled" ${config?.enabled !== false ? 'checked' : ''}>
        <label for="enabled" style="margin: 0;">Enable this server</label>
      </div>
    </div>

    <div class="button-group">
      <button type="submit" class="primary">${isEdit ? 'Save Changes' : 'Add Server'}</button>
      <button type="button" class="secondary" id="cancel">Cancel</button>
    </div>
  </form>

  <script>
    const vscode = acquireVsCodeApi();

    // Handle transport type changes
    const typeRadios = document.querySelectorAll('input[name="type"]');
    typeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const type = e.target.value;
        document.getElementById('stdio-fields').style.display = type === 'stdio' ? 'block' : 'none';
        document.getElementById('http-fields').style.display = type === 'http' || type === 'sse' ? 'block' : 'none';

        // Update required attributes
        const commandInput = document.getElementById('command');
        const urlInput = document.getElementById('url');
        commandInput.required = type === 'stdio';
        urlInput.required = type === 'http' || type === 'sse';
      });
    });

    // Handle URL validation
    const urlInput = document.getElementById('url');
    urlInput.addEventListener('blur', (e) => {
      if (e.target.value) {
        vscode.postMessage({ type: 'validateUrl', url: e.target.value });
      }
    });

    // Handle validation results
    window.addEventListener('message', (e) => {
      if (e.data.type === 'validationResult') {
        const resultDiv = document.getElementById('validationResult');
        if (e.data.valid) {
          resultDiv.className = 'success';
          resultDiv.textContent = '✓ Valid URL';
        } else {
          resultDiv.className = 'error';
          resultDiv.textContent = '✗ ' + e.data.error;
        }
        resultDiv.style.display = 'block';
      }
    });

    // Handle form submission
    document.getElementById('mcpForm').addEventListener('submit', (e) => {
      e.preventDefault();

      const type = document.querySelector('input[name="type"]:checked').value;
      const config = {
        name: document.getElementById('name').value,
        type: type,
        enabled: document.getElementById('enabled').checked,
      };

      if (type === 'stdio') {
        config.command = document.getElementById('command').value;
        const argsStr = document.getElementById('args').value.trim();
        config.args = argsStr ? argsStr.split(' ') : undefined;
        config.cwd = document.getElementById('cwd').value || undefined;
      } else {
        config.url = document.getElementById('url').value;
        const headersStr = document.getElementById('headers').value.trim();
        try {
          config.headers = headersStr ? JSON.parse(headersStr) : undefined;
        } catch (err) {
          alert('Invalid JSON in headers field');
          return;
        }
      }

      const envStr = document.getElementById('env').value.trim();
      try {
        config.env = envStr ? JSON.parse(envStr) : undefined;
      } catch (err) {
        alert('Invalid JSON in environment variables field');
        return;
      }

      vscode.postMessage({ type: 'save', config });
    });

    // Handle cancel
    document.getElementById('cancel').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });
  </script>
</body>
</html>`;
  }

  /**
   * Dispose of the panel
   */
  public dispose(): void {
    MCPServerPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
