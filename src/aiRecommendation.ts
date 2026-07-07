export interface AIEnvTemplate {
  name: string;
  label: string;
  description: string;
  pythonVersion: string;
  pipPackages: string[];
  cudaVariants: CUDAVariant[];
}

export interface CUDAVariant {
  label: string;
  cudaVersion: string;
  pipIndex?: string;
  extraPip?: string[];
}

export const AI_ENV_TEMPLATES: AIEnvTemplate[] = [
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

import * as https from 'https';

async function httpsGetText(url: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => data += chunk.toString());
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function parseCuDirs(html: string): Promise<{ suffix: string; major: number; minor: number }[]> {
  const re = /href="(cu\d+)\/"/g;
  const seen = new Set<string>();
  const cus: { suffix: string; major: number; minor: number }[] = [];
  let m: RegExpExecArray | null;
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

async function checkAvailablePkgs(cudaSuffix: string): Promise<{ vision: boolean; audio: boolean }> {
  const hasWheel = async (pkg: string): Promise<boolean> => {
    try {
      const html = await httpsGetText(`https://download.pytorch.org/whl/${cudaSuffix}/${pkg}/`, 5000);
      return /cp312.*linux_x86_64/.test(html);
    } catch {
      return false;
    }
  };
  const [vision, audio] = await Promise.all([hasWheel('torchvision'), hasWheel('torchaudio')]);
  return { vision, audio };
}

function buildPipList(cudaSuffix: string, vision: boolean, audio: boolean): string[] {
  const pkgs = ['torch'];
  if (vision) pkgs.push('torchvision');
  if (audio) pkgs.push('torchaudio');
  if (cudaSuffix !== 'cpu') {
    pkgs.push('--index-url', `https://download.pytorch.org/whl/${cudaSuffix}`);
  }
  return pkgs;
}

export async function fetchPyTorchCudaVariants(): Promise<CUDAVariant[]> {
  try {
    const [stableHtml, nightlyHtml] = await Promise.all([
      httpsGetText('https://download.pytorch.org/whl/'),
      httpsGetText('https://download.pytorch.org/whl/nightly/').catch(() => '')
    ]);
    const stable = await parseCuDirs(stableHtml);
    const nightly = nightlyHtml ? await parseCuDirs(nightlyHtml) : [];

    const top = stable.slice(0, 6);
    const pkgResults = await Promise.all(top.map(c => checkAvailablePkgs(c.suffix)));
    const pkgMap = new Map<string, { vision: boolean; audio: boolean }>();
    top.forEach((c, i) => pkgMap.set(c.suffix, pkgResults[i]));

    const variants: CUDAVariant[] = [
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
    } else if (stable.length > 0) {
      const top = stable[0];
      variants.push({
        label: `Nightly (CUDA ${top.major}.${top.minor})`,
        cudaVersion: 'nightly',
        extraPip: ['torch', 'torchvision', 'torchaudio', '--pre', '--index-url', `https://download.pytorch.org/whl/nightly/${top.suffix}`],
      });
    }
    return variants;
  } catch {
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
