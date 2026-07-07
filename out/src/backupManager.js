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
exports.BackupManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const utils_1 = require("./utils");
class BackupManager {
    constructor(outputChannel) {
        this.outputChannel = outputChannel;
    }
    async backupWithCondaPack(envName) {
        try {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`${envName}.tar.gz`),
                filters: { 'Archive': ['tar.gz'] }
            });
            if (!uri)
                return false;
            const envPath = await this.getEnvPath(envName);
            if (!envPath) {
                vscode.window.showErrorMessage('无法获取环境路径');
                return false;
            }
            const pipPath = process.platform === 'win32'
                ? path.join(envPath, 'Scripts', 'pip.exe')
                : path.join(envPath, 'bin', 'pip');
            if (fs.existsSync(pipPath)) {
                await (0, utils_1.execCommand)(`"${pipPath}" install conda-pack`, 60000);
            }
            else {
                await (0, utils_1.execConda)(['install', '-y', '-n', envName, 'conda-pack'], 120000);
            }
            const outputPath = uri.fsPath;
            const pyPath = process.platform === 'win32'
                ? path.join(envPath, 'python.exe')
                : path.join(envPath, 'bin', 'python');
            const packCmd = `"${pyPath}" -m conda_pack -o "${outputPath}"`;
            await (0, utils_1.execCommand)(packCmd, 180000);
            vscode.window.showInformationMessage(`环境 ${envName} 已打包到 ${outputPath} (${this.getFileSize(outputPath)})`);
            return true;
        }
        catch (err) {
            this.outputChannel.appendLine(`conda-pack 备份失败: ${err}`);
            vscode.window.showErrorMessage('conda-pack 备份失败');
            return false;
        }
    }
    async exportRequirements(envName) {
        try {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`requirements-${envName}.txt`),
                filters: { 'Requirements': ['txt'] }
            });
            if (!uri)
                return false;
            const output = await (0, utils_1.execConda)(['list', '-n', envName, '--export']);
            fs.writeFileSync(uri.fsPath, output);
            vscode.window.showInformationMessage(`已导出 requirements.txt`);
            return true;
        }
        catch (err) {
            this.outputChannel.appendLine(`导出 requirements 失败: ${err}`);
            return false;
        }
    }
    async backupEnvironment(envName) {
        const choice = await vscode.window.showQuickPick([
            { label: '📄 environment.yml (推荐)', description: '跨平台兼容', value: 'yml' },
            { label: '📄 requirements.txt', description: 'pip 格式', value: 'txt' },
            { label: '📦 conda-pack (完整环境)', description: '包含所有二进制文件', value: 'pack' },
        ], { placeHolder: `选择备份方式 - ${envName}` });
        if (!choice)
            return;
        if (choice.value === 'pack') {
            await this.backupWithCondaPack(envName);
        }
        else if (choice.value === 'yml') {
            const output = await (0, utils_1.execConda)(['env', 'export', '-n', envName]);
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`${envName}.yml`),
                filters: { 'YAML': ['yml'] }
            });
            if (uri) {
                fs.writeFileSync(uri.fsPath, output);
                vscode.window.showInformationMessage(`已导出 environment.yml`);
            }
        }
        else {
            await this.exportRequirements(envName);
        }
    }
    async getEnvPath(envName) {
        try {
            const info = await (0, utils_1.execConda)(['info', '--json']);
            const data = JSON.parse(info);
            if (envName === 'base')
                return data.root_prefix;
            const envDir = data.envs_dirs[0] || path.join(data.root_prefix, 'envs');
            const envPath = path.join(envDir, envName);
            return fs.existsSync(envPath) ? envPath : null;
        }
        catch {
            return null;
        }
    }
    getFileSize(filePath) {
        try {
            const bytes = fs.statSync(filePath).size;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
        }
        catch {
            return '未知';
        }
    }
}
exports.BackupManager = BackupManager;
//# sourceMappingURL=backupManager.js.map