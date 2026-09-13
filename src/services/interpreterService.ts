import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../core/logger';
import { execConda, execFileChecked } from '../core/shell';
import { getEnvPythonPath, isWindows } from '../core/platform';
import { PythonInterpreter } from '../models/types';

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

      // 1. 有 workspace 时直接写入 .vscode/settings.json
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const settingsUri = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'settings.json');
        this.logger.log(`[setInterpreter] settings URI: ${settingsUri.toString()}`);
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

      // 2. Config API — 逐个 try/catch，避免一个失败阻断后续
      const config = vscode.workspace.getConfiguration('python');
      await config.update('defaultInterpreterPath', pyPath, vscode.ConfigurationTarget.Global);
      this.logger.log('[setInterpreter] 已写入 Global 设置');
      await config.update('terminal.activateEnvironment', false, vscode.ConfigurationTarget.Global);
      if (workspaceFolder) {
        try {
          await config.update('defaultInterpreterPath', pyPath, vscode.ConfigurationTarget.Workspace);
          await config.update('terminal.activateEnvironment', false, vscode.ConfigurationTarget.Workspace);
        } catch (err) {
          this.logger.error('[setInterpreter] Workspace 设置写入失败（可忽略）', err);
        }
      }

      // 3. 通知 Python 扩展直接选择解释器（这才是真正切换的关键）
      try {
        await vscode.commands.executeCommand('python.setInterpreter', {
          interpreter: { uri: vscode.Uri.file(pyPath) }
        });
        this.logger.log('[setInterpreter] 已调用 python.setInterpreter（直接选择）');
      } catch (err) {
        this.logger.error('[setInterpreter] python.setInterpreter 直接选择失败', err);
        for (const command of ['python.clearWorkspaceInterpreter', 'python.refreshInterpreter']) {
          try {
            await vscode.commands.executeCommand(command);
            this.logger.log(`[setInterpreter] 已调用 ${command}`);
          } catch {
            // optional fallback command unavailable
          }
        }
      }

      this.logger.log(`已自动选择解释器: ${envName} (${pyPath})`);
      return true;
    } catch (err) {
      this.logger.error('设置解释器失败', err);
      return false;
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
      return await this.autoSelectCondaEnv(selected.label);
    } catch (err) {
      this.logger.error('选择解释器失败', err);
      return false;
    }
  }
}
