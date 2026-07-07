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

  async autoSelectCondaEnv(envName: string): Promise<boolean> {
    try {
      const prefix = getCondaPrefix();
      if (!prefix) return false;
      const envPath = process.platform === 'win32'
        ? path.join(prefix, 'envs', envName)
        : path.join(prefix, 'envs', envName);
      const pyPath = process.platform === 'win32'
        ? path.join(envPath, 'python.exe')
        : path.join(envPath, 'bin', 'python');
      if (!fs.existsSync(pyPath)) {
        if (envName === 'base') {
          const basePy = process.platform === 'win32'
            ? path.join(prefix, 'python.exe')
            : path.join(prefix, 'bin', 'python');
          if (fs.existsSync(basePy)) {
            return await this.setInterpreter(basePy, envName);
          }
        }
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
      const config = vscode.workspace.getConfiguration('python');
      await config.update('defaultInterpreterPath', pyPath, vscode.ConfigurationTarget.Workspace);
      this.outputChannel.appendLine(`已自动选择解释器: ${envName} (${pyPath})`);
      return true;
    } catch (err) {
      this.outputChannel.appendLine(`设置解释器失败: ${err}`);
      return false;
    }
  }

  async detectAllInterpreters(): Promise<PythonInterpreter[]> {
    const interpreters: PythonInterpreter[] = [];
    await this.detectCondaInterpreters(interpreters);
    await this.detectVenvInterpreters(interpreters);
    await this.detectSystemPython(interpreters);
    return interpreters;
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

  private async detectVenvInterpreters(interpreters: PythonInterpreter[]): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    for (const folder of workspaceFolders) {
      for (const envPath of [path.join(folder.uri.fsPath, '.venv'), path.join(folder.uri.fsPath, 'venv')]) {
        const pyPath = process.platform === 'win32'
          ? path.join(envPath, 'Scripts', 'python.exe')
          : path.join(envPath, 'bin', 'python');
        if (fs.existsSync(pyPath)) {
          try {
            const verOut = await execCommand(`"${pyPath}" --version`);
            interpreters.push({
              path: pyPath,
              version: verOut.replace('Python ', '').trim(),
              type: 'venv',
              envName: path.basename(envPath)
            });
          } catch { }
        }
      }
    }
  }

  private async detectSystemPython(interpreters: PythonInterpreter[]): Promise<void> {
    const pythonCmds = process.platform === 'win32'
      ? ['python', 'python3', 'py']
      : ['python3', 'python'];
    for (const cmd of pythonCmds) {
      try {
        const out = await execCommand(`${cmd} --version`);
        const whichOut = await execCommand(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`);
        const pyPath = whichOut.split('\n')[0].trim();
        if (!interpreters.some(i => i.path === pyPath)) {
          interpreters.push({
            path: pyPath,
            version: out.replace('Python ', '').trim(),
            type: 'system',
            envName: 'system'
          });
        }
      } catch { }
    }
  }

  async selectInterpreter(): Promise<boolean> {
    const interpreters = await this.detectAllInterpreters();
    if (interpreters.length === 0) {
      vscode.window.showWarningMessage('未检测到任何 Python 解释器');
      return false;
    }
    const items = interpreters.map(i => ({
      label: `${i.envName} (${i.type})`,
      description: i.version,
      detail: i.path,
      interpreter: i
    }));
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '选择 Python 解释器'
    });
    if (!selected) return false;
    return await this.setInterpreter(selected.interpreter.path, selected.interpreter.envName);
  }
}
