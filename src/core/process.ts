import * as child_process from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { getDirectorySize, isWindows } from './platform';

export interface SpawnCallbacks {
  onLine: (line: string) => void;
  onError?: (err: Error) => void;
  timeout?: number;
  timeoutMessage?: string;
  env?: NodeJS.ProcessEnv;
  cancelToken?: vscode.CancellationToken;
  /**
   * Directories whose byte growth counts as "the process is alive".
   * Some tools (pip >= 25) print nothing to stdout during a long download,
   * so an output-based inactivity timeout would kill a perfectly healthy
   * transfer. Watching where the tool writes (cache/temp dirs) makes the
   * inactivity timer treat real downloads as activity.
   */
  progressDirs?: string[];
}

function resolveExecutable(file: string, args: string[]): { command: string; args: string[] } {
  if (isWindows() && /\.(bat|cmd)$/i.test(file)) {
    return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', file, ...args] };
  }
  return { command: file, args };
}

/**
 * Kill the child and its entire process tree.
 *
 * The child is spawned with `detached: true` on POSIX, i.e. it leads its own
 * process group, so `process.kill(-pid)` takes every descendant down with it.
 * A plain `child.kill()` only signals the direct child: conda handles SIGTERM
 * with a graceful "CondaSignalInterrupt" shutdown and can keep running (and
 * keep its download children alive) for a long time, which kept the progress
 * notification open. This helper escalates to SIGKILL after a grace period.
 */
function killProcessTree(child: child_process.ChildProcess, graceMs = 5000): void {
  const pid = child.pid;
  if (!pid) {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
    return;
  }
  try {
    if (isWindows()) {
      // taskkill /T kills every descendant, /F makes sure it actually dies
      child_process.execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
      return;
    }
    try { process.kill(-pid, 'SIGTERM'); } catch { /* no such process group */ }
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
    setTimeout(() => {
      try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }, graceMs).unref();
  } catch { /* ignore kill failures */ }
}

interface CollectOutput {
  stdout: string;
  stderr: string;
  code: number | null;
  error: Error | null;
}

function shellCommand(): string {
  return isWindows() ? process.env.ComSpec || 'cmd.exe' : '/bin/sh';
}

function spawnCollect(
  file: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; shell?: boolean } = {}
): { child: child_process.ChildProcess; finished: Promise<CollectOutput> } {
  const spawnOptions: child_process.SpawnOptions = {
    env: opts.env ? { ...opts.env } : { ...process.env },
    detached: !isWindows(),
    windowsHide: true,
  };
  const child = opts.shell
    ? child_process.spawn(shellCommand(), isWindows() ? ['/d', '/s', '/c', file] : ['-c', file], spawnOptions)
    : child_process.spawn(file, args, spawnOptions);
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  const finished = new Promise<CollectOutput>((resolve) => {
    // Do NOT inject err.message into stderr: Node's spawn errors look like
    // "spawn wsl.exe ENOENT", and callers that resolve with stderr on failure
    // would feed that text into output parsers (producing phantom entries).
    // The Error stays in the `error` field for callers that reject (execFileChecked).
    child.on('error', (err) => resolve({ stdout, stderr, code: null, error: err }));
    child.on('close', (code) => {
      const error = code === 0
        ? null
        : new Error(
          stderr.trim()
          || (code !== null ? vscode.l10n.t('进程退出码: {0}', String(code)) : vscode.l10n.t('进程被终止'))
        );
      resolve({ stdout, stderr, code, error });
    });
  });
  return { child, finished };
}

interface RunResult {
  stdout: string;
  stderr: string;
  error: Error | null;
  timedOut: boolean;
}

/**
 * Run a process, collecting its output, and settle the promise no matter what.
 *
 * The old implementation relied on child_process' built-in `timeout` option:
 * on timeout it only sent a signal to the direct child, and if that child did
 * not die promptly the callback never fired — the promise stayed pending
 * forever, which kept `withProgress` notifications open (the "timeout shown
 * but the window never closes" bug). Here the timeout always settles the
 * promise and kills the whole process tree.
 */
function runWithTimeout(
  file: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; shell?: boolean },
  timeout: number
): Promise<RunResult> {
  const { child, finished } = spawnCollect(file, args, opts);
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killProcessTree(child);
      resolve({ stdout: '', stderr: '', error: null, timedOut: true });
    }, timeout);
    void finished.then((out) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout: out.stdout, stderr: out.stderr, error: out.error, timedOut: false });
    });
  });
}

export function execShell(command: string, timeout = 30000): Promise<string> {
  return runWithTimeout(command, [], { shell: true }, timeout).then((out) => {
    if (out.timedOut || out.error) return out.stderr || out.stdout || '';
    return out.stdout.trim();
  });
}

