import * as vscode from 'vscode';
import { readFileSync, writeFileSync } from 'fs';

/**
 * Skill Editor Panel - WebView for editing markdown-based skills, commands, and agents
 */
export class SkillEditorPanel {
  private static currentPanel: SkillEditorPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private filePath: string | null = null;
  private fileType: 'command' | 'agent' | 'skill' | 'rule' | null = null;
  private hasUnsavedChanges = false;

  private constructor(
    panel: vscode.WebviewPanel,
    _extensionUri: vscode.Uri,
    filePath?: string,
    fileType?: 'command' | 'agent' | 'skill' | 'rule',
    content?: string
  ) {
    this.panel = panel;
    this.filePath = filePath || null;
    this.fileType = fileType || null;

    this.update(content);

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
    filePath?: string,
    fileType?: 'command' | 'agent' | 'skill' | 'rule',
    content?: string
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

    if (SkillEditorPanel.currentPanel) {
      SkillEditorPanel.currentPanel.panel.reveal(column);
      SkillEditorPanel.currentPanel.filePath = filePath || null;
      SkillEditorPanel.currentPanel.fileType = fileType || null;
      SkillEditorPanel.currentPanel.update(content);
      return;
    }

    const title = filePath ? `Edit ${filePath.split('/').pop()}` : 'New Skill';
    const panel = vscode.window.createWebviewPanel(
      'skillEditorPanel',
      title,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    SkillEditorPanel.currentPanel = new SkillEditorPanel(panel, extensionUri, filePath, fileType, content);
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'save':
        await this.saveFile(message.content);
        break;

      case 'cancel':
        if (this.hasUnsavedChanges) {
          const result = await vscode.window.showWarningMessage(
            'You have unsaved changes. Do you want to save before closing?',
            'Save',
            'Discard',
            'Cancel'
          );
          if (result === 'Save') {
            await this.saveFile(message.content);
          } else if (result === 'Discard') {
            this.hasUnsavedChanges = false;
            this.panel.dispose();
          }
        } else {
          this.panel.dispose();
        }
        break;

      case 'change':
        this.hasUnsavedChanges = true;
        break;
    }
  }

