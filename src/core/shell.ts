import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCondaPath, getEnvPath, getEnvPipPath, isWindows } from './platform';

export interface SpawnCallbacks {
  onLine: (line: string) => void;
  onError?: (err: Error) => void;
  timeout?: number;
  timeoutMessage?: string;
  env?: NodeJS.ProcessEnv;
}

function resolveExecutable(file: string, args: string[]): { command: string; args: string[] } {
  if (isWindows() && /\.(bat|cmd)$/i.test(file)) {
    return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', file, ...args] };
  }
  return { command: file, args };
}

export function execShell(command: string, timeout = 30000): Promise<string> {
  return new Promise((resolve) => {
    child_process.exec(command, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      shell: isWindows() ? 'powershell.exe' : undefined,
    }, (err, stdout, stderr) => {
      resolve(err ? (stderr || stdout) : stdout.trim());
    });
  });
}

export function execFileText(file: string, args: string[], timeout = 30000): Promise<string> {
  const resolved = resolveExecutable(file, args);
  return new Promise((resolve) => {
    child_process.execFile(resolved.command, resolved.args, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      resolve(err ? String(stderr || stdout) : stdout.trim());
    });
  });
}

export function execFileChecked(file: string, args: string[], timeout = 30000): Promise<string> {
  const resolved = resolveExecutable(file, args);
  return new Promise((resolve, reject) => {
    child_process.execFile(resolved.command, resolved.args, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(String(stderr || '').trim() || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export function execConda(args: string[], timeout = 60000): Promise<string> {
  return execFileChecked(getCondaPath(), args, timeout);
}

export function spawnProcess(file: string, args: string[], callbacks: SpawnCallbacks): Promise<number> {
  const resolved = resolveExecutable(file, args);
  const timeout = callbacks.timeout ?? 300000;
  const timeoutMessage = callbacks.timeoutMessage ?? vscode.l10n.t('安装超时');
  return new Promise((resolve, reject) => {
    const child = child_process.spawn(resolved.command, resolved.args, {
      env: callbacks.env ? { ...callbacks.env } : { ...process.env },
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(timeoutMessage));
    }, timeout);
    if (child.stdout) streamLines(child.stdout, callbacks.onLine);
    if (child.stderr) streamLines(child.stderr, callbacks.onLine);
    child.on('error', (err) => {
      clearTimeout(timer);
      callbacks.onError?.(err);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const err = new Error(vscode.l10n.t('进程退出码: {0}', String(code ?? '')));
        callbacks.onError?.(err);
        reject(err);
        return;
      }
      resolve(code || 0);
    });
  });
}

export function spawnConda(
  args: string[],
  onLine: (line: string) => void,
  onError?: (err: Error) => void,
  timeout = 300000
): Promise<number> {
  return spawnProcess(getCondaPath(), args, {
    onLine,
    onError,
    timeout,
    timeoutMessage: vscode.l10n.t('安装超时'),
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
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (envPath) {
    const pipTmpDir = path.join(envPath, '.pip-tmp');
    const pipCacheDir = path.join(envPath, '.pip-cache');
    try {
      if (!fs.existsSync(pipTmpDir)) fs.mkdirSync(pipTmpDir, { recursive: true });
      if (!fs.existsSync(pipCacheDir)) fs.mkdirSync(pipCacheDir, { recursive: true });
      env.TMPDIR = pipTmpDir;
      env.PIP_CACHE_DIR = pipCacheDir;
      if (isWindows()) {
        env.TEMP = pipTmpDir;
        env.TMP = pipTmpDir;
      }
    } catch {
      // fall back to the system temp directory
    }
  }
  return spawnProcess(pipPath, pipArgs, {
    onLine,
    onError,
    timeout,
    timeoutMessage: vscode.l10n.t('pip 安装超时'),
    env,
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
      const clean = line.replace(/\r/g, '').trim();
      if (clean) onLine(clean);
    }
  });
  stream.on('end', () => {
    const clean = buf.replace(/\r/g, '').trim();
    if (clean) onLine(clean);
  });
}
