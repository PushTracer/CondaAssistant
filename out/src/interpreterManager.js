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
exports.InterpreterManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const utils_1 = require("./utils");
class InterpreterManager {
    constructor(outputChannel) {
        this.outputChannel = outputChannel;
    }
    async autoSelectCondaEnv(envName) {
        try {
            const prefix = (0, utils_1.getCondaPrefix)();
            if (!prefix)
                return false;
            const envPath = process.platform === 'win32'
                ? path.join(prefix, 'envs', envName)
                : path.join(prefix, 'envs', envName);
            const pyPath = process.platform === 'win32'
                ? path.join(envPath, 'python.exe')
                : path.join(envPath, 'bin', 'python');
            if (!fs.existsSync(pyPath)) {
                if (envName === 'base') {
                    const basePy = process.platform === 'win32'
                        ? path.join(prefix, 'python.exe')
                        : path.join(prefix, 'bin', 'python');
                    if (fs.existsSync(basePy)) {
                        return await this.setInterpreter(basePy, envName);
                    }
                }
                return false;
            }
            return await this.setInterpreter(pyPath, envName);
        }
        catch (err) {
            this.outputChannel.appendLine(`自动选择解释器失败: ${err}`);
            return false;
        }
    }
    async setInterpreter(pyPath, envName) {
        try {
            const config = vscode.workspace.getConfiguration('python');
            await config.update('defaultInterpreterPath', pyPath, vscode.ConfigurationTarget.Workspace);
            this.outputChannel.appendLine(`已自动选择解释器: ${envName} (${pyPath})`);
            return true;
        }
        catch (err) {
            this.outputChannel.appendLine(`设置解释器失败: ${err}`);
            return false;
        }
    }
    async detectAllInterpreters() {
        const interpreters = [];
        await this.detectCondaInterpreters(interpreters);
        await this.detectVenvInterpreters(interpreters);
        await this.detectSystemPython(interpreters);
        return interpreters;
    }
    async detectCondaInterpreters(interpreters) {
        try {
            const infoOutput = await (0, utils_1.execConda)(['info', '--json']);
            const info = JSON.parse(infoOutput);
            for (const envPath of (info.envs || [])) {
                const pyPath = process.platform === 'win32'
                    ? path.join(envPath, 'python.exe')
                    : path.join(envPath, 'bin', 'python');
                if (fs.existsSync(pyPath)) {
                    try {
                        const verOut = await (0, utils_1.execCommand)(`"${pyPath}" --version`);
                        interpreters.push({
                            path: pyPath,
                            version: verOut.replace('Python ', '').trim(),
                            type: 'conda',
                            envName: envPath === info.root_prefix ? 'base' : path.basename(envPath)
                        });
                    }
                    catch { }
                }
            }
        }
        catch (err) {
            this.outputChannel.appendLine(`检测 Conda 解释器失败: ${err}`);
        }
    }
    async detectVenvInterpreters(interpreters) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders)
            return;
        for (const folder of workspaceFolders) {
            for (const envPath of [path.join(folder.uri.fsPath, '.venv'), path.join(folder.uri.fsPath, 'venv')]) {
                const pyPath = process.platform === 'win32'
                    ? path.join(envPath, 'Scripts', 'python.exe')
                    : path.join(envPath, 'bin', 'python');
                if (fs.existsSync(pyPath)) {
                    try {
                        const verOut = await (0, utils_1.execCommand)(`"${pyPath}" --version`);
                        interpreters.push({
                            path: pyPath,
                            version: verOut.replace('Python ', '').trim(),
                            type: 'venv',
                            envName: path.basename(envPath)
                        });
                    }
                    catch { }
                }
            }
        }
    }
    async detectSystemPython(interpreters) {
        const pythonCmds = process.platform === 'win32'
            ? ['python', 'python3', 'py']
            : ['python3', 'python'];
        for (const cmd of pythonCmds) {
            try {
                const out = await (0, utils_1.execCommand)(`${cmd} --version`);
                const whichOut = await (0, utils_1.execCommand)(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`);
                const pyPath = whichOut.split('\n')[0].trim();
                if (!interpreters.some(i => i.path === pyPath)) {
                    interpreters.push({
                        path: pyPath,
                        version: out.replace('Python ', '').trim(),
                        type: 'system',
                        envName: 'system'
                    });
                }
            }
            catch { }
        }
    }
    async selectInterpreter() {
        const interpreters = await this.detectAllInterpreters();
        if (interpreters.length === 0) {
            vscode.window.showWarningMessage('未检测到任何 Python 解释器');
            return false;
        }
        const items = interpreters.map(i => ({
            label: `${i.envName} (${i.type})`,
            description: i.version,
            detail: i.path,
            interpreter: i
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择 Python 解释器'
        });
        if (!selected)
            return false;
        return await this.setInterpreter(selected.interpreter.path, selected.interpreter.envName);
    }
}
exports.InterpreterManager = InterpreterManager;
//# sourceMappingURL=interpreterManager.js.map