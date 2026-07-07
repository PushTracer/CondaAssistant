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
exports.HealthChecker = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const utils_1 = require("./utils");
class HealthChecker {
    constructor() { }
    async runFullCheck() {
        const checks = [];
        await this.checkConda(checks);
        const envs = await this.getCondaEnvs();
        await this.checkEnvironments(checks, envs);
        await this.checkPyTorchInEnvs(checks, envs);
        await this.checkTensorFlowInEnvs(checks, envs);
        await this.checkPipInEnvs(checks, envs);
        const score = this.calculateScore(checks);
        return { score, checks };
    }
    async getCondaEnvs() {
        try {
            const out = await (0, utils_1.execConda)(['env', 'list', '--json']);
            const data = JSON.parse(out);
            const envs = data.envs || [];
            const root = data.conda_prefix || '';
            return envs.map((p) => p === root ? 'base' : path.basename(p));
        }
        catch {
            return [];
        }
    }
    calculateScore(checks) {
        const total = checks.length * 10;
        let earned = 0;
        for (const check of checks) {
            if (check.status === 'ok')
                earned += 10;
            else if (check.status === 'warning')
                earned += 5;
        }
        return total > 0 ? Math.round((earned / total) * 100) : 0;
    }
    pyPath(envName) {
        const envPath = (0, utils_1.getEnvPath)(envName);
        if (!envPath)
            return '';
        return process.platform === 'win32'
            ? path.join(envPath, 'python.exe')
            : path.join(envPath, 'bin', 'python');
    }
    async checkConda(checks) {
        try {
            const output = await (0, utils_1.execConda)(['--version']);
            const ver = output.replace('conda ', '').trim();
            checks.push({
                name: 'Conda',
                status: 'ok',
                message: `Conda ${ver} 已安装`
            });
        }
        catch {
            checks.push({
                name: 'Conda',
                status: 'error',
                message: '未找到 Conda，请安装 Miniconda 或 Anaconda'
            });
        }
    }
    async checkEnvironments(checks, envs) {
        const basePy = this.pyPath('base');
        let baseVer = '?';
        if (basePy && fs.existsSync(basePy)) {
            try {
                baseVer = (await (0, utils_1.execCommand)(`"${basePy}" --version`, 5000)).replace('Python ', '').trim();
            }
            catch { }
        }
        const details = envs.map(e => {
            const py = this.pyPath(e);
            if (py && fs.existsSync(py))
                return `${e}`;
            return `${e} (!)`;
        }).join(', ');
        checks.push({
            name: '环境',
            status: envs.length > 0 ? 'ok' : 'warning',
            message: `${envs.length} 个环境 | Python ${baseVer} | ${details}`
        });
    }
    async checkPyTorchInEnvs(checks, envs) {
        let found = false;
        for (const env of envs) {
            const py = this.pyPath(env);
            if (!py || !fs.existsSync(py))
                continue;
            try {
                const out = await (0, utils_1.execCommand)(`"${py}" -c "import torch; print(torch.__version__); print(torch.cuda.is_available())"`, 10000);
                const lines = out.split('\n').filter(l => l.trim());
                const ver = lines[0]?.trim() || '';
                const cudaAvail = lines[1]?.trim() === 'True';
                found = true;
                checks.push({
                    name: `PyTorch (${env})`,
                    status: cudaAvail ? 'ok' : 'warning',
                    message: cudaAvail
                        ? `PyTorch ${ver} (CUDA 可用)`
                        : `PyTorch ${ver} (CUDA 不可用)`
                });
                break;
            }
            catch { /* try next env */ }
        }
        if (!found) {
            checks.push({
                name: 'PyTorch',
                status: 'warning',
                message: `未在任何环境中检测到 PyTorch`
            });
        }
    }
    async checkTensorFlowInEnvs(checks, envs) {
        let found = false;
        for (const env of envs) {
            const py = this.pyPath(env);
            if (!py || !fs.existsSync(py))
                continue;
            try {
                const out = await (0, utils_1.execCommand)(`"${py}" -c "import tensorflow as tf; print(tf.__version__); print(len(tf.config.list_physical_devices('GPU')))"`, 10000);
                const lines = out.split('\n').filter(l => l.trim());
                const ver = lines[0]?.trim() || '';
                const gpuCount = parseInt(lines[1]?.trim() || '0');
                found = true;
                checks.push({
                    name: `TensorFlow (${env})`,
                    status: gpuCount > 0 ? 'ok' : 'warning',
                    message: gpuCount > 0
                        ? `TensorFlow ${ver} (GPU: ${gpuCount})`
                        : `TensorFlow ${ver} (仅 CPU)`
                });
                break;
            }
            catch { /* try next env */ }
        }
        if (!found) {
            checks.push({
                name: 'TensorFlow',
                status: 'info',
                message: '未在任何环境中检测到 TensorFlow'
            });
        }
    }
    async checkPipInEnvs(checks, envs) {
        let found = false;
        for (const env of envs) {
            const py = this.pyPath(env);
            if (!py || !fs.existsSync(py))
                continue;
            try {
                const pipPath = process.platform === 'win32'
                    ? path.join(path.dirname(py), 'pip.exe')
                    : path.join(path.dirname(py), 'pip');
                if (!fs.existsSync(pipPath))
                    continue;
                const out = await (0, utils_1.execCommand)(`"${pipPath}" --version`, 5000);
                found = true;
                checks.push({
                    name: `pip (${env})`,
                    status: 'ok',
                    message: out.split(' ').slice(0, 2).join(' ')
                });
                break;
            }
            catch { /* try next env */ }
        }
        if (!found) {
            checks.push({
                name: 'pip',
                status: 'warning',
                message: '未检测到 pip'
            });
        }
    }
}
exports.HealthChecker = HealthChecker;
//# sourceMappingURL=healthChecker.js.map