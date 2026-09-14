import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './config';
import { formatBytes } from '../util/format';
import { DiskSpace, DiskSpaceReport, InodeUsage } from '../models/types';

export const isWindows = (): boolean => process.platform === 'win32';

export function homeDir(): string {
  return os.homedir() || process.env.HOME || process.env.USERPROFILE || (isWindows() ? 'C:\\' : '/home');
}

export function tmpDir(): string {
  return os.tmpdir() || (isWindows() ? path.join(homeDir(), 'AppData', 'Local', 'Temp') : '/tmp');
}

export function pipCacheDir(): string {
  if (isWindows()) {
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir(), 'AppData', 'Local');
    return path.join(localAppData, 'pip', 'Cache');
  }
  return path.join(homeDir(), '.cache', 'pip');
}

export function getCondaPath(): string {
  const customPath = getConfig().condaPath;
  if (customPath) return customPath;

  const candidates = isWindows()
    ? [
        path.join(process.env.USERPROFILE || homeDir(), 'miniconda3', 'Scripts', 'conda.exe'),
        path.join(process.env.USERPROFILE || homeDir(), 'anaconda3', 'Scripts', 'conda.exe'),
        path.join(process.env.USERPROFILE || homeDir(), 'miniforge3', 'Scripts', 'conda.exe'),
        path.join(process.env.USERPROFILE || homeDir(), 'mambaforge', 'Scripts', 'conda.exe'),
        'C:\\ProgramData\\miniconda3\\Scripts\\conda.exe',
        'C:\\ProgramData\\anaconda3\\Scripts\\conda.exe',
      ]
    : [
        path.join(homeDir(), 'miniconda3', 'bin', 'conda'),
        path.join(homeDir(), 'anaconda3', 'bin', 'conda'),
        path.join(homeDir(), 'miniforge3', 'bin', 'conda'),
        path.join(homeDir(), 'mambaforge', 'bin', 'conda'),
        '/opt/miniconda3/bin/conda',
        '/opt/anaconda3/bin/conda',
        '/usr/local/miniconda3/bin/conda',
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  if (isWindows()) {
    for (const dir of (process.env.PATH || '').split(';')) {
      if (!dir) continue;
      const candidate = path.join(dir, 'conda.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return 'conda';
}

export function getCondaPrefix(): string {
  const condaPath = getCondaPath();
  if (condaPath === 'conda') return '';
  return path.dirname(path.dirname(condaPath));
}

export function getEnvPath(envName: string): string {
  const prefix = getCondaPrefix();
  if (!prefix) return '';
  if (envName === 'base') return prefix;
  return path.join(prefix, 'envs', envName);
}

export function getEnvPipPath(envName: string): string {
  const envPath = getEnvPath(envName);
  if (!envPath) return 'pip';
  if (isWindows()) {
    const pip = path.join(envPath, 'Scripts', 'pip.exe');
    if (fs.existsSync(pip)) return pip;
    return path.join(envPath, 'Scripts', 'pip');
  }
  const pip = path.join(envPath, 'bin', 'pip');
  if (fs.existsSync(pip)) return pip;
  return 'pip';
}

export function getEnvPythonPath(envName: string): string | undefined {
  const prefix = getCondaPrefix();
  if (!prefix) return undefined;
  const envPath = envName === 'base' ? prefix : path.join(prefix, 'envs', envName);
  const pyPath = isWindows() ? path.join(envPath, 'python.exe') : path.join(envPath, 'bin', 'python');
  return fs.existsSync(pyPath) ? pyPath : undefined;
}

export async function getDirectorySize(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirectorySize(fullPath);
      } else if (entry.isFile()) {
        total += fs.statSync(fullPath).size;
      }
    }
  } catch {
    // unreadable entries contribute nothing
  }
  return total;
}

type StatFsLike = { bsize?: number; blocks?: number; bfree?: number; bavail?: number };

function nearestExistingPath(target: string): string {
  let current = isWindows() && /^[A-Za-z]:$/.test(target) ? target + path.sep : target;
  while (current && !fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (current && fs.existsSync(current)) return current;
  return isWindows() ? homeDir() : '/';
}

export function getFreeDiskSpace(checkPath: string = '/'): DiskSpace {
  const target = nearestExistingPath(checkPath);
  const statfsSync = (fs as unknown as { statfsSync?: (p: string) => StatFsLike }).statfsSync;
  if (typeof statfsSync === 'function') {
    try {
      const stats = statfsSync(target);
      const blockSize = Number(stats.bsize) || 0;
      const free = Number(stats.bavail ?? stats.bfree) * blockSize;
      const total = Number(stats.blocks) * blockSize;
      if (blockSize > 0) return { free, total, freeGB: formatBytes(free) };
    } catch {
      // fall through to legacy probes
    }
  }
  try {
    if (isWindows()) {
      const drive = path.parse(target).root.split(':')[0] + ':';
      const out = child_process.execSync(
        `wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace,Size /format:csv`,
        { timeout: 5000 }
      ).toString();
      for (const line of out.split('\n').filter(l => l.trim())) {
        if (line.includes(drive)) {
          const parts = line.split(',').map(s => s.trim());
          const free = parseInt(parts[1]) || 0;
          const total = parseInt(parts[2]) || 0;
          return { free, total, freeGB: formatBytes(free) };
        }
      }
    } else {
      const out = child_process.execSync(`df -B1 "${target}" 2>/dev/null | tail -1`, { timeout: 5000 }).toString();
      const parts = out.trim().split(/\s+/);
      if (parts.length >= 4) {
        const total = parseInt(parts[1]) || 0;
        const free = parseInt(parts[3]) || 0;
        return { free, total, freeGB: formatBytes(free) };
      }
    }
  } catch {
    // ignore probe failures
  }
  return { free: 0, total: 0, freeGB: '?' };
}

export function getInodeUsage(checkPath: string): InodeUsage | null {
  if (isWindows()) return null;
  try {
    const out = child_process.execSync(`df -i "${checkPath}" 2>/dev/null | tail -1`, { timeout: 5000 }).toString();
    const parts = out.trim().split(/\s+/);
    if (parts.length >= 5) {
      const used = parseInt(parts[2]) || 0;
      const total = parseInt(parts[1]) || 0;
      const percent = total > 0 ? Math.round((used / total) * 100) : 0;
      return { used, total, percent };
    }
  } catch {
    // ignore probe failures
  }
  return null;
}

export function checkInstallSpace(envName: string, estimatedGB = 8): DiskSpaceReport {
  const warnings: string[] = [];
  const homePath = homeDir();
  const installPath = getEnvPath(envName) || homePath;
  const tmpPath = tmpDir();
  const cachePath = pipCacheDir();

  const installSpace = getFreeDiskSpace(installPath);
  const homeSpace = getFreeDiskSpace(homePath);
  const tmpSpace = getFreeDiskSpace(tmpPath);

  let sufficient = true;
  const minBytes = estimatedGB * 1024 ** 3;

  if (installSpace.free > 0 && installSpace.free < minBytes) {
    warnings.push(vscode.l10n.t('安装目标 {0} 剩余 {1}，建议 {2}GB', installPath, installSpace.freeGB, String(estimatedGB)));
    sufficient = false;
  }
  if (tmpSpace.free > 0 && tmpSpace.free < 2 * 1024 ** 3) {
    warnings.push(vscode.l10n.t('临时目录 {0} 剩余 {1}（< 2GB），pip 下载会失败', tmpPath, tmpSpace.freeGB));
    sufficient = false;
  }

  let inodes = '?';
  const inodeUsage = getInodeUsage(installPath);
  if (inodeUsage) {
    inodes = `${inodeUsage.used}/${inodeUsage.total} (${inodeUsage.percent}%)`;
    if (inodeUsage.percent >= 90) {
      warnings.push(vscode.l10n.t('inode 使用率 {0}%（文件数量过多），可能导致 ENOSPC', String(inodeUsage.percent)));
    }
  }

  const cacheSpace = getFreeDiskSpace(cachePath);

  return {
    home: homeSpace,
    tmp: tmpSpace,
    inodes,
    cache: cacheSpace,
    warnings,
    sufficient,
  };
}
