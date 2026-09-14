import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../core/logger';
import { execConda, execFileChecked } from '../core/shell';
import { getEnvPythonPath, isWindows } from '../core/platform';
import { PythonInterpreter } from '../models/types';

const PYTHON_EXTENSION_ID = 'ms-python.python';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function samePath(a: string, b: string): boolean {
  const normalize = (candidate: string): string => {
    try {
      return fs.realpathSync.native(candidate);
    } catch {
      return candidate;
    }
  };
  const left = normalize(a);
  const right = normalize(b);
  return isWindows() ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export class InterpreterService {
  constructor(private readonly logger: Logger) {}

  getEnvPythonPath(envName: string): string | undefined {
    return getEnvPythonPath(envName);
  }

  async autoSelectCondaEnv(envName: string): Promise<boolean> {
    try {
      const pyPath = this.getEnvPythonPath(envName);
      if (!pyPath) {
        this.logger.log(`未找到环境 ${envName} 的 Python 路径`);
        return false;
      }
      return await this.setInterpreter(pyPath, envName);
    } catch (err) {
      this.logger.error('自动选择解释器失败', err);
      return false;
    }
  }

  private async setInterpreter(pyPath: string, envName: string): Promise<boolean> {
    try {
      this.logger.log(`[setInterpreter] 切换解释器: ${envName} -> ${pyPath}`);

      await this.writeSettings(pyPath);

      const pythonExtension = vscode.extensions.getExtension(PYTHON_EXTENSION_ID);
      if (!pythonExtension) {
        this.logger.log('[setInterpreter] 未安装 Python 扩展，仅写入配置，安装并重载窗口后生效');
        return false;
      }

      const envsExtension = vscode.extensions.getExtension('ms-python.vscode-python-envs');
      const useEnvsExtension = vscode.workspace.getConfiguration('python').get<boolean>('useEnvsExtension');
      if (envsExtension?.isActive && useEnvsExtension !== false) {
        this.logger.log('[setInterpreter] 检测到 "Python Environments" 扩展接管了解释器切换；若切换不生效，请在设置中关闭 python.useEnvsExtension 或禁用 ms-python.vscode-python-envs');
      }

      const applied = await this.applyInterpreter(pyPath);
      if (!applied) {
        this.logger.log('[setInterpreter] 自动切换失败，请在命令面板执行 "Python: Select Interpreter" 手动选择');
        return false;
      }

      this.logger.log(`已自动选择解释器: ${envName} (${pyPath})`);
      return true;
    } catch (err) {
      this.logger.error('设置解释器失败', err);
      return false;
    }
  }

  private async writeSettings(pyPath: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const settingsUri = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'settings.json');
      let settings: Record<string, unknown> = {};
      try {
        const raw = await vscode.workspace.fs.readFile(settingsUri);
        settings = JSON.parse(new TextDecoder().decode(raw));
      } catch {
        // settings file does not exist yet
      }
      try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceFolder.uri, '.vscode'));
      } catch {
        // directory already exists
      }
      settings['python.defaultInterpreterPath'] = pyPath;
      settings['python.terminal.activateEnvironment'] = false;
      await vscode.workspace.fs.writeFile(settingsUri, new TextEncoder().encode(JSON.stringify(settings, null, 2)));
      this.logger.log('[setInterpreter] 已写入 workspace settings.json');
    } else {
      this.logger.log('[setInterpreter] 无 workspace folder，跳过 workspace 写入');
    }

    const config = vscode.workspace.getConfiguration('python');
    try {
      await config.update('defaultInterpreterPath', pyPath, vscode.ConfigurationTarget.Global);
      this.logger.log('[setInterpreter] 已写入 Global 设置');
    } catch (err) {
      this.logger.error('[setInterpreter] 写入 Global defaultInterpreterPath 失败', err);
    }
    try {
      await config.update('terminal.activateEnvironment', false, vscode.ConfigurationTarget.Global);
    } catch (err) {
      this.logger.error('[setInterpreter] 写入 Global terminal.activateEnvironment 失败', err);
    }
    if (workspaceFolder) {
      try {
        await config.update('defaultInterpreterPath', pyPath, vscode.ConfigurationTarget.Workspace);
        await config.update('terminal.activateEnvironment', false, vscode.ConfigurationTarget.Workspace);
      } catch (err) {
        this.logger.error('[setInterpreter] Workspace 设置写入失败（可忽略）', err);
      }
    }
  }

  private async applyInterpreter(pyPath: string): Promise<boolean> {
    if (await this.tryPythonApi(pyPath)) return true;

    const attempts: { name: string; run: () => Thenable<unknown> }[] = [
      {
        name: 'python.setInterpreter({interpreter:{uri}})',
        run: () => vscode.commands.executeCommand('python.setInterpreter', { interpreter: { uri: vscode.Uri.file(pyPath) } })
      },
      {
        name: 'python.setInterpreter(uri)',
        run: () => vscode.commands.executeCommand('python.setInterpreter', vscode.Uri.file(pyPath))
      },
      {
        name: 'python.setInterpreter(path)',
        run: () => vscode.commands.executeCommand('python.setInterpreter', pyPath)
      },
    ];
    let commandSucceeded = false;
    for (const attempt of attempts) {
      try {
        await attempt.run();
        commandSucceeded = true;
        this.logger.log(`[setInterpreter] 已调用 ${attempt.name}`);
      } catch (err) {
        this.logger.error(`[setInterpreter] ${attempt.name} 失败`, err);
      }
      await delay(250);
      const check = await this.isActiveInterpreter(pyPath);
      if (check === true) return true;
      if (check === undefined && commandSucceeded) {
        this.logger.log('[setInterpreter] 当前 Python 扩展不支持校验，按调用成功处理');
        return true;
      }
    }
    return false;
  }

  private async tryPythonApi(pyPath: string): Promise<boolean> {
    try {
      const api = await this.getPythonApi();
      const environments = api?.environments;
      if (!environments || typeof environments.updateActiveEnvironmentPath !== 'function') return false;

      try {
        if (typeof environments.refreshEnvironments === 'function') {
          await environments.refreshEnvironments();
        }
      } catch {
        // 环境刷新失败不阻断切换
      }

      let target: unknown = pyPath;
      try {
        const resolved = typeof environments.resolveEnvironment === 'function'
          ? await environments.resolveEnvironment(pyPath)
          : undefined;
        if (resolved) target = resolved;
      } catch {
        // 解析失败则直接把路径交给 API
      }

      await environments.updateActiveEnvironmentPath(target);
      await delay(250);
      const check = await this.isActiveInterpreter(pyPath);
      this.logger.log(`[setInterpreter] 切换后活动解释器: ${await this.describeActiveInterpreter()}`);
      return check !== false;
    } catch (err) {
      this.logger.error('[setInterpreter] Python API 切换失败', err);
      return false;
    }
  }

  private async getPythonApi(): Promise<any | undefined> {
    const pythonExtension = vscode.extensions.getExtension(PYTHON_EXTENSION_ID);
    if (!pythonExtension) return undefined;
    return await pythonExtension.activate();
  }

  private async isActiveInterpreter(pyPath: string): Promise<boolean | undefined> {
    try {
      const api = await this.getPythonApi();
      const environments = api?.environments;
      if (!environments) return undefined;
      const active = typeof environments.getActiveEnvironmentPath === 'function'
        ? environments.getActiveEnvironmentPath()
        : undefined;
      const activePath = typeof active === 'string' ? active : active?.path;
      if (!activePath) return undefined;
      if (samePath(String(activePath), pyPath)) return true;
      if (typeof environments.resolveEnvironment === 'function') {
        const resolved = await environments.resolveEnvironment(active);
        const execPath = resolved?.executable?.uri?.fsPath;
        if (execPath) return samePath(String(execPath), pyPath);
      }
      return false;
    } catch (err) {
      this.logger.error('[setInterpreter] 校验活动解释器失败', err);
      return undefined;
    }
  }

  private async describeActiveInterpreter(): Promise<string> {
    try {
      const api = await this.getPythonApi();
      const environments = api?.environments;
      if (!environments) return '未知';
      const active = typeof environments.getActiveEnvironmentPath === 'function'
        ? environments.getActiveEnvironmentPath()
        : undefined;
      const activePath = typeof active === 'string' ? active : active?.path;
      if (!activePath) return '未知';
      let executable = '';
      try {
        const resolved = await environments.resolveEnvironment(active);
        executable = resolved?.executable?.uri?.fsPath || '';
      } catch {
        // 忽略解析失败
      }
      return executable ? `${activePath} (${executable})` : String(activePath);
    } catch {
      return '未知';
    }
  }

  private async detectCondaInterpreters(interpreters: PythonInterpreter[]): Promise<void> {
    try {
      const infoOutput = await execConda(['info', '--json']);
      const info = JSON.parse(infoOutput);
      for (const envPath of (info.envs || [])) {
        const pyPath = isWindows()
          ? path.join(envPath, 'python.exe')
          : path.join(envPath, 'bin', 'python');
        if (!fs.existsSync(pyPath)) continue;
        try {
          const versionOutput = await execFileChecked(pyPath, ['--version']);
          interpreters.push({
            path: pyPath,
            version: versionOutput.replace('Python ', '').trim(),
            type: 'conda',
            envName: envPath === info.root_prefix ? 'base' : path.basename(envPath)
          });
        } catch {
          // skip interpreters that cannot report a version
        }
      }
    } catch (err) {
      this.logger.error('检测 Conda 解释器失败', err);
    }
  }

  async selectInterpreter(): Promise<boolean> {
    try {
      const condaInterpreters: PythonInterpreter[] = [];
      await this.detectCondaInterpreters(condaInterpreters);
      if (condaInterpreters.length === 0) {
        vscode.window.showWarningMessage('未检测到任何 Conda 环境');
        return false;
      }
      const items = condaInterpreters.map(interpreter => ({
        label: interpreter.envName,
        description: interpreter.version,
        detail: interpreter.path,
      }));
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择要切换的 Conda 环境'
      });
      if (!selected) return false;
      const ok = await this.autoSelectCondaEnv(selected.label);
      if (!ok) {
        const action = '打开选择界面';
        const choice = await vscode.window.showWarningMessage(
          `未能自动切换解释器到 ${selected.label}，请手动执行 "Python: Select Interpreter"。`,
          action
        );
        if (choice === action) {
          await vscode.commands.executeCommand('workbench.action.quickOpen', '>Python: Select Interpreter');
        }
      }
      return ok;
    } catch (err) {
      this.logger.error('选择解释器失败', err);
      return false;
    }
  }
}
