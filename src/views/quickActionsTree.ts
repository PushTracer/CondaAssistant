import * as vscode from 'vscode';

export class QuickActionsTreeProvider implements vscode.TreeDataProvider<QuickActionItem> {
  private readonly emitter = new vscode.EventEmitter<QuickActionItem | undefined | null>();
  readonly onDidChangeTreeData: vscode.Event<QuickActionItem | undefined | null> = this.emitter.event;

  getTreeItem(element: QuickActionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<QuickActionItem[]> {
    const actions = [
      new QuickActionItem('create', `🔄 ${vscode.l10n.t('AI 环境一键创建')}`, 'conda-assistant.quickCreate', 'new-file'),
      new QuickActionItem('health', `🏥 ${vscode.l10n.t('环境健康检查')}`, 'conda-assistant.healthCheck', 'check'),
      new QuickActionItem('pytest', `🧪 ${vscode.l10n.t('PyTorch 功能测试')}`, 'conda-assistant.pytorchTest', 'beaker'),
      new QuickActionItem('interpreter', `🐍 ${vscode.l10n.t('切换解释器')}`, 'conda-assistant.selectInterpreter', 'symbol-misc'),
    ];
    return Promise.resolve(actions);
  }
}

class QuickActionItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    label: string,
    commandId: string,
    icon: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.id = id;
    this.command = { command: commandId, title: label };
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}
