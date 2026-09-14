import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../core/logger';
import { execConda, execFileChecked } from '../core/shell';
import {
  getCondaPath,
  getCondaPrefix,
  getEnvPath,
  getEnvPythonPath,
  getDirectorySize,
} from '../core/platform';
import { formatBytes } from '../util/format';
import { parseCondaEnvList } from '../util/parse';
import { CondaEnvironment, CondaInfo, InstalledPackage } from '../models/types';

export interface DeleteEnvironmentOptions {
  promptCacheClean?: boolean;
}

export class CondaService {
  constructor(private readonly logger: Logger) {}

  async getCondaInfo(): Promise<CondaInfo | null> {
    try {
      const versionOutput = await execConda(['--version']);
      const condaVersion = versionOutput.replace('conda ', '').trim();
      const envListOutput = await execConda(['env', 'list']);
      const envs = parseCondaEnvList(envListOutput);
      const infoOutput = await execConda(['info', '--json']);
      const info = JSON.parse(infoOutput);
      const defaultEnv = info.default_environment || 'base';
      return {
        condaVersion,
        pythonVersion: '',
        envs,
        defaultEnv,
        condaPath: getCondaPath()
      };
    } catch (err) {
      this.logger.error('获取 Conda 信息失败', err);
      return null;
    }
  }

  async enrichEnvironment(env: CondaEnvironment): Promise<CondaEnvironment> {
    try {
      const [pythonVersion, packages, size] = await Promise.all([
        this.getPythonVersion(env.name).catch(() => ''),
        this.getPackageCount(env.name).catch(() => 0),
        this.getEnvSize(env.name).catch(() => '')
      ]);
      env.pythonVersion = pythonVersion;
      env.packages = packages;
      env.size = size;
    } catch (err) {
      this.logger.error(`补充环境信息失败 (${env.name})`, err);
    }
    return env;
  }

  async enrichAllEnvironments(
    envs: CondaEnvironment[],
    onProgress?: (done: number, total: number) => void
  ): Promise<CondaEnvironment[]> {
    const result: CondaEnvironment[] = [];
    for (let i = 0; i < envs.length; i++) {
      result.push(await this.enrichEnvironment(envs[i]));
      if (onProgress) onProgress(i + 1, envs.length);
    }
    return result;
  }

  async getPythonVersion(envName: string): Promise<string> {
    try {
      const pythonPath = getEnvPythonPath(envName);
      if (!pythonPath) return '';
      const output = await execFileChecked(pythonPath, ['--version'], 10000);
      return output.replace('Python ', '').trim();
    } catch (err) {
      this.logger.error(`获取 Python 版本失败 (${envName})`, err);
      return '';
    }
  }

  async getPackageCount(envName: string): Promise<number> {
    try {
      const output = await execConda(['list', '-n', envName, '--json']);
      const packages = JSON.parse(output);
      return Array.isArray(packages) ? packages.length : 0;
    } catch {
      return 0;
    }
  }

  async getEnvSize(envName: string): Promise<string> {
    try {
      const infoOutput = await execConda(['info', '--json']);
      const info = JSON.parse(infoOutput);
      const rootPrefix = info.root_prefix || '';
      if (envName === 'base' || envName === rootPrefix) {
        if (fs.existsSync(rootPrefix)) {
          return formatBytes(await getDirectorySize(rootPrefix));
        }
        return '未知';
      }
      const envDirs: string[] = info.envs_dirs || [];
      for (const dir of envDirs) {
        const envPath = path.join(dir, envName);
        if (fs.existsSync(envPath)) {
          return formatBytes(await getDirectorySize(envPath));
        }
      }
      const fallback = path.join(rootPrefix, 'envs', envName);
      if (fs.existsSync(fallback)) {
        return formatBytes(await getDirectorySize(fallback));
      }
      return '未知';
    } catch (err) {
      this.logger.error(`获取环境大小失败 (${envName})`, err);
      return '未知';
    }
  }

  async createEnvironment(name: string, pythonVersion: string, packages: string[] = []): Promise<boolean> {
    try {
      const args = ['create', '-y', '-n', name, `python=${pythonVersion}`, ...packages];
      this.logger.log(`创建环境: conda ${args.join(' ')}`);
      await execConda(args, 120000);
      this.logger.log(`环境 ${name} 创建成功`);
      return true;
    } catch (err) {
      this.logger.error(`创建环境失败 (${name})`, err);
      vscode.window.showErrorMessage(`创建环境 ${name} 失败`);
      return false;
    }
  }