export function execFileText(file: string, args: string[], timeout = 30000): Promise<string> {
  return runWithTimeout(file, args, {}, timeout).then((out) => {
    if (out.timedOut || out.error) return out.stderr || out.stdout || '';
    return out.stdout.trim();
  });
}

export function execFileChecked(file: string, args: string[], timeout = 30000): Promise<string> {
  return runWithTimeout(file, args, {}, timeout).then((out) => {
    if (out.timedOut) throw new Error(vscode.l10n.t('执行超时: {0}', file));
    if (out.error) throw out.error;
    return out.stdout.trim();
  });
}

/**
 * Spawn a process with streamed output.
 *
 * The timeout is an *inactivity* timeout: every line of output resets the
 * timer, so an actively downloading conda/pip is never killed (previously a
 * hard 10-minute deadline killed still-progressing downloads, leaving the
 * environment half-created and the terminal still flushing output). Only a
 * process that is completely silent for `timeout` ms is terminated.
 */
export function spawnProcess(file: string, args: string[], callbacks: SpawnCallbacks): Promise<number> {
  const resolved = resolveExecutable(file, args);
  const timeout = callbacks.timeout ?? 300000;
  const timeoutMessage = callbacks.timeoutMessage ?? vscode.l10n.t('安装超时');
  return new Promise((resolve, reject) => {
    const child = child_process.spawn(resolved.command, resolved.args, {
      env: callbacks.env ? { ...callbacks.env } : { ...process.env },
      detached: !isWindows(),
      windowsHide: true,
    });
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let cancelSub: vscode.Disposable | undefined;

    // Byte-level liveness: if the process writes data into any watched dir,
    // we treat it as activity even when it prints nothing (silent pip). Must
    // be declared before scheduleTimeout (which calls stopWatcher on timeout).
    const progressDirs = callbacks.progressDirs || [];
    let watcher: NodeJS.Timeout | undefined;
    let lastDirBytes = 0;
    const stopWatcher = () => {
      if (watcher) {
        clearInterval(watcher);
        watcher = undefined;
      }
    };

    const scheduleTimeout = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cancelSub?.dispose();
        stopWatcher();
        killProcessTree(child);
        const err = new Error(timeoutMessage);
        callbacks.onError?.(err);
        reject(err);
      }, timeout);
    };
    scheduleTimeout();

    if (progressDirs.length > 0) {
      watcher = setInterval(() => {
        void (async () => {
          let total = 0;
          for (const dir of progressDirs) {
            if (!fs.existsSync(dir)) continue;
            try { total += await getDirectorySize(dir); } catch { /* unreadable */ }
          }
          if (total > lastDirBytes) {
            // bytes grew → the process is downloading/installing, reset timer
            lastDirBytes = total;
            scheduleTimeout();
            return;
          }
          lastDirBytes = total;
        })();
      }, 2000);
    }

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      cancelSub?.dispose();
      stopWatcher();
      fn();
    };

    // the user clicked "Cancel" on the progress notification
    cancelSub = callbacks.cancelToken?.onCancellationRequested(() => {
      finish(() => {
        killProcessTree(child);
        const err = new Error(vscode.l10n.t('已取消'));
        callbacks.onError?.(err);
        reject(err);
      });
    });

    const onLine = (line: string) => {
      scheduleTimeout(); // any output counts as activity
      callbacks.onLine(line);
    };
    // Progress bars (conda/pip) often refresh with \r instead of \n, so also
    // treat raw chunks as activity — otherwise a live download could look
    // "silent" to the inactivity timer.
    const onData = () => scheduleTimeout();
    if (child.stdout) {
      child.stdout.on('data', onData);
      streamLines(child.stdout, onLine);
    }
    if (child.stderr) {
      child.stderr.on('data', onData);
      streamLines(child.stderr, onLine);
    }
    child.on('error', (err) => {
      finish(() => {
        callbacks.onError?.(err);
        reject(err);
      });
    });
    child.on('close', (code) => {
      finish(() => {
        if (code !== 0) {
          const err = new Error(vscode.l10n.t('进程退出码: {0}', String(code ?? '')));
          callbacks.onError?.(err);
          reject(err);
          return;
        }
        resolve(code || 0);
      });
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
  // Progress bars (\r) must be flushed in real time, not only on \n or 'end',
  // otherwise live speed/percent updates from pip/conda never arrive.
  const flush = (raw: string): boolean => {
    const clean = raw.replace(/\r/g, '').trim();
    if (!clean) return false;
    onLine(clean);
    return true;
  };
  stream.on('data', (data: Buffer) => {
    buf += stripANSI(data.toString());
    let index: number;
    while ((index = buf.search(/\r\n|\r|\n/)) !== -1) {
      const line = buf.slice(0, index);
      buf = buf.slice(index + (buf[index] === '\r' && buf[index + 1] === '\n' ? 2 : 1));
      flush(line);
    }
  });
  stream.on('end', () => {
    flush(buf);
    buf = '';
  });
}
