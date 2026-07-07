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
exports.AI_ENV_TEMPLATES = void 0;
exports.fetchPyTorchCudaVariants = fetchPyTorchCudaVariants;
exports.AI_ENV_TEMPLATES = [
    {
        name: 'pytorch',
        label: 'PyTorch',
        description: '深度学习框架，支持 CUDA 加速',
        pythonVersion: '3.12',
        pipPackages: [],
        cudaVariants: [
            { label: 'CPU', cudaVersion: 'cpu', extraPip: ['torch', 'torchvision', 'torchaudio'] },
            { label: 'CUDA 12.1', cudaVersion: 'cu121', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu121'] },
            { label: 'CUDA 12.4', cudaVersion: 'cu124', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu124'] },
            { label: 'CUDA 12.6', cudaVersion: 'cu126', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu126'] },
            { label: 'Nightly', cudaVersion: 'nightly', extraPip: ['torch', 'torchvision', 'torchaudio', '--pre', '--index-url', 'https://download.pytorch.org/whl/nightly/cu126'] },
        ]
    },
    {
        name: 'tensorflow',
        label: 'TensorFlow',
        description: '深度学习框架，支持 GPU 加速',
        pythonVersion: '3.11',
        pipPackages: [],
        cudaVariants: [
            { label: 'CPU', cudaVersion: 'cpu', extraPip: ['tensorflow', 'tensorflow-datasets', 'tensorboard'] },
            { label: 'GPU', cudaVersion: 'gpu', extraPip: ['tensorflow', 'tensorflow-datasets', 'tensorboard'] },
        ]
    },
    {
        name: 'datascience',
        label: '数据科学基础',
        description: 'NumPy, Pandas, Matplotlib, Scikit-learn, Jupyter',
        pythonVersion: '3.12',
        pipPackages: ['numpy', 'pandas', 'matplotlib', 'scikit-learn', 'jupyter', 'scipy'],
        cudaVariants: [
            { label: '标准', cudaVersion: '', extraPip: [] },
        ]
    },
    {
        name: 'computervision',
        label: '计算机视觉',
        description: 'OpenCV, Pillow, PyTorch, torchvision',
        pythonVersion: '3.12',
        pipPackages: ['opencv-python', 'pillow'],
        cudaVariants: [
            { label: 'CPU', cudaVersion: 'cpu', extraPip: ['torch', 'torchvision'] },
            { label: 'CUDA 12.4', cudaVersion: 'cu124', extraPip: ['torch', 'torchvision', '--index-url', 'https://download.pytorch.org/whl/cu124'] },
        ]
    },
    {
        name: 'nlp',
        label: '自然语言处理',
        description: 'Transformers, Datasets, Tokenizers, Sentence-Transformers',
        pythonVersion: '3.12',
        pipPackages: ['transformers', 'datasets', 'tokenizers', 'sentence-transformers', 'accelerate', 'evaluate'],
        cudaVariants: [
            { label: 'CPU', cudaVersion: 'cpu' },
            { label: 'CUDA 12.4', cudaVersion: 'cu124', extraPip: ['torch', 'torchvision', '--index-url', 'https://download.pytorch.org/whl/cu124'] },
        ]
    },
    {
        name: 'xgb-lightgbm',
        label: 'XGBoost / LightGBM',
        description: '梯度提升框架，含 GPU 支持',
        pythonVersion: '3.12',
        pipPackages: ['xgboost', 'lightgbm'],
        cudaVariants: [
            { label: '标准', cudaVersion: '', extraPip: [] },
        ]
    }
];
const https = __importStar(require("https"));
async function httpsGetText(url, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: timeoutMs }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk.toString());
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}
async function parseCuDirs(html) {
    const re = /href="(cu\d+)\/"/g;
    const seen = new Set();
    const cus = [];
    let m;
    while ((m = re.exec(html)) !== null) {
        if (!seen.has(m[1])) {
            seen.add(m[1]);
            const full = parseInt(m[1].replace('cu', ''));
            cus.push({ suffix: m[1], major: Math.floor(full / 10), minor: full % 10 });
        }
    }
    cus.sort((a, b) => b.major - a.major || b.minor - a.minor);
    return cus;
}
async function checkAvailablePkgs(cudaSuffix) {
    const hasWheel = async (pkg) => {
        try {
            const html = await httpsGetText(`https://download.pytorch.org/whl/${cudaSuffix}/${pkg}/`, 5000);
            return /cp312.*linux_x86_64/.test(html);
        }
        catch {
            return false;
        }
    };
    const [vision, audio] = await Promise.all([hasWheel('torchvision'), hasWheel('torchaudio')]);
    return { vision, audio };
}
function buildPipList(cudaSuffix, vision, audio) {
    const pkgs = ['torch'];
    if (vision)
        pkgs.push('torchvision');
    if (audio)
        pkgs.push('torchaudio');
    if (cudaSuffix !== 'cpu') {
        pkgs.push('--index-url', `https://download.pytorch.org/whl/${cudaSuffix}`);
    }
    return pkgs;
}
async function fetchPyTorchCudaVariants() {
    try {
        const [stableHtml, nightlyHtml] = await Promise.all([
            httpsGetText('https://download.pytorch.org/whl/'),
            httpsGetText('https://download.pytorch.org/whl/nightly/').catch(() => '')
        ]);
        const stable = await parseCuDirs(stableHtml);
        const nightly = nightlyHtml ? await parseCuDirs(nightlyHtml) : [];
        const top = stable.slice(0, 6);
        const pkgResults = await Promise.all(top.map(c => checkAvailablePkgs(c.suffix)));
        const pkgMap = new Map();
        top.forEach((c, i) => pkgMap.set(c.suffix, pkgResults[i]));
        const variants = [
            { label: 'CPU (CPU 模式)', cudaVersion: 'cpu', extraPip: ['torch', 'torchvision', 'torchaudio'] },
            ...stable.map(c => {
                const check = pkgMap.get(c.suffix);
                const vision = check?.vision ?? true;
                const audio = check?.audio ?? true;
                return {
                    label: `CUDA ${c.major}.${c.minor}${c.major >= 13 ? ' (RTX 50 系列推荐)' : ''}`,
                    cudaVersion: c.suffix,
                    extraPip: buildPipList(c.suffix, vision, audio),
                };
            }),
        ];
        if (nightly.length > 0) {
            const top = nightly[0];
            variants.push({
                label: `Nightly (CUDA ${top.major}.${top.minor})`,
                cudaVersion: 'nightly',
                extraPip: ['torch', 'torchvision', 'torchaudio', '--pre', '--index-url', `https://download.pytorch.org/whl/nightly/${top.suffix}`],
            });
        }
        else if (stable.length > 0) {
            const top = stable[0];
            variants.push({
                label: `Nightly (CUDA ${top.major}.${top.minor})`,
                cudaVersion: 'nightly',
                extraPip: ['torch', 'torchvision', 'torchaudio', '--pre', '--index-url', `https://download.pytorch.org/whl/nightly/${top.suffix}`],
            });
        }
        return variants;
    }
    catch {
        return [
            { label: 'CPU (CPU 模式)', cudaVersion: 'cpu', extraPip: ['torch', 'torchvision', 'torchaudio'] },
            { label: 'CUDA 13.0 (RTX 50 系列推荐)', cudaVersion: 'cu130', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu130'] },
            { label: 'CUDA 12.6', cudaVersion: 'cu126', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu126'] },
            { label: 'CUDA 12.4', cudaVersion: 'cu124', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu124'] },
            { label: 'CUDA 12.1', cudaVersion: 'cu121', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu121'] },
            { label: 'Nightly', cudaVersion: 'nightly', extraPip: ['torch', 'torchvision', 'torchaudio', '--pre', '--index-url', 'https://download.pytorch.org/whl/nightly/cu130'] },
        ];
    }
}
//# sourceMappingURL=aiRecommendation.js.map