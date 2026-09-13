import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../core/logger';
import { execConda, execFileChecked } from '../core/shell';
import { isWindows } from '../core/platform';

export class BackupService {
  constructor(private readonly logger: Logger) {}

  async backupEnvironment(envName: string): Promise<void> {
    const choice = await vscode.window.showQuickPick([
      { label: '📄 environment.yml (推荐)', description: '跨平台兼容', value: 'yml' },
      { label: '📄 requirements.txt', description: 'pip 格式', value: 'txt' },
      { label: '📦 conda-pack (完整环境)', description: '包含所有二进制文件', value: 'pack' },
    ], { placeHolder: `选择备份方式 - ${envName}` });
    if (!choice) return;
    if (choice.value === 'pack') {
      await this.backupWithCondaPack(envName);
    } else if (choice.value === 'yml') {
      const output = await execConda(['env', 'export', '-n', envName]);
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${envName}.yml`),
        filters: { 'YAML': ['yml'] }
      });
      if (uri) {
        fs.writeFileSync(uri.fsPath, output);
        vscode.window.showInformationMessage('已导出 environment.yml');
      }
    } else {
      await this.exportRequirements(envName);
    }
  }

  async backupWithCondaPack(envName: string): Promise<boolean> {
    try {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${envName}.tar.gz`),
        filters: { 'Archive': ['tar.gz'] }
      });
      if (!uri) return false;
      const envPath = await this.getEnvPath(envName);
      if (!envPath) {
        vscode.window.showErrorMessage('无法获取环境路径');
        return false;
      }
      const pipPath = isWindows()
        ? path.join(envPath, 'Scripts', 'pip.exe')
        : path.join(envPath, 'bin', 'pip');
      if (fs.existsSync(pipPath)) {
        await execFileChecked(pipPath, ['install', 'conda-pack'], 60000);
      } else {
        await execConda(['install', '-y', '-n', envName, 'conda-pack'], 120000);
      }
      const outputPath = uri.fsPath;
      const pyPath = isWindows()
        ? path.join(envPath, 'python.exe')
        : path.join(envPath, 'bin', 'python');
      await execFileChecked(pyPath, ['-m', 'conda_pack', '-o', outputPath], 180000);
      vscode.window.showInformationMessage(`环境 ${envName} 已打包到 ${outputPath} (${this.getFileSize(outputPath)})`);
      return true;
    } catch (err) {
      this.logger.error(`conda-pack 备份失败 (${envName})`, err);
      vscode.window.showErrorMessage('conda-pack 备份失败');
      return false;
    }
  }

  async exportRequirements(envName: string): Promise<boolean> {
    try {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`requirements-${envName}.txt`),
        filters: { 'Requirements': ['txt'] }
      });
      if (!uri) return false;
      const output = await execConda(['list', '-n', envName, '--export']);
      fs.writeFileSync(uri.fsPath, output);
      vscode.window.showInformationMessage('已导出 requirements.txt');
      return true;
    } catch (err) {
      this.logger.error(`导出 requirements 失败 (${envName})`, err);
      return false;
    }
  }

  private async getEnvPath(envName: string): Promise<string | null> {
    try {
      const info = await execConda(['info', '--json']);
      const data = JSON.parse(info);
      if (envName === 'base') return data.root_prefix;
      const envDir = data.envs_dirs[0] || path.join(data.root_prefix, 'envs');
      const envPath = path.join(envDir, envName);
      return fs.existsSync(envPath) ? envPath : null;
    } catch (err) {
      this.logger.error(`解析环境路径失败 (${envName})`, err);
      return null;
    }
  }

  private getFileSize(filePath: string): string {
    try {
      const bytes = fs.statSync(filePath).size;
      const units = ['B', 'KB', 'MB', 'GB'];
      const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
      return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
    } catch {
      return '未知';
    }
  }
}
