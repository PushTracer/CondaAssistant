"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CondaQuickActionsProvider = exports.CondaEnvTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
class CondaEnvTreeProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.environments = [];
    }
    setCondaManager(mgr) {
        this.condaManager = mgr;
    }
    refresh(envs) {
        this.environments = envs;
        this._onDidChangeTreeData.fire(null);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            if (element.contextValue === 'condaEnv') {
                return this.getEnvDetailItems(element);
            }
            return Promise.resolve([]);
        }
        return Promise.resolve(this.getEnvItems());
    }
    getEnvItems() {
        return this.environments.map(env => {
            const label = env.active ? '✓ ' + env.name : env.name;
            const item = new CondaEnvItem(env.name, label, vscode.TreeItemCollapsibleState.Collapsed);
            item.contextValue = 'condaEnv';
            item.description = '';
            item.tooltip = `路径: ${env.path}\n点击展开查看详情（正在加载...）`;
            item.iconPath = env.active
                ? new vscode.ThemeIcon('symbol-ruler', new vscode.ThemeColor('charts.green'))
                : new vscode.ThemeIcon('symbol-ruler');
            return item;
        });
    }
    async getEnvDetailItems(env) {
        const loadingItem = new CondaEnvItem('loading', '⏳ 正在加载详情...', vscode.TreeItemCollapsibleState.None);
        loadingItem.iconPath = new vscode.ThemeIcon('sync~spin');
        const fullEnv = this.environments.find(e => e.name === env.label.replace('✓ ', ''));
        if (!fullEnv)
            return [loadingItem];
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
exports.CondaEnvTreeProvider = CondaEnvTreeProvider;
class CondaQuickActionsProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        const actions = [
            new QuickActionItem('create', '🔄 AI 环境一键创建', vscode.TreeItemCollapsibleState.None, 'conda-ai.quickCreate', 'wand'),
            new QuickActionItem('health', '🏥 环境健康检查', vscode.TreeItemCollapsibleState.None, 'conda-ai.healthCheck', 'heart'),
            new QuickActionItem('import', '📥 一键恢复环境', vscode.TreeItemCollapsibleState.None, 'conda-ai.importEnvironment', 'cloud-download'),
            new QuickActionItem('interpreter', '🐍 切换解释器', vscode.TreeItemCollapsibleState.None, 'conda-ai.selectInterpreter', 'symbol-misc'),
        ];
        return Promise.resolve(actions);
    }
}
exports.CondaQuickActionsProvider = CondaQuickActionsProvider;
class CondaEnvItem extends vscode.TreeItem {
    constructor(id, label, collapsibleState) {
        super(label, collapsibleState);
        this.id = id;
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.id = id;
    }
}
class QuickActionItem extends vscode.TreeItem {
    constructor(id, label, collapsibleState, commandId, icon) {
        super(label, collapsibleState);
        this.id = id;
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.commandId = commandId;
        this.icon = icon;
        this.id = id;
        this.command = {
            command: commandId,
            title: label
        };
        this.iconPath = new vscode.ThemeIcon(icon);
    }
}
//# sourceMappingURL=treeView.js.map