  async deleteEnvironment(name: string, options: DeleteEnvironmentOptions = {}): Promise<boolean> {
    const { promptCacheClean = true } = options;
    try {
      await execConda(['remove', '-y', '-n', name, '--all']);
      this.logger.log(`环境 ${name} 已删除`);
      if (promptCacheClean) {
        const cleanChoice = await vscode.window.showInformationMessage(
          `环境 ${name} 已删除。是否同时清理 Conda 包缓存以释放磁盘空间？`,
          '清理缓存', '暂不清理'
        );
        if (cleanChoice === '清理缓存') {
          await execConda(['clean', '-afy'], 120000);
          this.logger.log('Conda 缓存已清理');
        }
      }
      return true;
    } catch (err) {
      this.logger.error(`删除环境失败 (${name})`, err);
      vscode.window.showErrorMessage(`删除环境 ${name} 失败: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async cloneEnvironment(src: string, dst: string): Promise<boolean> {
    try {
      await execConda(['create', '-y', '-n', dst, '--clone', src], 180000);
      this.logger.log(`环境 ${src} 已克隆到 ${dst}`);
      return true;
    } catch (err) {
      this.logger.error(`克隆环境失败 (${src} -> ${dst})`, err);
      vscode.window.showErrorMessage('克隆环境失败');
      return false;
    }
  }

  async renameEnvironment(oldName: string, newName: string): Promise<boolean> {
    const cloned = await this.cloneEnvironment(oldName, newName);
    if (cloned) {
      return await this.deleteEnvironment(oldName, { promptCacheClean: false });
    }
    return false;
  }

  async installPackage(envName: string, pkgName: string): Promise<boolean> {
    try {
      await execConda(['install', '-y', '-n', envName, pkgName], 120000);
      this.logger.log(`已安装 ${pkgName} 到 ${envName}`);
      return true;
    } catch (err) {
      this.logger.error(`安装包失败 (${pkgName} -> ${envName})`, err);
      vscode.window.showErrorMessage(`安装 ${pkgName} 失败`);
      return false;
    }
  }

  async uninstallPackage(envName: string, pkgName: string): Promise<{ success: boolean; error?: string }> {
    try {
      await execConda(['remove', '-y', '-n', envName, pkgName]);
      this.logger.log(`已从 ${envName} 卸载 ${pkgName}`);
      return { success: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const shortReason = reason
        .replace(/^.*error: /, '')
        .replace(/^Error: /, '')
        .split('\n')[0]
        .trim();
      this.logger.error(`卸载包失败 (${pkgName})`, reason);
      return { success: false, error: shortReason };
    }
  }

  async listPackages(envName: string): Promise<string> {
    try {
      return await execConda(['list', '-n', envName]);
    } catch (err) {
      this.logger.error(`列出包失败 (${envName})`, err);
      return '';
    }
  }

  async listPackagesJSON(envName: string): Promise<InstalledPackage[]> {
    try {
      const output = await execConda(['list', '-n', envName, '--json']);
      const packages = JSON.parse(output);
      if (!Array.isArray(packages)) return [];
      return packages
        .map((pkg: Record<string, unknown>) => ({
          name: String(pkg.name || ''),
          version: String(pkg.version || ''),
          channel: String(pkg.channel || ''),
        }))
        .filter(pkg => pkg.name);
    } catch (err) {
      this.logger.error(`读取包列表失败 (${envName})`, err);
      return [];
    }
  }

  async listPackagesWithSize(envName: string): Promise<string> {
    try {
      const info = await execConda(['info', '--json']);
      const condaInfo = JSON.parse(info);
      const rootPrefix = condaInfo.root_prefix || '';
      let envPath = '';
      if (envName === 'base') {
        envPath = rootPrefix;
      } else {
        const envsDirs: string[] = condaInfo.envs_dirs || [];
        for (const dir of envsDirs) {
          const candidate = path.join(dir, envName);
          if (fs.existsSync(candidate)) {
            envPath = candidate;
            break;
          }
        }
        if (!envPath) envPath = path.join(rootPrefix, 'envs', envName);
      }
      const condaMeta = path.join(envPath, 'conda-meta');
      if (!fs.existsSync(condaMeta)) {
        return await execConda(['list', '-n', envName]);
      }
      const files = fs.readdirSync(condaMeta).filter((f: string) => f.endsWith('.json') && !f.endsWith('.xz'));
      const packageSizes: { name: string; version: string; size: number }[] = [];
      for (const file of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(condaMeta, file), 'utf-8'));
          packageSizes.push({
            name: content.name || file,
            version: content.version || '',
            size: content.size || 0
          });
        } catch {
          // skip unreadable metadata
        }
      }
      packageSizes.sort((a, b) => b.size - a.size);
      const total = packageSizes.reduce((sum, pkg) => sum + pkg.size, 0);
      const realSize = fs.existsSync(envPath) ? formatBytes(await getDirectorySize(envPath)) : '?';
      let output = `# 包分析 (${packageSizes.length} 个包)\n`;
      output += `包净体积: ${formatBytes(total)}  |  环境目录实际大小: ${realSize}\n\n`;
      output += `${'包名'.padEnd(30)} ${'版本'.padEnd(18)} ${'大小'.padEnd(10)}\n`;
      output += `${'─'.repeat(58)}\n`;
      for (const pkg of packageSizes) {
        output += `${pkg.name.padEnd(30)} ${pkg.version.padEnd(18)} ${formatBytes(pkg.size).padStart(10)}\n`;
      }
      output += `${'─'.repeat(58)}\n`;
      output += `${'包净体积总计'.padEnd(30)} ${''.padEnd(18)} ${formatBytes(total).padStart(10)}\n`;
      output += `${'环境目录实际总计'.padEnd(30)} ${''.padEnd(18)} ${realSize.padStart(10)}\n`;
      return output;
    } catch (err) {
      this.logger.error(`包体积分析失败 (${envName})`, err);
      return await execConda(['list', '-n', envName]);
    }
  }

  async getPackageDeps(envName: string, pkgName: string): Promise<string[]> {
    try {
      const output = await execConda(['list', '-n', envName, '--json']);
      const packages = JSON.parse(output);
      const pkg = packages.find((p: { name?: string }) => p.name === pkgName);
      if (pkg && Array.isArray(pkg.depends)) {
        return pkg.depends.map((dep: string) => dep.split(' ')[0]);
      }
      return [];
    } catch (err) {
      this.logger.error(`获取包依赖失败 (${pkgName})`, err);
      return [];
    }
  }

  async activateEnvironment(envName: string): Promise<boolean> {
    try {
      const terminal = vscode.window.activeTerminal || vscode.window.createTerminal('Conda');
      terminal.show();
      const condaPath = getCondaPath();
      if (process.platform === 'win32') {
        terminal.sendText(`& "${condaPath}" activate ${envName}`);
        return true;
      }
      // workaround for conda 4.8.4 bug: ensure activate.d/deactivate.d dirs exist
      const ensureCondaDirs = (prefix: string) => {
        if (!prefix) return;
        try {
          const condaDir = path.join(prefix, 'etc', 'conda');
          if (!fs.existsSync(condaDir)) fs.mkdirSync(condaDir, { recursive: true });
          for (const sub of ['activate.d', 'deactivate.d']) {
            const dir = path.join(condaDir, sub);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          }
        } catch {
          // ignore dir creation errors
        }
      };
      ensureCondaDirs(getEnvPath(envName));
      ensureCondaDirs(getCondaPrefix());
      const prefix = getCondaPrefix();
      if (prefix) {
        terminal.sendText(`source "${prefix}/etc/profile.d/conda.sh" && conda activate ${envName}`);
      } else {
        terminal.sendText(`conda activate ${envName} 2>/dev/null || { CONDA_BASE=$(conda info --base 2>/dev/null) && source "$CONDA_BASE/etc/profile.d/conda.sh" && conda activate ${envName}; }`);
      }
      return true;
    } catch (err) {
      this.logger.error(`激活环境失败 (${envName})`, err);
      return false;
    }
  }

  async detectConflicts(envName: string): Promise<string[]> {
    const issues: string[] = [];
    try {
      const output = await execConda(['list', '-n', envName, '--json']);
      const packages = JSON.parse(output);
      const depMap = new Map<string, Set<string>>();
      for (const pkg of packages) {
        if (!Array.isArray(pkg.depends)) continue;
        for (const dep of pkg.depends) {
          const depName = dep.split(' ')[0].split('>')[0].split('<')[0].split('=')[0];
          if (!depMap.has(depName)) depMap.set(depName, new Set());
          depMap.get(depName)!.add(pkg.name);
        }
      }
      for (const [dep, dependents] of depMap) {
        if (dependents.size > 1) {
          const versions = new Set<string>();
          for (const parent of dependents) {
            const parentPkg = packages.find((p: { name?: string }) => p.name === parent);
            if (parentPkg && Array.isArray(parentPkg.depends)) {
              for (const d of parentPkg.depends) {
                if (d.startsWith(dep)) {
                  const verMatch = d.match(/[><=]+([\d.]+)/);
                  if (verMatch) versions.add(`${parent} 需要 ${dep}${verMatch[0]}`);
                }
              }
            }
          }
          if (versions.size > 1) {
            issues.push(`检测到潜在依赖冲突: ${dep}\n  ${Array.from(versions).join('\n  ')}`);
          }
        }
      }
    } catch (err) {
      this.logger.error(`依赖冲突检测失败 (${envName})`, err);
    }
    return issues;
  }
}
