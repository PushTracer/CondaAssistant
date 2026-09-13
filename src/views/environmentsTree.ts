import * as vscode from 'vscode';
import { CondaEnvironment } from '../models/types';
import { CondaService } from '../services/condaService';
import { getConfig } from '../core/config';

export class EnvironmentsTreeProvider implements vscode.TreeDataProvider<EnvironmentTreeItem> {
  private readonly emitter = new vscode.EventEmitter<EnvironmentTreeItem | undefined | null>();
  readonly onDidChangeTreeData: vscode.Event<EnvironmentTreeItem | undefined | null> = this.emitter.event;

  private environments: CondaEnvironment[] = [];

  constructor(private readonly condaService: CondaService) {}

  refresh(envs: CondaEnvironment[]): void {
    this.environments = getConfig().showInactiveEnvironments ? envs : envs.filter(env => env.active);
    this.emitter.fire(null);
  }

  getTreeItem(element: EnvironmentTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: EnvironmentTreeItem): Thenable<EnvironmentTreeItem[]> {
    if (!element) return Promise.resolve(this.getEnvItems());
    if (element.contextValue === 'condaEnv') return this.getEnvDetailItems(element);
    return Promise.resolve([]);
  }

  private getEnvItems(): EnvironmentTreeItem[] {
    return this.environments.map(env => {
      const item = new EnvironmentTreeItem(
        env.name,
        env.active ? '✓ ' + env.name : env.name,
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

  private async getEnvDetailItems(env: EnvironmentTreeItem): Promise<EnvironmentTreeItem[]> {
    const loadingItem = new EnvironmentTreeItem('loading', '⏳ 正在加载详情...', vscode.TreeItemCollapsibleState.None);
    loadingItem.iconPath = new vscode.ThemeIcon('loading~spin');

    const fullEnv = this.environments.find(candidate => candidate.name === env.id);
    if (!fullEnv) return [loadingItem];

    if (!fullEnv.pythonVersion) {
      const enriched = await this.condaService.enrichEnvironment(fullEnv);
      Object.assign(fullEnv, enriched);
      this.emitter.fire(env);
    }

    const details: { label: string; icon: string; command?: string; envName?: string }[] = [
      { label: `Python ${fullEnv.pythonVersion || '?'}`, icon: 'symbol-misc', command: 'conda-assistant.switchInterpreter', envName: fullEnv.name },
      { label: `${fullEnv.packages} 个包`, icon: 'package' },
      { label: `大小: ${fullEnv.size || '?'}`, icon: 'database' },
      { label: `路径: ${fullEnv.path}`, icon: 'folder' },
    ];
    return details.map(detail => {
      const item = new EnvironmentTreeItem(detail.label, detail.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(detail.icon);
      if (detail.command && detail.envName) {
        item.command = { command: detail.command, title: '切换解释器', arguments: [detail.envName] };
        item.tooltip = '点击切换 VS Code Python 解释器到此环境';
      }
      return item;
    });
  }
}

class EnvironmentTreeItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.id = id;
  }
}
