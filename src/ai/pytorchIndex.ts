import * as https from 'https';
import { CUDAVariant } from './templates';

const PYTORCH_INDEX = 'https://download.pytorch.org/whl';

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

async function checkAvailablePackages(cudaSuffix: string): Promise<{ vision: boolean; audio: boolean }> {
  const hasWheel = async (pkg: string): Promise<boolean> => {
    try {
      const html = await httpsGetText(`${PYTORCH_INDEX}/${cudaSuffix}/${pkg}/`, 5000);
      return /cp312.*linux_x86_64/.test(html);
    } catch {
      return false;
    }
  };
  const [vision, audio] = await Promise.all([hasWheel('torchvision'), hasWheel('torchaudio')]);
  return { vision, audio };
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

function nightlyVariant(suffix: string, major: number, minor: number): CUDAVariant {
  return {
    label: `Nightly (CUDA ${major}.${minor})`,
    cudaVersion: 'nightly',
    extraPip: ['torch', 'torchvision', 'torchaudio', '--pre', '--index-url', `${PYTORCH_INDEX}/nightly/${suffix}`],
  };
}

function fallbackVariants(): CUDAVariant[] {
  return [
    { label: 'CPU (CPU 模式)', cudaVersion: 'cpu', extraPip: ['torch', 'torchvision', 'torchaudio'] },
    { label: 'CUDA 13.0 (RTX 50 系列推荐)', cudaVersion: 'cu130', extraPip: ['torch', 'torchvision', 'torchaudio', '--index-url', `${PYTORCH_INDEX}/cu130`] },
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

    const top = stable.slice(0, 6);
    const packageResults = await Promise.all(top.map(index => checkAvailablePackages(index.suffix)));
    const packageMap = new Map<string, { vision: boolean; audio: boolean }>();
    top.forEach((index, i) => packageMap.set(index.suffix, packageResults[i]));

    const variants: CUDAVariant[] = [
      { label: 'CPU (CPU 模式)', cudaVersion: 'cpu', extraPip: ['torch', 'torchvision', 'torchaudio'] },
      ...stable.map(index => {
        const check = packageMap.get(index.suffix);
        return {
          label: `CUDA ${index.major}.${index.minor}${index.major >= 13 ? ' (RTX 50 系列推荐)' : ''}`,
          cudaVersion: index.suffix,
          extraPip: buildPipList(index.suffix, check?.vision ?? true, check?.audio ?? true),
        };
      }),
    ];

    if (nightly.length > 0) {
      const topNightly = nightly[0];
      variants.push(nightlyVariant(topNightly.suffix, topNightly.major, topNightly.minor));
    } else if (stable.length > 0) {
      const topStable = stable[0];
      variants.push(nightlyVariant(topStable.suffix, topStable.major, topStable.minor));
    }
    return variants;
  } catch {
    return fallbackVariants();
  }
}