  private async saveFile(content: string): Promise<void> {
    if (!this.filePath) {
      vscode.window.showErrorMessage('No file path specified');
      return;
    }

    try {
      writeFileSync(this.filePath, content, 'utf8');
      this.hasUnsavedChanges = false;
      vscode.window.showInformationMessage('File saved successfully');
      vscode.commands.executeCommand('codingAgentSync.refresh');
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private update(content?: string): void {
    this.panel.title = this.filePath ? `Edit ${this.filePath.split('/').pop()}` : 'New Skill';

    let initialContent = content;
    if (!initialContent && this.filePath) {
      try {
        initialContent = readFileSync(this.filePath, 'utf8');
      } catch {
        initialContent = '';
      }
    }

    this.panel.webview.html = this.getHtmlForWebview(initialContent || '');
  }

  private getHtmlForWebview(content: string): string {
    const fileTypeLabel = this.fileType ? {
      'command': 'Command',
      'agent': 'Agent',
      'skill': 'Skill',
      'rule': 'Rule'
    }[this.fileType] : 'Skill';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edit ${fileTypeLabel}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background-color: var(--vscode-editorGroupHeader-tabsBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .toolbar-title {
      font-weight: 500;
      font-size: 14px;
    }

    .unsaved-indicator {
      display: none;
      padding: 2px 8px;
      background-color: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
      border-radius: 3px;
      font-size: 12px;
    }

    .unsaved-indicator.visible {
      display: block;
    }

    .toolbar-right {
      display: flex;
      gap: 8px;
    }

    button {
      padding: 6px 14px;
      border: none;
      border-radius: 3px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }

    button.primary {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    button.primary:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    button.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button.secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .editor-container {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    .sidebar {
      width: 280px;
      border-right: 1px solid var(--vscode-panel-border);
      overflow-y: auto;
      background-color: var(--vscode-sideBar-background);
    }

    .sidebar-section {
      padding: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .sidebar-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }

    .info-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      font-size: 13px;
    }

    .info-icon {
      color: var(--vscode-descriptionForeground);
    }

    .info-value {
      font-family: var(--vscode-editor-font-family);
      color: var(--vscode-foreground);
    }

    .main-editor {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .editor-toolbar {
      display: flex;
      align-items: center;
      padding: 8px 16px;
      background-color: var(--vscode-editorGroupHeader-tabsBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
      gap: 16px;
    }

    .preview-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }

    .editor-area {
      flex: 1;
      overflow: hidden;
      display: flex;
    }

    .markdown-editor,
    .preview {
      flex: 1;
      overflow: auto;
      padding: 16px;
    }

    .markdown-editor {
      display: none;
    }

    .markdown-editor.active {
      display: block;
    }

    .preview {
      background-color: var(--vscode-textCodeBlock-background);
    }

    .preview.hidden {
      display: none;
    }

    textarea {
      width: 100%;
      height: 100%;
      border: none;
      background-color: transparent;
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: var(--vscode-editor-lineHeight);
      resize: none;
      outline: none;
    }

    .preview-content h1 {
      font-size: 2em;
      font-weight: 600;
      margin: 0.67em 0;
      padding-bottom: 0.3em;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .preview-content h2 {
      font-size: 1.5em;
      font-weight: 600;
      margin: 0.83em 0;
      padding-bottom: 0.3em;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .preview-content h3 {
      font-size: 1.25em;
      font-weight: 600;
      margin: 1em 0;
    }

    .preview-content p {
      margin: 1em 0;
      line-height: 1.6;
    }

    .preview-content code {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }

    .preview-content pre {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 1em 0;
    }

    .preview-content pre code {
      background-color: transparent;
      padding: 0;
    }

    .preview-content ul,
    .preview-content ol {
      margin: 1em 0;
      padding-left: 2em;
    }

    .preview-content li {
      margin: 0.5em 0;
    }

    .preview-content blockquote {
      margin: 1em 0;
      padding: 8px 12px;
      border-left: 4px solid var(--vscode-textLink-foreground);
      background-color: var(--vscode-textBlockQuote-background);
    }

    .split-view .markdown-editor,
    .split-view .preview {
      flex: 1;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <span class="toolbar-title">${this.filePath || 'New File'}</span>
      <span class="unsaved-indicator" id="unsavedIndicator">● Unsaved</span>
    </div>
    <div class="toolbar-right">
      <button class="secondary" id="cancelBtn">Cancel</button>
      <button class="primary" id="saveBtn">Save</button>
    </div>
  </div>

  <div class="editor-container">
    <div class="sidebar">
      <div class="sidebar-section">
        <div class="sidebar-title">File Information</div>
        <div class="info-item">
          <span class="info-icon">📁</span>
          <span class="info-value">${this.filePath || 'Unsaved'}</span>
        </div>
        <div class="info-item">
          <span class="info-icon">📝</span>
          <span class="info-value">${fileTypeLabel}</span>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-title">Markdown Tips</div>
        <div class="info-item">
          <span class="info-value"># Headings (H1-H6)</span>
        </div>
        <div class="info-item">
          <span class="info-value">**Bold** or __Bold__</span>
        </div>
        <div class="info-item">
          <span class="info-value">*Italic* or _Italic_</span>
        </div>
        <div class="info-item">
          <span class="info-value">\`code\`</span>
        </div>
        <div class="info-item">
          <span class="info-value">> Blockquote</span>
        </div>
        <div class="info-item">
          <span class="info-value">- List item</span>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-title">Frontmatter (Optional)</div>
        <div class="info-item">
          <span class="info-value">---</span>
        </div>
        <div class="info-item">
          <span class="info-value">name: My Skill</span>
        </div>
        <div class="info-item">
          <span class="info-value">description: Description</span>
        </div>
        <div class="info-item">
          <span class="info-value">---</span>
        </div>
      </div>
    </div>

    <div class="main-editor">
      <div class="editor-toolbar">
        <div class="preview-toggle">
          <label>
            <input type="radio" name="view" value="edit" checked>
            Edit
          </label>
          <label>
            <input type="radio" name="view" value="split">
            Split
          </label>
          <label>
            <input type="radio" name="view" value="preview">
            Preview
          </label>
        </div>
      </div>

      <div class="editor-area">
        <div class="markdown-editor active" id="markdownEditor">
          <textarea id="editor" placeholder="Start typing your markdown content here...">${this.escapeHtml(content)}</textarea>
        </div>
        <div class="preview hidden" id="preview">
          <div class="preview-content" id="previewContent"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const editor = document.getElementById('editor');
    const previewContent = document.getElementById('previewContent');
    const markdownEditor = document.getElementById('markdownEditor');
    const preview = document.getElementById('preview');
    const unsavedIndicator = document.getElementById('unsavedIndicator');
    let hasUnsavedChanges = false;

    // Simple markdown parser
    function parseMarkdown(markdown) {
      let html = markdown;

      // Headers
      html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
      html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
      html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
      html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
      html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
      html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

      // Bold
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

      // Italic
      html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
      html = html.replace(/_(.*?)_/g, '<em>$1</em>');

      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

      html = html.replace(/\`\`\`([\s\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>');
      html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
      html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
      html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
      html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
      html = html.replace(/\n\n/g, '</p><p>');
      html = '<p>' + html + '</p>';
      html = html.replace(/<p><h/g, '<h');
      html = html.replace(/<\/h([1-6])><\/p>/g, '</h$1>');
      html = html.replace(/<p><\/p>/g, '');
      html = html.replace(/\n/g, '<br>');

      return html;
    }

    function updatePreview() {
      previewContent.innerHTML = parseMarkdown(editor.value);
    }

    function toggleView(mode) {
      document.querySelectorAll('input[name="view"]').forEach(input => {
        input.checked = input.value === mode;
      });

      if (mode === 'edit') {
        markdownEditor.style.display = 'block';
        preview.style.display = 'none';
      } else if (mode === 'preview') {
        markdownEditor.style.display = 'none';
        preview.style.display = 'block';
        updatePreview();
      } else if (mode === 'split') {
        markdownEditor.style.display = 'block';
        preview.style.display = 'block';
        updatePreview();
      }
    }

    editor.addEventListener('input', () => {
      hasUnsavedChanges = true;
      unsavedIndicator.classList.add('visible');
      if (preview.style.display !== 'none') {
        updatePreview();
      }
      vscode.postMessage({ type: 'change' });
    });

    document.querySelectorAll('input[name="view"]').forEach(input => {
      input.addEventListener('change', (e) => {
        toggleView(e.target.value);
      });
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'save', content: editor.value });
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel', content: editor.value });
    });

    // Initial preview
    updatePreview();
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  public dispose(): void {
    SkillEditorPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
