import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface CondaEnvironment {
  name: string;
  path: string;
  pythonVersion: string;
  packages: number;
  size: string;
  active: boolean;
  created: Date;
  lastUsed: Date;
}

export interface CondaInfo {
  condaVersion: string;
  pythonVersion: string;
  envs: CondaEnvironment[];
  defaultEnv: string;
  condaPath: string;
}

export interface PackageInfo {
  name: string;
  version: string;
  channel: string;
  size: string;
  dependencies: string[];
}

export interface HealthCheckResult {
  score: number;
  checks: HealthCheckItem[];
}

export interface HealthCheckItem {
  name: string;
  status: 'ok' | 'warning' | 'error' | 'info';
  message: string;
}

export function getCondaPath(): string {
  const config = vscode.workspace.getConfiguration('conda-assistant');
  const customPath = config.get<string>('condaPath');
  if (customPath) return customPath;
  if (process.platform === 'win32') {
    const commonPaths = [
      path.join(process.env.USERPROFILE || '', 'miniconda3', 'Scripts', 'conda.exe'),
      path.join(process.env.USERPROFILE || '', 'anaconda3', 'Scripts', 'conda.exe'),
      path.join(process.env.USERPROFILE || '', 'miniforge3', 'Scripts', 'conda.exe'),
      path.join(process.env.USERPROFILE || '', 'mambaforge', 'Scripts', 'conda.exe'),
      'C:\\ProgramData\\miniconda3\\Scripts\\conda.exe',
      'C:\\ProgramData\\anaconda3\\Scripts\\conda.exe',
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) return p;
    }
    const envPath = process.env.PATH || '';
    for (const dir of envPath.split(';')) {
      const candidate = path.join(dir, 'conda.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  } else {
    const home = process.env.HOME || '/home';
    const commonPaths = [
      path.join(home, 'miniconda3', 'bin', 'conda'),
      path.join(home, 'anaconda3', 'bin', 'conda'),
      path.join(home, 'miniforge3', 'bin', 'conda'),
      path.join(home, 'mambaforge', 'bin', 'conda'),
      '/opt/miniconda3/bin/conda',
      '/opt/anaconda3/bin/conda',
      '/usr/local/miniconda3/bin/conda',
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) return p;
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
  const envDir = path.join(prefix, 'envs', envName);
  return envDir;
}

export function getEnvPipPath(envName: string): string {
  const envPath = getEnvPath(envName);
  if (!envPath) return 'pip';
  if (process.platform === 'win32') {
    const pip = path.join(envPath, 'Scripts', 'pip.exe');
    if (fs.existsSync(pip)) return pip;
    return path.join(envPath, 'Scripts', 'pip');
  }
  const pip = path.join(envPath, 'bin', 'pip');
  if (fs.existsSync(pip)) return pip;
  return 'pip';
}

export function execConda(args: string[], timeout = 60000): Promise<string> {
  const condaPath = getCondaPath();
  const quoted = args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ');
  return new Promise((resolve, reject) => {
    const cmd = `"${condaPath}" ${quoted}`;
    child_process.exec(cmd, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env }
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export function execCommand(cmd: string, timeout = 30000): Promise<string> {
  return new Promise((resolve) => {
    child_process.exec(cmd, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === 'win32' ? 'powershell.exe' : undefined
    }, (err, stdout, stderr) => {
      if (err) {
        resolve(stderr || stdout);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export function spawnPipInEnv(
  envName: string,
  pipArgs: string[],
  onLine: (line: string) => void,
  onError?: (err: Error) => void,
  timeout = 300000
): Promise<number> {
  const pipPath = getEnvPipPath(envName);
  const envPath = getEnvPath(envName);
  const pipEnv = { ...process.env };
  if (envPath) {
    const pipTmpDir = path.join(envPath, '.pip-tmp');
    try {
      if (!fs.existsSync(pipTmpDir)) fs.mkdirSync(pipTmpDir, { recursive: true });
      pipEnv.TMPDIR = pipTmpDir;
      pipEnv.PIP_CACHE_DIR = path.join(envPath, '.pip-cache');
      if (!fs.existsSync(pipEnv.PIP_CACHE_DIR)) fs.mkdirSync(pipEnv.PIP_CACHE_DIR, { recursive: true });
    } catch { /* tmpdir fallback */ }
  }
  return new Promise((resolve, reject) => {
    const child = child_process.spawn(pipPath, pipArgs, {
      shell: true,
      env: pipEnv,
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('pip 安装超时'));
    }, timeout);
    streamLines(child.stdout, onLine);
    streamLines(child.stderr, onLine);
    child.on('error', (err) => {
      clearTimeout(timer);
      if (onError) onError(err);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const err = new Error(`pip 退出码: ${code}`);
        if (onError) onError(err);
        reject(err);
        return;
      }
      resolve(code || 0);
    });
  });
}

function stripANSI(text: string): string {
  let clean = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  clean = clean.replace(/\x08/g, '');
  clean = clean.replace(/(?:[-\\|/][ \t]+){2,}/g, '');
  clean = clean.replace(/[-\\|/][ \t]+(?=(?:done|failed|error))/gi, '');
  return clean;
}

function streamLines(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void
): void {
  let buf = '';
  stream.on('data', (data: Buffer) => {
    buf += stripANSI(data.toString());
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const cl = line.replace(/\r/g, '').trim();
      if (cl) onLine(cl);
    }
  });
  stream.on('end', () => {
    const cl = buf.replace(/\r/g, '').trim();
    if (cl) onLine(cl);
  });
}

export function spawnConda(
  args: string[],
  onLine: (line: string) => void,
  onError?: (err: Error) => void,
  timeout = 300000
): Promise<number> {
  const condaPath = getCondaPath();
  return new Promise((resolve, reject) => {
    const child = child_process.spawn(condaPath, args, {
      shell: true,
      env: { ...process.env },
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('安装超时'));
    }, timeout);
    streamLines(child.stdout, onLine);
    streamLines(child.stderr, onLine);
    child.on('error', (err) => {
      clearTimeout(timer);
      if (onError) onError(err);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const err = new Error(`进程退出码: ${code}`);
        if (onError) onError(err);
        reject(err);
        return;
      }
      resolve(code || 0);
    });
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export interface DiskSpace {
  free: number;
  total: number;
  freeGB: string;
}

export function getFreeDiskSpace(checkPath: string = '/'): DiskSpace {
  try {
    if (process.platform === 'win32') {
      const drive = checkPath.split(':')[0] + ':';
      const out = child_process.execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace,Size /format:csv`, { timeout: 5000 }).toString();
      const lines = out.split('\n').filter(l => l.trim());
      for (const line of lines) {
        if (line.includes(drive)) {
          const parts = line.split(',').map((s: string) => s.trim());
          const free = parseInt(parts[1]) || 0;
          const total = parseInt(parts[2]) || 0;
          return { free, total, freeGB: formatBytes(free) };
        }
      }
    } else {
      const out = child_process.execSync(`df -B1 "${checkPath}" 2>/dev/null | tail -1`, { timeout: 5000 }).toString();
      const parts = out.trim().split(/\s+/);
      if (parts.length >= 4) {
        const total = parseInt(parts[1]) || 0;
        const free = parseInt(parts[3]) || 0;
        return { free, total, freeGB: formatBytes(free) };
      }
    }
  } catch { /* fallthrough */ }
  return { free: 0, total: 0, freeGB: '?' };
}

export interface DiskSpaceReport {
  home: DiskSpace;
  tmp: DiskSpace;
  inodes: string;
  cache: DiskSpace;
  warnings: string[];
  sufficient: boolean;
}

export function checkInstallSpace(envName: string, estimatedGB: number = 8): DiskSpaceReport {
  const warnings: string[] = [];
  const homePath = process.env.HOME || '/home';
  const envPath = getEnvPath(envName);
  const tmpPath = '/tmp';
  const cachePath = path.join(homePath, '.cache', 'pip');
  const installPath = envPath || homePath;

  const installSpace = getFreeDiskSpace(installPath);
  const homeSpace = getFreeDiskSpace(homePath);
  const tmpSpace = getFreeDiskSpace(tmpPath);

  let sufficient = true;
  const minBytes = estimatedGB * 1024 ** 3;

  if (installSpace.free > 0 && installSpace.free < minBytes) {
    warnings.push(`安装目标 ${installPath} 剩余 ${installSpace.freeGB}，建议 ${estimatedGB}GB`);
    sufficient = false;
  }
  if (tmpSpace.free > 0 && tmpSpace.free < 2 * 1024 ** 3) {
    warnings.push(`临时目录 /tmp 剩余 ${tmpSpace.freeGB}（< 2GB），pip 下载会失败`);
    sufficient = false;
  }

  let inodes = '?';
  try {
    const out = child_process.execSync(`df -i "${installPath}" 2>/dev/null | tail -1`, { timeout: 5000 }).toString();
    const parts = out.trim().split(/\s+/);
    if (parts.length >= 5) {
      const used = parseInt(parts[2]) || 0;
      const total = parseInt(parts[1]) || 0;
      const pct = total > 0 ? Math.round(used / total * 100) : 0;
      inodes = `${used}/${total} (${pct}%)`;
      if (pct >= 90) {
        warnings.push(`inode 使用率 ${pct}%（文件数量过多），可能导致 ENOSPC`);
      }
    }
  } catch { /* ignore */ }

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

export function parseCondaEnvList(output: string): CondaEnvironment[] {
  const envs: CondaEnvironment[] = [];
  const lines = output.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const name = parts[0].replace('*', '').trim();
    const envPath = parts[parts.length - 1];
    const active = parts[0].includes('*');
    envs.push({
      name,
      path: envPath,
      pythonVersion: '',
      packages: 0,
      size: '',
      active,
      created: new Date(),
      lastUsed: new Date()
    });
  }
  return envs;
}
