import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execConda, execCommand, parseCondaEnvList, CondaEnvironment, CondaInfo, getCondaPath, getCondaPrefix, getEnvPath, formatBytes } from './utils';

export class CondaManager {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

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
      this.outputChannel.appendLine(`获取 Conda 信息失败: ${err}`);
      return null;
    }
  }

  async enrichEnvironment(env: CondaEnvironment): Promise<CondaEnvironment> {
    try {
      const [pyVer, pkgCount, envSize] = await Promise.all([
        this.getPythonVersion(env.name).catch(() => ''),
        this.getPackageCount(env.name).catch(() => 0),
        this.getEnvSize(env.name).catch(() => '')
      ]);
      env.pythonVersion = pyVer;
      env.packages = pkgCount;
      env.size = envSize;
    } catch { }
    return env;
  }

  async enrichAllEnvironments(envs: CondaEnvironment[], onProgress?: (done: number, total: number) => void): Promise<CondaEnvironment[]> {
    const result: CondaEnvironment[] = [];
    for (let i = 0; i < envs.length; i++) {
      result.push(await this.enrichEnvironment(envs[i]));
      if (onProgress) onProgress(i + 1, envs.length);
    }
    return result;
  }

  async getPythonVersion(envName: string): Promise<string> {
    try {
      const pyPath = process.platform === 'win32'
        ? path.join(getEnvPath(envName), 'python.exe')
        : path.join(getEnvPath(envName), 'bin', 'python');
      if (fs.existsSync(pyPath)) {
        const output = await execCommand(`"${pyPath}" --version`, 10000);
        return output.replace('Python ', '').trim();
      }
      return '';
    } catch {
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
          return formatBytes(await this.getDirSize(rootPrefix));
        }
        return '未知';
      }
      const envDirs: string[] = info.envs_dirs || [];
      for (const dir of envDirs) {
        const envPath = path.join(dir, envName);
        if (fs.existsSync(envPath)) {
          return formatBytes(await this.getDirSize(envPath));
        }
      }
      const fallback = path.join(rootPrefix, 'envs', envName);
      if (fs.existsSync(fallback)) {
        return formatBytes(await this.getDirSize(fallback));
      }
      return '未知';
    } catch (err: any) {
      this.outputChannel.appendLine(`获取环境大小失败 (${envName}): ${err?.message || err}`);
      return '未知';
    }
  }

  private async getDirSize(dirPath: string): Promise<number> {
    let total = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          total += await this.getDirSize(fullPath);
        } else if (entry.isFile()) {
          total += fs.statSync(fullPath).size;
        }
      }
    } catch { }
    return total;
  }

  async createEnvironment(name: string, pythonVersion: string, packages: string[] = []): Promise<boolean> {
    try {
      const args = ['create', '-y', '-n', name, `python=${pythonVersion}`, ...packages];
      this.outputChannel.appendLine(`创建环境: conda ${args.join(' ')}`);
      await execConda(args, 120000);
      this.outputChannel.appendLine(`环境 ${name} 创建成功`);
      return true;
    } catch (err) {
      this.outputChannel.appendLine(`创建环境失败: ${err}`);
      vscode.window.showErrorMessage(`创建环境 ${name} 失败`);
      return false;
    }
  }

  async deleteEnvironment(name: string): Promise<boolean> {
    try {
      await execConda(['remove', '-y', '-n', name, '--all']);
      this.outputChannel.appendLine(`环境 ${name} 已删除`);
      const cleanChoice = await vscode.window.showInformationMessage(
        `环境 ${name} 已删除。是否同时清理 Conda 包缓存以释放磁盘空间？`,
        '清理缓存', '暂不清理'
      );
      if (cleanChoice === '清理缓存') {
        await execConda(['clean', '-afy'], 120000);
        this.outputChannel.appendLine('Conda 缓存已清理');
      }
      return true;
    } catch (err: any) {
      const reason = err?.message || String(err);
      this.outputChannel.appendLine(`删除环境失败: ${reason}`);
      vscode.window.showErrorMessage(`删除环境 ${name} 失败: ${reason}`);
      return false;
    }
  }

  async cloneEnvironment(src: string, dst: string): Promise<boolean> {
    try {
      await execConda(['create', '-y', '-n', dst, '--clone', src], 180000);
      this.outputChannel.appendLine(`环境 ${src} 已克隆到 ${dst}`);
      return true;
    } catch (err) {
      this.outputChannel.appendLine(`克隆环境失败: ${err}`);
      vscode.window.showErrorMessage(`克隆环境失败`);
      return false;
    }
  }

  async renameEnvironment(oldName: string, newName: string): Promise<boolean> {
    const cloned = await this.cloneEnvironment(oldName, newName);
    if (cloned) {
      return await this.deleteEnvironment(oldName);
    }
    return false;
  }

  async exportEnvironment(name: string, format: 'yml' | 'txt' = 'yml'): Promise<string | null> {
    try {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${name}.${format === 'yml' ? 'yml' : 'txt'}`),
        filters: format === 'yml'
          ? { 'Environment YAML': ['yml', 'yaml'] }
          : { 'Requirements': ['txt'] }
      });
      if (!uri) return null;
      const flag = format === 'yml' ? 'export' : 'list --export';
      const output = await execConda(['env', flag, '-n', name]);
      fs.writeFileSync(uri.fsPath, output);
      vscode.window.showInformationMessage(`环境 ${name} 已导出到 ${uri.fsPath}`);
      return uri.fsPath;
    } catch (err) {
      this.outputChannel.appendLine(`导出环境失败: ${err}`);
      vscode.window.showErrorMessage(`导出环境失败`);
      return null;
    }
  }

  async importEnvironment(): Promise<boolean> {
    try {
      const uri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          'Environment Files': ['yml', 'yaml', 'txt']
        }
      });
      if (!uri || !uri[0]) return false;
      const filePath = uri[0].fsPath;
      const ext = path.extname(filePath);
      if (ext === '.txt') {
        await execConda(['install', '-y', '--file', filePath], 180000);
      } else {
        await execConda(['env', 'create', '-f', filePath], 180000);
      }
      vscode.window.showInformationMessage(`环境已从 ${filePath} 恢复`);
      return true;
    } catch (err) {
      this.outputChannel.appendLine(`导入环境失败: ${err}`);
      vscode.window.showErrorMessage(`导入环境失败`);
      return false;
    }
  }

  async installPackage(envName: string, pkgName: string): Promise<boolean> {
    try {
      await execConda(['install', '-y', '-n', envName, pkgName], 120000);
      this.outputChannel.appendLine(`已安装 ${pkgName} 到 ${envName}`);
      return true;
    } catch (err) {
      this.outputChannel.appendLine(`安装包失败: ${err}`);
      vscode.window.showErrorMessage(`安装 ${pkgName} 失败`);
      return false;
    }
  }

  async uninstallPackage(envName: string, pkgName: string): Promise<{ success: boolean; error?: string }> {
    try {
      await execConda(['remove', '-y', '-n', envName, pkgName]);
      this.outputChannel.appendLine(`已从 ${envName} 卸载 ${pkgName}`);
      return { success: true };
    } catch (err: any) {
      const reason = err?.message || String(err);
      const shortReason = reason
        .replace(/^.*error: /, '')
        .replace(/^Error: /, '')
        .split('\n')[0]
        .trim();
      this.outputChannel.appendLine(`卸载包失败: ${reason}`);
      return { success: false, error: shortReason };
    }
  }

  async listPackages(envName: string): Promise<string> {
    try {
      return await execConda(['list', '-n', envName]);
    } catch {
      return '';
    }
  }

  async listPackagesJSON(envName: string): Promise<{ name: string; version: string; channel: string }[]> {
    try {
      const output = await execConda(['list', '-n', envName, '--json']);
      const packages = JSON.parse(output);
      if (!Array.isArray(packages)) return [];
      return packages.map((p: any) => ({
        name: p.name || '',
        version: p.version || '',
        channel: p.channel || '',
      })).filter(p => p.name);
    } catch {
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
        const envsDirs = condaInfo.envs_dirs || [];
        for (const dir of envsDirs) {
          const p = path.join(dir, envName);
          if (fs.existsSync(p)) { envPath = p; break; }
        }
        if (!envPath) envPath = path.join(rootPrefix, 'envs', envName);
      }
      const condaMeta = path.join(envPath, 'conda-meta');
      if (!fs.existsSync(condaMeta)) {
        return await execConda(['list', '-n', envName]);
      }
      const files = fs.readdirSync(condaMeta).filter((f: string) => f.endsWith('.json') && !f.endsWith('.xz'));
      const pkgSizes: { name: string; version: string; size: number }[] = [];
      for (const file of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(condaMeta, file), 'utf-8'));
          pkgSizes.push({
            name: content.name || file,
            version: content.version || '',
            size: content.size || 0
          });
        } catch { }
      }
      pkgSizes.sort((a, b) => b.size - a.size);
      const total = pkgSizes.reduce((s, p) => s + p.size, 0);
      const realSize = fs.existsSync(envPath) ? formatBytes(await this.getDirSize(envPath)) : '?';
      let output = `# 包分析 (${pkgSizes.length} 个包)\n`;
      output += `包净体积: ${formatBytes(total)}  |  环境目录实际大小: ${realSize}\n\n`;
      output += `${'包名'.padEnd(30)} ${'版本'.padEnd(18)} ${'大小'.padEnd(10)}\n`;
      output += `${'─'.repeat(58)}\n`;
      for (const pkg of pkgSizes) {
        output += `${pkg.name.padEnd(30)} ${pkg.version.padEnd(18)} ${formatBytes(pkg.size).padStart(10)}\n`;
      }
      output += `${'─'.repeat(58)}\n`;
      output += `${'包净体积总计'.padEnd(30)} ${''.padEnd(18)} ${formatBytes(total).padStart(10)}\n`;
      output += `${'环境目录实际总计'.padEnd(30)} ${''.padEnd(18)} ${realSize.padStart(10)}\n`;
      return output;
    } catch {
      return await execConda(['list', '-n', envName]);
    }
  }

  async getPackageDeps(envName: string, pkgName: string): Promise<string[]> {
    try {
      const output = await execConda(['list', '-n', envName, '--json']);
      const packages = JSON.parse(output);
      const pkg = packages.find((p: any) => p.name === pkgName);
      if (pkg && pkg.depends) {
        return pkg.depends.map((d: string) => d.split(' ')[0]);
      }
      return [];
    } catch {
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
        } catch { /* ignore dir creation errors */ }
      };
      ensureCondaDirs(getEnvPath(envName));     // target env
      ensureCondaDirs(getCondaPrefix());          // base env (for deactivation)
      const prefix = getCondaPrefix();
      if (prefix) {
        terminal.sendText(`source "${prefix}/etc/profile.d/conda.sh" && conda activate ${envName}`);
      } else {
        terminal.sendText(`conda activate ${envName} 2>/dev/null || { CONDA_BASE=$(conda info --base 2>/dev/null) && source "$CONDA_BASE/etc/profile.d/conda.sh" && conda activate ${envName}; }`);
      }
      return true;
    } catch (err) {
      this.outputChannel.appendLine(`激活环境失败: ${err}`);
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
        if (pkg.depends) {
          for (const dep of pkg.depends) {
            const depName = dep.split(' ')[0].split('>')[0].split('<')[0].split('=')[0];
            if (!depMap.has(depName)) depMap.set(depName, new Set());
            depMap.get(depName)!.add(pkg.name);
          }
        }
      }
      for (const [dep, dependents] of depMap) {
        if (dependents.size > 1) {
          const depsArr = Array.from(dependents);
          let versions = new Set<string>();
          for (const parent of depsArr) {
            const parentPkg = packages.find((p: any) => p.name === parent);
            if (parentPkg && parentPkg.depends) {
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
    } catch { }
    return issues;
  }
}
