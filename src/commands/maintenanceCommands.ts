import * as vscode from 'vscode';
import { CommandContext } from './context';
import { formatBytes } from '../util/format';

export function registerMaintenanceCommands(ctx: CommandContext): void {
  const { context, remote, disk, logger } = ctx;

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.scanWSL', async () => {
      const remoteEnvs = await remote.detectAllEnvironments();
      const wslEnvs = remoteEnvs.filter(env => env.type === 'wsl' && env.name !== 'WSL (当前)');
      if (wslEnvs.length === 0) {
        vscode.window.showInformationMessage('未检测到 WSL Conda 环境');
        return;
      }
      const selected = await vscode.window.showQuickPick(
        wslEnvs.map(env => ({ label: env.name, description: env.condaPath, detail: env.detail })),
        { placeHolder: '选择要浏览的 WSL 环境' }
      );
      if (!selected) return;
      const wslName = selected.label;
      const wslCondaEnvs = await remote.getWSLEnvironments(wslName);
      if (wslCondaEnvs.length === 0) {
        vscode.window.showInformationMessage(`${wslName} 中未找到 Conda 环境`);
        return;
      }
      vscode.window.showQuickPick(
        wslCondaEnvs.map(env => ({
          label: env.name,
          description: `Python ${env.pythonVersion || '?'}`,
          detail: env.path
        })),
        { placeHolder: `${wslName} 中的环境` }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.openWSLTerminal', async () => {
      const remoteEnvs = await remote.detectAllEnvironments();
      const wslEnvs = remoteEnvs.filter(env => env.type === 'wsl' && env.name !== 'WSL (当前)');
      if (wslEnvs.length === 0) {
        vscode.window.showInformationMessage('未检测到 WSL');
        return;
      }
      let wslName: string;
      if (wslEnvs.length === 1) {
        wslName = wslEnvs[0].name;
      } else {
        const pick = await vscode.window.showQuickPick(
          wslEnvs.map(env => ({ label: env.name, description: env.detail })),
          { placeHolder: '选择 WSL 发行版' }
        );
        if (!pick) return;
        wslName = pick.label;
      }
      const distro = remote.getDistroName(wslName);
      const terminal = vscode.window.createTerminal({
        name: `WSL: ${distro}`,
        shellPath: 'wsl.exe',
        shellArgs: ['-d', distro]
      });
      terminal.show();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.diskDiagnose', async () => {
      vscode.window.showInformationMessage(disk.diagnose().join('\n'));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.cleanCache', async () => {
      const choice = await vscode.window.showQuickPick([
        { label: '🧹 清理 Conda 缓存', description: 'conda clean -afy', value: 'conda' as const },
        { label: '🧹 清理 pip 缓存', description: 'rm -rf ~/.cache/pip', value: 'pip' as const },
        { label: '🧹 全部清理', description: '同时清理 conda + pip', value: 'all' as const },
      ], { placeHolder: '选择要清理的缓存' });
      if (!choice) return;
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '清理缓存' },
        async () => await disk.cleanCaches(choice.value)
      );
      const freedStr = result.freedBytes > 0 ? `释放了 ${formatBytes(result.freedBytes)}` : '未检测到可释放空间';
      logger.log(`缓存清理完成: ${freedStr}`);
      vscode.window.showInformationMessage(`清理完成！${freedStr}，当前可用: ${result.freeGB}`);
    })
  );
}
