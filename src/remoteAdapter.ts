import * as vscode from 'vscode';
import { execCommand, parseCondaEnvList, CondaEnvironment } from './utils';

export interface RemoteEnvironment {
  type: 'local' | 'wsl' | 'ssh' | 'container';
  name: string;
  condaPath: string;
  detail: string;
}

export class RemoteAdapter {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  async detectAllEnvironments(): Promise<RemoteEnvironment[]> {
    const envs: RemoteEnvironment[] = [];
    envs.push({ type: 'local', name: '本地', condaPath: '', detail: process.platform });
    if (this.getRemoteName() === 'wsl') {
      envs.push({ type: 'wsl', name: 'WSL (当前)', condaPath: '', detail: 'VS Code 运行在 WSL 中' });
      return envs;
    }
    if (vscode.workspace.getConfiguration('conda-ai').get<boolean>('enableWSLSupport')) {
      const wslEnvs = await this.detectWSL();
      envs.push(...wslEnvs);
      if (wslEnvs.length > 0) {
        this.outputChannel.appendLine(`检测到 ${wslEnvs.length} 个 WSL 环境`);
      }
    }
    return envs;
  }

  private async detectWSL(): Promise<RemoteEnvironment[]> {
    const envs: RemoteEnvironment[] = [];
    try {
      const output = await execCommand('wsl -l -q 2>$null', 15000);
      const distros = output.split('\n').map(l => l.replace(/[\r\n\x00]/g, '').trim()).filter(l => l && l !== '');
      for (const distro of distros) {
        const name = distro.replace(/\s+/g, ' ').trim();
        if (!name || name.includes('Windows') || name.includes('docker-desktop')) continue;
        try {
          const condaCheck = await execCommand(`wsl -d "${name}" bash -lc 'which conda 2>/dev/null || echo "not_found"'`, 15000);
          if (condaCheck && !condaCheck.includes('not_found') && condaCheck.trim()) {
            envs.push({
              type: 'wsl',
              name: `WSL: ${name}`,
              condaPath: condaCheck.trim(),
              detail: `发行版: ${name}`
            });
          }
        } catch { }
      }
    } catch (err: any) {
      if (!err?.message?.includes('没有') && !err?.message?.includes('not')) {
        this.outputChannel.appendLine(`WSL 检测失败: ${err}`);
      }
    }
    return envs;
  }

  async getWSLEnvironments(wslName: string): Promise<CondaEnvironment[]> {
    try {
      const wslNameClean = wslName.replace(/^WSL:\s*/, '');
      const output = await execCommand(`wsl -d "${wslNameClean}" bash -lc 'conda env list 2>/dev/null'`, 30000);
      return parseCondaEnvList(output);
    } catch {
      return [];
    }
  }

  async execInWSL(wslName: string, condaArgs: string[]): Promise<string> {
    const wslNameClean = wslName.replace(/^WSL:\s*/, '');
    const cmd = `wsl -d "${wslNameClean}" bash -lc 'conda ${condaArgs.join(' ')} 2>/dev/null'`;
    return await execCommand(cmd, 60000);
  }

  isRemote(): boolean {
    return vscode.env.remoteName !== undefined && vscode.env.remoteName !== null;
  }

  getRemoteName(): string {
    return vscode.env.remoteName || 'local';
  }

  isWSL(): boolean {
    return this.getRemoteName() === 'wsl';
  }
}
