import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './config';
import { formatBytes } from '../util/format';
import { DiskSpace, DiskSpaceReport, InodeUsage } from '../models/types';

export const isWindows = (): boolean => process.platform === 'win32';

type PlatformErrorHandler = (context: string, err: unknown) => void;

let platformErrorHandler: PlatformErrorHandler | undefined;

/**
 * platform.ts is a leaf module with no Logger dependency. The extension host
 * wires its diagnostics here so swallowed probe / mkdir failures still reach
 * the output channel instead of disappearing silently.
 */
export function setPlatformErrorHandler(handler: PlatformErrorHandler | undefined): void {
  platformErrorHandler = handler;
}

function reportError(context: string, err: unknown): void {
  try {
    platformErrorHandler?.(context, err);
  } catch {
    // never let diagnostics throw
  }
}

/**
 * Quote a value for safe interpolation into a POSIX shell command by wrapping
 * it in single quotes and escaping embedded single quotes. Prevents an
 * environment/problem name containing spaces or metacharacters from being
 * interpreted as shell syntax.
 */
export function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

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

/**
 * The subset of `conda info --json` output needed to resolve environment paths.
 */
export interface CondaInfoJson {
  root_prefix?: string;
  envs?: string[];
  envs_dirs?: string[];
  default_environment?: string;
}

/**
 * Resolve the on-disk path of an environment from `conda info --json`.
 * Single source of truth shared by size/package analysis and interpreter lookup.
 */
export function resolveEnvPathFromInfo(info: CondaInfoJson, envName: string): string {
  const rootPrefix = info.root_prefix || '';
  if (!envName) return '';
  if (envName === 'base' || envName === rootPrefix) return rootPrefix;
  for (const dir of info.envs_dirs || []) {
    const candidate = path.join(dir, envName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return rootPrefix ? path.join(rootPrefix, 'envs', envName) : '';
}

export interface PipWorkDirs {
  tmpDir: string;
  cacheDir: string;
}

/**
 * Environment-local pip scratch directories.
 *
 * pip downloads into these before installing, so keeping them inside the
 * target environment (a) avoids polluting the system temp dir and (b) gives
 * the spawn liveness watcher a directory whose byte growth proves the
 * download is still alive even when pip prints nothing.
 */
export function getPipWorkDirs(envName: string, create = true): PipWorkDirs {
  const envPath = getEnvPath(envName);
  if (!envPath) return { tmpDir: '', cacheDir: '' };
  const tmpDir = path.join(envPath, '.pip-tmp');
  const cacheDir = path.join(envPath, '.pip-cache');
  if (create) {
    for (const dir of [tmpDir, cacheDir]) {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        // callers fall back to the system temp directory
        reportError(vscode.l10n.t('创建 pip 工作目录失败'), err);
      }
    }
  }
  return { tmpDir, cacheDir };
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
    // Unreadable entries contribute nothing. Deliberately not reported: this
    // walks every file in an environment (and runs every 2s from the progress
    // poller), so one permission-denied file would flood the output channel.
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
    } catch (err) {
      // fall through to legacy probes
      reportError(vscode.l10n.t('读取磁盘空间失败'), err);
    }
  }
  try {
    if (isWindows()) {
      // wmic was removed from recent Windows builds, so query the volume via
      // .NET DriveInfo instead. `root` already ends with a backslash.
      const root = path.parse(target).root;
      const script = `$d=[System.IO.DriveInfo]::new('${root}');Write-Output $d.AvailableFreeSpace;Write-Output $d.TotalSize`;
      const out = child_process.execSync(
        `powershell -NoProfile -NonInteractive -Command "${script}"`,
        { timeout: 5000, windowsHide: true }
      ).toString();
      const [freeStr, totalStr] = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const free = parseInt(freeStr) || 0;
      const total = parseInt(totalStr) || 0;
      if (free > 0 || total > 0) return { free, total, freeGB: formatBytes(free) };
    } else {
      const out = child_process.execSync(`df -B1 "${target}" 2>/dev/null | tail -1`, { timeout: 5000 }).toString();
      const parts = out.trim().split(/\s+/);
      if (parts.length >= 4) {
        const total = parseInt(parts[1]) || 0;
        const free = parseInt(parts[3]) || 0;
        return { free, total, freeGB: formatBytes(free) };
      }
    }
  } catch (err) {
    reportError(vscode.l10n.t('磁盘空间探测失败'), err);
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
  } catch (err) {
    reportError(vscode.l10n.t('inode 探测失败'), err);
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
