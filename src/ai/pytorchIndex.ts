import * as https from 'https';
import * as vscode from 'vscode';
import { CUDAVariant } from './templates';

const PYTORCH_INDEX = 'https://download.pytorch.org/whl';
const PROBE_LIMIT = 6;

async function httpsGetText(url: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => data += chunk.toString());
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

interface CudaIndex {
  suffix: string;
  major: number;
  minor: number;
}

interface VariantPackages {
  torchTags?: string[];
  vision: boolean;
  audio: boolean;
}

function parseCudaIndexes(html: string): CudaIndex[] {
  const re = /href="(cu\d+)\/"/g;
  const seen = new Set<string>();
  const indexes: CudaIndex[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    const full = parseInt(match[1].replace('cu', ''));
    indexes.push({ suffix: match[1], major: Math.floor(full / 10), minor: full % 10 });
  }
  indexes.sort((a, b) => b.major - a.major || b.minor - a.minor);
  return indexes;
}

function platformPattern(): RegExp {
  if (process.platform === 'win32') return /win_amd64/i;
  if (process.platform === 'darwin') return /macosx/i;
  return /linux/i;
}

async function fetchPackagePythonTags(cudaPath: string, pkg: string): Promise<string[] | undefined> {
  try {
    const html = await httpsGetText(`${PYTORCH_INDEX}/${cudaPath}/${pkg}/`, 5000);
    const platform = platformPattern();
    const tags = new Set<string>();
    const wheelRe = /href="([^"]+\.whl)"/g;
    let match: RegExpExecArray | null;
    while ((match = wheelRe.exec(html)) !== null) {
      const fileName = decodeURIComponent(match[1]);
      if (!platform.test(fileName)) continue;
      const tagMatch = fileName.match(/-(cp\d+)-cp\d+-/i);
      if (tagMatch) tags.add(tagMatch[1].toLowerCase());
    }
    return Array.from(tags);
  } catch {
    return undefined;
  }
}

async function fetchVariantPackages(cudaPath: string): Promise<VariantPackages> {
  const [torchTags, visionTags, audioTags] = await Promise.all([
    fetchPackagePythonTags(cudaPath, 'torch'),
    fetchPackagePythonTags(cudaPath, 'torchvision'),
    fetchPackagePythonTags(cudaPath, 'torchaudio'),
  ]);
  return {
    torchTags,
    vision: (visionTags?.length ?? 0) > 0,
    audio: (audioTags?.length ?? 0) > 0,
  };
}

function buildPipList(cudaSuffix: string, vision: boolean, audio: boolean): string[] {
  const packages = ['torch'];
  if (vision) packages.push('torchvision');
  if (audio) packages.push('torchaudio');
  if (cudaSuffix !== 'cpu') {
    packages.push('--index-url', `${PYTORCH_INDEX}/${cudaSuffix}`);
  }
  return packages;
}

function cpuVariant(): CUDAVariant {
  return {
    label: vscode.l10n.t('CPU (CPU 模式)'),
    cudaVersion: 'cpu',
    extraPip: ['torch', 'torchvision', 'torchaudio'],
  };
}

function cudaVariant(index: CudaIndex, info?: VariantPackages): CUDAVariant {
  const label = index.major >= 13
    ? vscode.l10n.t('CUDA {0}.{1} (RTX 50 系列推荐)', String(index.major), String(index.minor))
    : vscode.l10n.t('CUDA {0}.{1}', String(index.major), String(index.minor));
  return {
    label,
    cudaVersion: index.suffix,
    extraPip: buildPipList(index.suffix, info?.vision ?? true, info?.audio ?? true),
    pythonTags: info?.torchTags,
  };
}

function nightlyVariant(cudaPath: string, major: number, minor: number, pythonTags?: string[]): CUDAVariant {
  return {
    label: vscode.l10n.t('Nightly (CUDA {0}.{1})', String(major), String(minor)),
    cudaVersion: 'nightly',
    extraPip: ['torch', 'torchvision', 'torchaudio', '--pre', '--index-url', `${PYTORCH_INDEX}/${cudaPath}`],
    pythonTags,
  };
}

async function resolveNightlyVariant(stable: CudaIndex[], nightly: CudaIndex[]): Promise<CUDAVariant | undefined> {
  if (nightly.length > 0) {
    const topNightly = nightly[0];
    const tags = await fetchPackagePythonTags(`nightly/${topNightly.suffix}`, 'torch');
    if (!tags || tags.length > 0) {
      return nightlyVariant(`nightly/${topNightly.suffix}`, topNightly.major, topNightly.minor, tags);
    }
    return undefined;
  }
  if (stable.length > 0) {
    const topStable = stable[0];
    const tags = await fetchPackagePythonTags(`nightly/${topStable.suffix}`, 'torch');
    if (!tags || tags.length > 0) {
      return nightlyVariant(`nightly/${topStable.suffix}`, topStable.major, topStable.minor, tags);
    }
  }
  return undefined;
}

function fallbackVariants(): CUDAVariant[] {
  return [
    cpuVariant(),
    { label: vscode.l10n.t('CUDA 13.0 (RTX 50 系列推荐)'), cudaVersion: 'cu130', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', `${PYTORCH_INDEX}/cu130`] },
    { label: 'CUDA 12.6', cudaVersion: 'cu126', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', `${PYTORCH_INDEX}/cu126`] },
    { label: 'CUDA 12.4', cudaVersion: 'cu124', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', `${PYTORCH_INDEX}/cu124`] },
    { label: 'CUDA 12.1', cudaVersion: 'cu121', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', `${PYTORCH_INDEX}/cu121`] },
    { label: 'Nightly', cudaVersion: 'nightly', extraPip: ['torch', 'torchvision', 'torchaudio', '--pre', '--index-url', `${PYTORCH_INDEX}/nightly/cu130`] },
  ];
}

export async function fetchPyTorchCudaVariants(): Promise<CUDAVariant[]> {
  try {
    const [stableHtml, nightlyHtml] = await Promise.all([
      httpsGetText(`${PYTORCH_INDEX}/`),
      httpsGetText(`${PYTORCH_INDEX}/nightly/`).catch(() => '')
    ]);
    const stable = parseCudaIndexes(stableHtml);
    const nightly = nightlyHtml ? parseCudaIndexes(nightlyHtml) : [];

    const probed = stable.slice(0, PROBE_LIMIT);
    const probedResults = await Promise.all(probed.map(index => fetchVariantPackages(index.suffix)));
    const packageMap = new Map<string, VariantPackages>();
    probed.forEach((index, i) => packageMap.set(index.suffix, probedResults[i]));

    const variants: CUDAVariant[] = [cpuVariant()];
    for (const index of stable) {
      const info = packageMap.get(index.suffix);
      if (info?.torchTags && info.torchTags.length === 0) {
        // 该索引下没有适配当前平台的 torch 轮子（例如刚出现但尚未发布对应版本）
        continue;
      }
      variants.push(cudaVariant(index, info));
    }

    const nightlyEntry = await resolveNightlyVariant(stable, nightly);
    if (nightlyEntry) variants.push(nightlyEntry);

    return variants;
  } catch {
    return fallbackVariants();
  }
}
