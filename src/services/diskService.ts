import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../core/logger';
import { execConda, execFileChecked, execShell } from '../core/shell';
import {
  getCondaPrefix,
  getEnvPythonPath,
  getFreeDiskSpace,
  getInodeUsage,
  homeDir,
  isWindows,
  pipCacheDir,
  tmpDir,
} from '../core/platform';

export type CacheKind = 'conda' | 'pip' | 'all';

export interface CleanCacheResult {
  freedBytes: number;
  freeGB: string;
}

export class DiskService {
  constructor(private readonly logger: Logger) {}

  diagnose(): string[] {
    const lines: string[] = ['磁盘空间诊断'];
    for (const target of this.diagnosticTargets()) {
      const space = getFreeDiskSpace(target);
      lines.push(`  ${target}  →  ${space.freeGB} 空闲`);
    }
    const inodeUsage = getInodeUsage(homeDir());
    if (inodeUsage) {
      lines.push(`  inode  →  已用 ${inodeUsage.used}/${inodeUsage.total} (${inodeUsage.percent}%)`);
    }
    return lines;
  }

  async cleanCaches(kind: CacheKind): Promise<CleanCacheResult> {
    const before = getFreeDiskSpace();
    if (kind === 'conda' || kind === 'all') {
      await execConda(['clean', '-afy'], 120000);
      this.logger.log('Conda 缓存已清理');
    }
    if (kind === 'pip' || kind === 'all') {
      await this.purgePipCache();
    }
    const after = getFreeDiskSpace();
    return {
      freedBytes: Math.max(0, after.free - before.free),
      freeGB: after.freeGB,
    };
  }

  async purgePipCache(): Promise<void> {
    if (!isWindows()) {
      await execShell(`rm -rf "${pipCacheDir()}" 2>/dev/null`, 15000);
      return;
    }
    const basePython = getEnvPythonPath('base');
    if (basePython) {
      const output = await execFileTextSafe(basePython, ['-m', 'pip', 'cache', 'purge'], 60000);
      if (output) this.logger.log(`pip 缓存清理: ${output.split('\n')[0]}`);
      return;
    }
    const output = await execShell('pip cache purge', 60000);
    if (/not recognized|不是内部或外部命令/i.test(output)) {
      this.logger.log('未找到 pip，跳过 pip 缓存清理');
    }
  }

  private diagnosticTargets(): string[] {
    const home = homeDir();
    if (isWindows()) {
      const root = path.parse(home).root;
      const targets = [root, tmpDir(), home, pipCacheDir()];
      const condaPrefix = getCondaPrefix();
      if (condaPrefix) targets.push(condaPrefix);
      return targets.filter(target => target && fs.existsSync(target));
    }
    return ['/', '/tmp', home, path.join(home, '.cache', 'pip'), path.join(home, 'miniconda3')];
  }
}

async function execFileTextSafe(file: string, args: string[], timeout: number): Promise<string> {
  try {
    return await execFileChecked(file, args, timeout);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
