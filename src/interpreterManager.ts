import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execConda, execCommand, getCondaPrefix } from './utils';

export interface PythonInterpreter {
  path: string;
  version: string;
  type: 'conda' | 'venv' | 'uv' | 'poetry' | 'system';
  envName: string;
}

export class InterpreterManager {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  getEnvPythonPath(envName: string): string | undefined {
    const prefix = getCondaPrefix();
    if (!prefix) return undefined;
    const envPath = path.join(prefix, 'envs', envName);
    const pyPath = process.platform === 'win32'
      ? path.join(envPath, 'python.exe')
      : path.join(envPath, 'bin', 'python');
    if (fs.existsSync(pyPath)) return pyPath;
    if (envName === 'base') {
      const basePy = process.platform === 'win32'
        ? path.join(prefix, 'python.exe')
        : path.join(prefix, 'bin', 'python');
      if (fs.existsSync(basePy)) return basePy;
    }
    return undefined;
  }

  async autoSelectCondaEnv(envName: string): Promise<boolean> {
    try {
      const pyPath = this.getEnvPythonPath(envName);
      if (!pyPath) {
        this.outputChannel.appendLine(`未找到环境 ${envName} 的 Python 路径`);
        return false;
      }
      return await this.setInterpreter(pyPath, envName);
    } catch (err) {
      this.outputChannel.appendLine(`自动选择解释器失败: ${err}`);
      return false;
    }
  }

  private async setInterpreter(pyPath: string, envName: string): Promise<boolean> {
    try {
      this.outputChannel.appendLine(`[setInterpreter] 切换解释器: ${envName} -> ${pyPath}`);

      // 1. 有 workspace 时直接写入 .vscode/settings.json
      const wf = vscode.workspace.workspaceFolders?.[0];
      if (wf) {
        const settingsUri = vscode.Uri.joinPath(wf.uri, '.vscode', 'settings.json');
        this.outputChannel.appendLine(`[setInterpreter] settings URI: ${settingsUri.toString()}`);
        let settings: Record<string, any> = {};
        try {
          const raw = await vscode.workspace.fs.readFile(settingsUri);
          settings = JSON.parse(new TextDecoder().decode(raw));
        } catch { }
        try {
          await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(wf.uri, '.vscode'));
        } catch { }
        settings['python.defaultInterpreterPath'] = pyPath;
        settings['python.terminal.activateEnvironment'] = false;
        await vscode.workspace.fs.writeFile(settingsUri, new TextEncoder().encode(JSON.stringify(settings, null, 2)));
        this.outputChannel.appendLine('[setInterpreter] 已写入 workspace settings.json');
      } else {
        this.outputChannel.appendLine('[setInterpreter] 无 workspace folder，跳过 workspace 写入');
      }

      // 2. Config API — 逐个 try/catch，避免一个失败阻断后续
      const config = vscode.workspace.getConfiguration('python');
      await config.update('defaultInterpreterPath', pyPath, vscode.ConfigurationTarget.Global);
      this.outputChannel.appendLine('[setInterpreter] 已写入 Global 设置');
      await config.update('terminal.activateEnvironment', false, vscode.ConfigurationTarget.Global);
      // 有 workspace 时才尝试写入 workspace 设置
      if (wf) {
        try {
          await config.update('defaultInterpreterPath', pyPath, vscode.ConfigurationTarget.Workspace);
          await config.update('terminal.activateEnvironment', false, vscode.ConfigurationTarget.Workspace);
        } catch (e) {
          this.outputChannel.appendLine(`[setInterpreter] Workspace 设置写入失败（可忽略）: ${e}`);
        }
      }

      // 3. 通知 Python 扩展直接选择解释器（这才是真正切换的关键）
      //    python.setInterpreter 接收 { interpreter: { uri } } 时不弹出 UI
      try {
        await vscode.commands.executeCommand('python.setInterpreter', {
          interpreter: { uri: vscode.Uri.file(pyPath) }
        });
        this.outputChannel.appendLine('[setInterpreter] 已调用 python.setInterpreter（直接选择）');
      } catch (e) {
        this.outputChannel.appendLine(`[setInterpreter] python.setInterpreter 直接选择失败: ${e}`);
        // 备选：旧式命令
        for (const cmd of ['python.clearWorkspaceInterpreter', 'python.refreshInterpreter']) {
          try {
            await vscode.commands.executeCommand(cmd);
            this.outputChannel.appendLine(`[setInterpreter] 已调用 ${cmd}`);
          } catch { }
        }
      }

      this.outputChannel.appendLine(`已自动选择解释器: ${envName} (${pyPath})`);
      return true;
    } catch (err) {
      this.outputChannel.appendLine(`设置解释器失败: ${err}`);
      return false;
    }
  }

  private async detectCondaInterpreters(interpreters: PythonInterpreter[]): Promise<void> {
    try {
      const infoOutput = await execConda(['info', '--json']);
      const info = JSON.parse(infoOutput);
      for (const envPath of (info.envs || [])) {
        const pyPath = process.platform === 'win32'
          ? path.join(envPath, 'python.exe')
          : path.join(envPath, 'bin', 'python');
        if (fs.existsSync(pyPath)) {
          try {
            const verOut = await execCommand(`"${pyPath}" --version`);
            interpreters.push({
              path: pyPath,
              version: verOut.replace('Python ', '').trim(),
              type: 'conda',
              envName: envPath === info.root_prefix ? 'base' : path.basename(envPath)
            });
          } catch { }
        }
      }
    } catch (err) {
      this.outputChannel.appendLine(`检测 Conda 解释器失败: ${err}`);
    }
  }

  async selectInterpreter(): Promise<boolean> {
    try {
      // 复用已有的 conda env 检测逻辑（与 autoSelectCondaEnv 一致）
      const condaInterpreters: PythonInterpreter[] = [];
      await this.detectCondaInterpreters(condaInterpreters);
      if (condaInterpreters.length === 0) {
        vscode.window.showWarningMessage('未检测到任何 Conda 环境');
        return false;
      }
      const items = condaInterpreters.map(i => ({
        label: i.envName,
        description: i.version,
        detail: i.path,
      }));
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择要切换的 Conda 环境'
      });
      if (!selected) return false;
      // 使用与点击版本号完全相同的路径切换
      return await this.autoSelectCondaEnv(selected.label);
    } catch (err) {
      this.outputChannel.appendLine(`选择解释器失败: ${err}`);
      return false;
    }
  }
}
