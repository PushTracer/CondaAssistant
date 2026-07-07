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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const condaManager_1 = require("./condaManager");
const treeView_1 = require("./treeView");
const remoteAdapter_1 = require("./remoteAdapter");
const healthChecker_1 = require("./healthChecker");
const commands_1 = require("./commands");
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel('Conda AI Manager');
    outputChannel.appendLine('Conda AI Manager 启动中...');
    const condaManager = new condaManager_1.CondaManager(outputChannel);
    const envTreeProvider = new treeView_1.CondaEnvTreeProvider();
    envTreeProvider.setCondaManager(condaManager);
    const quickActionsProvider = new treeView_1.CondaQuickActionsProvider();
    const remoteAdapter = new remoteAdapter_1.RemoteAdapter(outputChannel);
    vscode.window.registerTreeDataProvider('condaEnvironments', envTreeProvider);
    vscode.window.registerTreeDataProvider('condaQuickActions', quickActionsProvider);
    (0, commands_1.registerCommands)(context, condaManager, envTreeProvider, quickActionsProvider, outputChannel, remoteAdapter);
    context.subscriptions.push(outputChannel);
    const autoDetect = vscode.workspace.getConfiguration('conda-ai').get('autoDetectConda');
    if (autoDetect) {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: 'Conda AI Manager 初始化中...',
        }, async (progress) => {
            try {
                progress.report({ message: '检测 Conda 环境' });
                outputChannel.appendLine('正在检测 Conda 环境...');
                const remoteEnvs = await remoteAdapter.detectAllEnvironments();
                const wslEnv = remoteEnvs.find(e => e.type === 'wsl' && e.name !== 'WSL (当前)');
                if (remoteEnvs.length > 1) {
                    outputChannel.appendLine(`检测到 ${remoteEnvs.length} 个运行环境:`);
                    for (const env of remoteEnvs) {
                        outputChannel.appendLine(`  - ${env.type}: ${env.name}`);
                    }
                }
                progress.report({ message: '获取 Conda 环境列表' });
                const info = await condaManager.getCondaInfo();
                if (info) {
                    outputChannel.appendLine(`Conda ${info.condaVersion} | ${info.envs.length} 个环境`);
                    let allEnvs = [...info.envs];
                    if (wslEnv) {
                        try {
                            progress.report({ message: '扫描 WSL 环境' });
                            const wslEnvs = await remoteAdapter.getWSLEnvironments(wslEnv.name);
                            for (const we of wslEnvs) {
                                we.name = `🐧 ${we.name} (WSL)`;
                                allEnvs.push(we);
                            }
                            outputChannel.appendLine(`  + ${wslEnvs.length} 个 WSL 环境`);
                        }
                        catch { }
                    }
                    envTreeProvider.refresh(allEnvs);
                    outputChannel.appendLine('环境列表已加载');
                    progress.report({ message: `已加载 ${allEnvs.length} 个环境（展开查看详情）` });
                }
                else {
                    outputChannel.appendLine('未检测到 Conda');
                    if (remoteAdapter.isWSL()) {
                        vscode.window.showWarningMessage('WSL 环境中未检测到 Conda。请在 WSL 中安装 Conda。');
                    }
                    else {
                        const setupAction = '查看安装指南';
                        vscode.window.showWarningMessage('未检测到 Conda。请安装 Miniconda 或 Anaconda，或在设置中配置 conda-ai.condaPath。', setupAction).then(action => {
                            if (action === setupAction) {
                                vscode.env.openExternal(vscode.Uri.parse('https://docs.conda.io/en/latest/miniconda.html'));
                            }
                        });
                    }
                }
                const healthOnStartup = vscode.workspace.getConfiguration('conda-ai').get('healthCheckOnStartup');
                if (healthOnStartup && info) {
                    progress.report({ message: '执行健康检查...' });
                    outputChannel.appendLine('正在执行启动健康检查...');
                    const checker = new healthChecker_1.HealthChecker();
                    const result = await checker.runFullCheck();
                    const errors = result.checks.filter((c) => c.status === 'error');
                    const warnings = result.checks.filter((c) => c.status === 'warning');
                    if (errors.length > 0) {
                        vscode.window.showWarningMessage(`健康检查: ${result.score}/100 | ${errors.length} 个错误, ${warnings.length} 个警告`);
                    }
                    outputChannel.appendLine(`健康检查完成: ${result.score}/100`);
                }
            }
            catch (err) {
                outputChannel.appendLine(`初始化失败: ${err}`);
            }
        });
    }
    outputChannel.appendLine('Conda AI Manager 已激活');
}
function deactivate() { }
//# sourceMappingURL=extension.js.map