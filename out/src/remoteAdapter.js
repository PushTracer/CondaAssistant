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
exports.RemoteAdapter = void 0;
const vscode = __importStar(require("vscode"));
const utils_1 = require("./utils");
class RemoteAdapter {
    constructor(outputChannel) {
        this.outputChannel = outputChannel;
    }
    async detectAllEnvironments() {
        const envs = [];
        envs.push({ type: 'local', name: '本地', condaPath: '', detail: process.platform });
        if (this.getRemoteName() === 'wsl') {
            envs.push({ type: 'wsl', name: 'WSL (当前)', condaPath: '', detail: 'VS Code 运行在 WSL 中' });
            return envs;
        }
        if (vscode.workspace.getConfiguration('conda-ai').get('enableWSLSupport')) {
            const wslEnvs = await this.detectWSL();
            envs.push(...wslEnvs);
            if (wslEnvs.length > 0) {
                this.outputChannel.appendLine(`检测到 ${wslEnvs.length} 个 WSL 环境`);
            }
        }
        return envs;
    }
    async detectWSL() {
        const envs = [];
        try {
            const output = await (0, utils_1.execCommand)('wsl -l -q 2>$null', 15000);
            const distros = output.split('\n').map(l => l.replace(/[\r\n\x00]/g, '').trim()).filter(l => l && l !== '');
            for (const distro of distros) {
                const name = distro.replace(/\s+/g, ' ').trim();
                if (!name || name.includes('Windows') || name.includes('docker-desktop'))
                    continue;
                try {
                    const condaCheck = await (0, utils_1.execCommand)(`wsl -d "${name}" bash -lc 'which conda 2>/dev/null || echo "not_found"'`, 15000);
                    if (condaCheck && !condaCheck.includes('not_found') && condaCheck.trim()) {
                        envs.push({
                            type: 'wsl',
                            name: `WSL: ${name}`,
                            condaPath: condaCheck.trim(),
                            detail: `发行版: ${name}`
                        });
                    }
                }
                catch { }
            }
        }
        catch (err) {
            if (!err?.message?.includes('没有') && !err?.message?.includes('not')) {
                this.outputChannel.appendLine(`WSL 检测失败: ${err}`);
            }
        }
        return envs;
    }
    async getWSLEnvironments(wslName) {
        try {
            const wslNameClean = wslName.replace(/^WSL:\s*/, '');
            const output = await (0, utils_1.execCommand)(`wsl -d "${wslNameClean}" bash -lc 'conda env list 2>/dev/null'`, 30000);
            return (0, utils_1.parseCondaEnvList)(output);
        }
        catch {
            return [];
        }
    }
    async execInWSL(wslName, condaArgs) {
        const wslNameClean = wslName.replace(/^WSL:\s*/, '');
        const cmd = `wsl -d "${wslNameClean}" bash -lc 'conda ${condaArgs.join(' ')} 2>/dev/null'`;
        return await (0, utils_1.execCommand)(cmd, 60000);
    }
    isRemote() {
        return vscode.env.remoteName !== undefined && vscode.env.remoteName !== null;
    }
    getRemoteName() {
        return vscode.env.remoteName || 'local';
    }
    isWSL() {
        return this.getRemoteName() === 'wsl';
    }
}
exports.RemoteAdapter = RemoteAdapter;
//# sourceMappingURL=remoteAdapter.js.map