import * as vscode from 'vscode';
import { CommandContext } from './context';
import { getEnvName, requireLocalEnv, refreshEnvironments } from './helpers';

export function registerBackupCommands(ctx: CommandContext): void {
  const { context, conda, backup, envTree } = ctx;

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.exportEnvironment', async (item: unknown) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (!requireLocalEnv(envName)) return;
      await backup.backupEnvironment(envName);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.importEnvironment', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '恢复环境' },
        async (progress) => {
          progress.report({ message: '正在安装依赖...' });
          await conda.importEnvironment();
        }
      );
      await refreshEnvironments(conda, envTree);
    })
  );
}
