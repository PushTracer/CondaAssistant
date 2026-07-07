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
exports.CUDADetector = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
class CUDADetector {
    constructor(outputChannel) {
        this.outputChannel = outputChannel;
    }
    async detect() {
        const info = {
            gpuModel: '',
            vram: '',
            computeCapability: '',
            driverVersion: '',
            cudaVersion: '',
            cudaPath: '',
            cudnnVersion: '',
            pytorchCUDA: false,
            pytorchVersion: '',
            gpuCount: 0
        };
        await Promise.all([
            this.detectHardware(info),
            this.detectCUDAToolkit(info),
            this.detectCuDNN(info),
            this.detectPyTorchCUDA(info),
        ]);
        return info;
    }
    generateHtml(info, recommendations) {
        const row = (label, val) => `<tr><td style=padding:8px 12px;color:#888;white-space:nowrap>${label}</td><td style=padding:8px 12px>${val || '<span style=color:#f44336>未检测到</span>'}</td></tr>`;
        return `<!DOCTYPE html>
<html><head><meta charset=UTF-8><style>
body{font-family:-apple-system,sans-serif;padding:20px;background:#1e1e1e;color:#d4d4d4}
h2{border-bottom:1px solid #333;padding-bottom:8px}
table{width:100%;border-collapse:collapse}
tr:nth-child(even){background:#252526}
.rec{background:#1b3a1b;padding:12px;border-radius:6px;margin:12px 0}
.rec li{margin:4px 0}
</style></head><body>
<h2>GPU 信息</h2>
<table>${row('GPU 型号', info.gpuModel)}${row('显存', info.vram)}${row('Compute Capability', info.computeCapability)}${row('GPU 数量', String(info.gpuCount))}</table>
<h2>驱动信息</h2>
<table>${row('NVIDIA 驱动', info.driverVersion)}</table>
<h2>CUDA Toolkit</h2>
<table>${row('CUDA 版本', info.cudaVersion)}${row('CUDA 路径', info.cudaPath)}${row('cuDNN 版本', info.cudnnVersion)}</table>
<h2>PyTorch</h2>
<table>${row('PyTorch 版本', info.pytorchVersion)}${row('CUDA 可用', info.pytorchCUDA ? '是' : '否')}</table>
${recommendations.length ? `<h2>推荐</h2><div class=rec><ul>${recommendations.map(r => `<li>${r}</li>`).join('')}</ul></div>` : ''}
</body></html>`;
    }
    async detectHardware(info) {
        try {
            const cmd = process.platform === 'win32'
                ? 'nvidia-smi --query-gpu=name,memory.total,compute_cap,driver_version --format=csv,noheader 2>$null'
                : 'nvidia-smi --query-gpu=name,memory.total,compute_cap,driver_version --format=csv,noheader';
            const output = await (0, utils_1.execCommand)(cmd, 10000).catch(() => '');
            if (output && output.includes(',')) {
                const lines = output.split('\n').filter(l => l.trim());
                info.gpuCount = lines.length;
                if (lines.length > 0) {
                    const parts = lines[0].split(',');
                    info.gpuModel = parts[0]?.trim() || '';
                    info.vram = parts[1]?.trim() || '';
                    info.computeCapability = parts[2]?.trim() || '';
                    info.driverVersion = parts[3]?.trim() || '';
                }
            }
            else {
                info.driverVersion = '未检测到 NVIDIA 驱动';
                if (process.platform === 'win32') {
                    await this.detectGPUFallback(info);
                }
            }
        }
        catch {
            info.driverVersion = '未检测到 NVIDIA 驱动';
        }
    }
    async detectGPUFallback(info) {
        try {
            const psOutput = await (0, utils_1.execCommand)('Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Csv -NoTypeInformation', 10000);
            for (const line of psOutput.split('\n')) {
                if (line.startsWith('"') && /nvidia|amd|radeon/i.test(line)) {
                    const parts = line.split(',').map((p) => p.replace(/"/g, '').trim());
                    if (parts.length >= 2) {
                        info.gpuCount++;
                        if (!info.gpuModel) {
                            info.gpuModel = parts[0];
                            const ramBytes = parseInt(parts[1]);
                            if (!isNaN(ramBytes)) {
                                info.vram = (ramBytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
                            }
                        }
                    }
                }
            }
        }
        catch { }
    }
    async detectCUDAToolkit(info) {
        try {
            const tryNvcc = async (nvccPath) => {
                try {
                    const out = await (0, utils_1.execCommand)(`"${nvccPath}" --version 2>/dev/null`, 10000);
                    const match = out.match(/release\s+([\d.]+)/);
                    if (match) {
                        info.cudaVersion = match[1];
                        info.cudaPath = path.dirname(path.dirname(nvccPath));
                        return true;
                    }
                }
                catch { }
                return false;
            };
            if (process.platform === 'win32') {
                if (await tryNvcc('nvcc'))
                    return;
                for (const p of [process.env.CUDA_PATH, process.env.CUDA_HOME].filter(Boolean)) {
                    if (await tryNvcc(path.join(p, 'bin', 'nvcc.exe')))
                        return;
                }
                const basePath = 'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA';
                if (fs.existsSync(basePath)) {
                    for (const v of fs.readdirSync(basePath)) {
                        if (await tryNvcc(path.join(basePath, v, 'bin', 'nvcc.exe')))
                            return;
                    }
                }
            }
            else {
                if (await tryNvcc('nvcc'))
                    return;
                for (const p of ['/usr/local/cuda', '/usr/local/cuda-12', '/usr/local/cuda-11', '/opt/cuda']) {
                    if (p && await tryNvcc(path.join(p, 'bin', 'nvcc')))
                        return;
                }
                try {
                    const condaOut = await (0, utils_1.execCommand)('conda info --json 2>/dev/null', 10000);
                    const condaInfo = JSON.parse(condaOut);
                    for (const envPath of (condaInfo.envs || [])) {
                        if (fs.existsSync(path.join(envPath, 'bin', 'nvcc')) && await tryNvcc(path.join(envPath, 'bin', 'nvcc')))
                            return;
                    }
                }
                catch { }
            }
            info.cudaVersion = '未检测到 CUDA Toolkit';
        }
        catch {
            info.cudaVersion = '未检测到 CUDA Toolkit';
        }
    }
    async detectCuDNN(info) {
        const tryRead = async (paths) => {
            for (const p of paths) {
                if (fs.existsSync(p)) {
                    try {
                        const content = fs.readFileSync(p, 'utf-8');
                        const major = content.match(/CUDNN_MAJOR\s+(\d+)/);
                        const minor = content.match(/CUDNN_MINOR\s+(\d+)/);
                        const patch = content.match(/CUDNN_PATCHLEVEL\s+(\d+)/);
                        if (major) {
                            info.cudnnVersion = `${major[1]}.${minor?.[1] || '0'}.${patch?.[1] || '0'}`;
                            return true;
                        }
                    }
                    catch { }
                }
            }
            return false;
        };
        try {
            if (await tryRead([
                '/usr/include/cudnn.h', '/usr/include/cudnn_version.h',
                '/usr/local/cuda/include/cudnn.h', '/usr/local/cuda/include/cudnn_version.h',
            ]))
                return;
            if (info.cudaPath && await tryRead([
                path.join(info.cudaPath, 'include', 'cudnn.h'),
                path.join(info.cudaPath, 'include', 'cudnn_version.h'),
            ]))
                return;
            try {
                const condaData = JSON.parse(await (0, utils_1.execCommand)('conda info --json 2>/dev/null', 10000));
                for (const envPath of (condaData.envs || [])) {
                    if (await tryRead([
                        path.join(envPath, 'include', 'cudnn.h'),
                        path.join(envPath, 'include', 'cudnn_version.h'),
                        path.join(envPath, 'lib', 'python3.*', 'site-packages', 'torch', 'include', 'cudnn.h'),
                    ]))
                        return;
                }
            }
            catch { }
            info.cudnnVersion = '未检测到 cuDNN';
        }
        catch {
            info.cudnnVersion = '未检测到 cuDNN';
        }
    }
    async detectPyTorchCUDA(info) {
        const tryPy = async (py) => {
            try {
                const out = await (0, utils_1.execCommand)(`"${py}" -c "import torch; print(torch.cuda.is_available()); print(torch.__version__); print(torch.cuda.device_count()); print(torch.version.cuda)"`, 15000);
                if (out) {
                    const lines = out.split('\n').filter((l) => l.trim());
                    info.pytorchCUDA = lines[0]?.trim() === 'True';
                    info.pytorchVersion = lines[1]?.trim() || '';
                    info.gpuCount = parseInt(lines[2]?.trim() || '0');
                    if (!info.cudaVersion && lines[3]) {
                        info.cudaVersion = `Runtime: ${lines[3].trim()}`;
                    }
                    return true;
                }
            }
            catch { }
            return false;
        };
        const checked = new Set();
        try {
            const condaData = JSON.parse(await (0, utils_1.execCommand)('conda info --json 2>/dev/null', 10000));
            for (const envPath of (condaData.envs || [])) {
                const pyPath = process.platform === 'win32'
                    ? path.join(envPath, 'python.exe')
                    : path.join(envPath, 'bin', 'python');
                if (fs.existsSync(pyPath) && !checked.has(pyPath)) {
                    checked.add(pyPath);
                    if (await tryPy(pyPath))
                        return;
                }
            }
        }
        catch { }
        const condaPrefix = process.env.CONDA_PREFIX || '';
        if (condaPrefix) {
            const pyPath = process.platform === 'win32'
                ? path.join(condaPrefix, 'python.exe')
                : path.join(condaPrefix, 'bin', 'python');
            if (!checked.has(pyPath) && await tryPy(pyPath))
                return;
        }
        await tryPy('python');
        if (!info.pytorchVersion) {
            info.pytorchCUDA = false;
            this.outputChannel.appendLine('PyTorch 未安装或无法检测');
        }
    }
}
exports.CUDADetector = CUDADetector;
//# sourceMappingURL=cudaDetector.js.map