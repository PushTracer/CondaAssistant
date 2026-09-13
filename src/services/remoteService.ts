import * as vscode from 'vscode';
import { Logger } from '../core/logger';
import { execFileText } from '../core/shell';
import { getConfig } from '../core/config';
import { parseCondaEnvList } from '../util/parse';
import { CondaEnvironment, RemoteEnvironment } from '../models/types';

const WSL_EXE = 'wsl.exe';
const DISTRO_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

export class RemoteService {
  constructor(private readonly logger: Logger) {}

  async detectAllEnvironments(): Promise<RemoteEnvironment[]> {
    const envs: RemoteEnvironment[] = [];
    envs.push({ type: 'local', name: '本地', condaPath: '', detail: process.platform });
    if (this.getRemoteName() === 'wsl') {
      envs.push({ type: 'wsl', name: 'WSL (当前)', condaPath: '', detail: 'VS Code 运行在 WSL 中' });
      return envs;
    }
    if (getConfig().enableWSLSupport) {
      const wslEnvs = await this.detectWSL();
      envs.push(...wslEnvs);
      if (wslEnvs.length > 0) {
        this.logger.log(`检测到 ${wslEnvs.length} 个 WSL 环境`);
      }
    }
    return envs;
  }

  private async detectWSL(): Promise<RemoteEnvironment[]> {
    const envs: RemoteEnvironment[] = [];
    try {
      const output = await execFileText(WSL_EXE, ['-l', '-q'], 15000);
      const distros = output
        .split('\n')
        .map(line => line.replace(/[\r\n\x00\uFEFF]/g, '').trim())
        .filter(line => line && DISTRO_NAME_PATTERN.test(line) && !line.includes('Windows') && !line.includes('docker-desktop'));
      for (const distro of distros) {
        const condaCheck = await execFileText(
          WSL_EXE,
          ['-d', distro, 'bash', '-lc', 'which conda 2>/dev/null || echo "not_found"'],
          15000
        );
        if (condaCheck && !condaCheck.includes('not_found') && condaCheck.trim()) {
          envs.push({
            type: 'wsl',
            name: `WSL: ${distro}`,
            condaPath: condaCheck.trim(),
            detail: `发行版: ${distro}`
          });
        }
      }
    } catch (err) {
      this.logger.error('WSL 检测失败', err);
    }
    return envs;
  }

  async getWSLEnvironments(wslName: string): Promise<CondaEnvironment[]> {
    const distro = this.normalizeDistroName(wslName);
    if (!distro) return [];
    try {
      const output = await execFileText(
        WSL_EXE,
        ['-d', distro, 'bash', '-lc', 'conda env list 2>/dev/null'],
        30000
      );
      return parseCondaEnvList(output);
    } catch (err) {
      this.logger.error(`读取 WSL 环境失败 (${distro})`, err);
      return [];
    }
  }

  async execInWSL(wslName: string, condaArgs: string[]): Promise<string> {
    const distro = this.normalizeDistroName(wslName);
    if (!distro) return '';
    const script = `conda ${condaArgs.join(' ')} 2>/dev/null`;
    return await execFileText(WSL_EXE, ['-d', distro, 'bash', '-lc', script], 60000);
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

  getDistroName(wslName: string): string {
    return wslName.replace(/^WSL:\s*/, '').trim();
  }

  private normalizeDistroName(wslName: string): string {
    const distro = this.getDistroName(wslName);
    return DISTRO_NAME_PATTERN.test(distro) ? distro : '';
  }
}
