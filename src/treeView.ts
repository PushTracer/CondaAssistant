import * as vscode from 'vscode';
import { CondaEnvironment } from './utils';
import { CondaManager } from './condaManager';

export class CondaEnvTreeProvider implements vscode.TreeDataProvider<CondaEnvItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<CondaEnvItem | undefined | null> = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<CondaEnvItem | undefined | null> = this._onDidChangeTreeData.event;

  private environments: CondaEnvironment[] = [];
  private condaManager?: CondaManager;

  setCondaManager(mgr: CondaManager) {
    this.condaManager = mgr;
  }

  refresh(envs: CondaEnvironment[]): void {
    this.environments = envs;
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: CondaEnvItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CondaEnvItem): Thenable<CondaEnvItem[]> {
    if (element) {
      if (element.contextValue === 'condaEnv') {
        return this.getEnvDetailItems(element);
      }
      return Promise.resolve([]);
    }
    return Promise.resolve(this.getEnvItems());
  }

  private getEnvItems(): CondaEnvItem[] {
    return this.environments.map(env => {
      const label = env.active ? '✓ ' + env.name : env.name;
      const item = new CondaEnvItem(
        env.name,
        label,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      item.contextValue = 'condaEnv';
      item.description = '';
      item.tooltip = `路径: ${env.path}\n点击展开查看详情（正在加载...）`;
      item.iconPath = env.active
        ? new vscode.ThemeIcon('symbol-ruler', new vscode.ThemeColor('charts.green'))
        : new vscode.ThemeIcon('symbol-ruler');
      return item;
    });
  }

  private async getEnvDetailItems(env: CondaEnvItem): Promise<CondaEnvItem[]> {
    const loadingItem = new CondaEnvItem('loading', '⏳ 正在加载详情...', vscode.TreeItemCollapsibleState.None);
    loadingItem.iconPath = new vscode.ThemeIcon('sync~spin');

    const fullEnv = this.environments.find(e => e.name === env.label.replace('✓ ', ''));
    if (!fullEnv) return [loadingItem];

    if (!fullEnv.pythonVersion && this.condaManager) {
      const enriched = await this.condaManager.enrichEnvironment(fullEnv);
      Object.assign(fullEnv, enriched);
      this._onDidChangeTreeData.fire(env);
    }

    const details = [
      { label: `Python ${fullEnv.pythonVersion || '?'}`, icon: 'symbol-misc' },
      { label: `${fullEnv.packages} 个包`, icon: 'package' },
      { label: `大小: ${fullEnv.size || '?'}`, icon: 'database' },
      { label: `路径: ${fullEnv.path}`, icon: 'folder' },
    ];
    return details.map(d => {
      const item = new CondaEnvItem(d.label, d.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(d.icon);
      return item;
    });
  }
}

export class CondaQuickActionsProvider implements vscode.TreeDataProvider<QuickActionItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<QuickActionItem | undefined | null> = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<QuickActionItem | undefined | null> = this._onDidChangeTreeData.event;

  getTreeItem(element: QuickActionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<QuickActionItem[]> {
    const actions = [
      new QuickActionItem('create', '🔄 AI 环境一键创建', vscode.TreeItemCollapsibleState.None, 'conda-ai.quickCreate', 'wand'),
      new QuickActionItem('health', '🏥 环境健康检查', vscode.TreeItemCollapsibleState.None, 'conda-ai.healthCheck', 'heart'),
      new QuickActionItem('import', '📥 一键恢复环境', vscode.TreeItemCollapsibleState.None, 'conda-ai.importEnvironment', 'cloud-download'),
      new QuickActionItem('interpreter', '🐍 切换解释器', vscode.TreeItemCollapsibleState.None, 'conda-ai.selectInterpreter', 'symbol-misc'),
    ];
    return Promise.resolve(actions);
  }
}

class CondaEnvItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.id = id;
  }
}

class QuickActionItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly commandId: string,
    public readonly icon: string
  ) {
    super(label, collapsibleState);
    this.id = id;
    this.command = {
      command: commandId,
      title: label
    };
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}
