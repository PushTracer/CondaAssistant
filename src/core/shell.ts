import * as vscode from 'vscode';
import { getCondaPath, getEnvPipPath, getPipWorkDirs, isWindows } from './platform';
import { execFileChecked, spawnProcess } from './process';

export function execConda(args: string[], timeout = 60000): Promise<string> {
  return execFileChecked(getCondaPath(), args, timeout);
}

export function spawnConda(
  args: string[],
  onLine: (line: string) => void,
  onError?: (err: Error) => void,
  timeout = 300000,
  cancelToken?: vscode.CancellationToken
): Promise<number> {
  return spawnProcess(getCondaPath(), args, {
    onLine,
    onError,
    timeout,
    timeoutMessage: vscode.l10n.t('安装超时'),
    cancelToken,
  });
}

export function spawnPipInEnv(
  envName: string,
  pipArgs: string[],
  onLine: (line: string) => void,
  onError?: (err: Error) => void,
  timeout = 300000,
  cancelToken?: vscode.CancellationToken
): Promise<number> {
  const pipPath = getEnvPipPath(envName);
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Ask pip to keep printing download progress even without a TTY; the
  // extension parses the "45.2/780.4 MB 3.2 MB/s" lines for live speed.
  env.PIP_PROGRESS_BAR = 'on';
  const { tmpDir, cacheDir } = getPipWorkDirs(envName);
  if (tmpDir) {
    env.TMPDIR = tmpDir;
    env.PIP_CACHE_DIR = cacheDir;
    if (isWindows()) {
      env.TEMP = tmpDir;
      env.TMP = tmpDir;
    }
  }
  // Watch both the temp dir (where pip streams the partial download while
  // being silent) and the cache dir: any byte growth counts as liveness, so
  // a slow-but-working download is never killed by the inactivity timeout.
  const progressDirs = [tmpDir, cacheDir].filter(dir => dir.length > 0);
  return spawnProcess(pipPath, pipArgs, {
    onLine,
    onError,
    timeout,
    timeoutMessage: vscode.l10n.t('pip 安装超时'),
    env,
    cancelToken,
    progressDirs,
  });
}
