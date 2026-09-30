import * as vscode from 'vscode';
import { CommandContext } from './context';
import { refreshEnvironments } from './helpers';
import { renderHealthPanel } from '../views/healthPanel';
import { runQuickCreate } from '../ai/quickCreate';

export function registerAiCommands(ctx: CommandContext): void {
  const { context, conda, health, envTree, logger } = ctx;

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.quickCreate', async () => {
      await runQuickCreate(ctx);
      await refreshEnvironments(conda, envTree);
    })
  );

  let healthPanel: vscode.WebviewPanel | undefined;
  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.healthCheck', async () => {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('环境健康检查') },
        async (progress) => {
          progress.report({ message: vscode.l10n.t('正在检测 Conda/Python/CUDA/Torch...') });
          return await health.runFullCheck();
        }
      );
      if (healthPanel) {
        healthPanel.reveal(vscode.ViewColumn.One);
      } else {
        healthPanel = vscode.window.createWebviewPanel(
          'healthCheck', vscode.l10n.t('环境健康检查'), vscode.ViewColumn.One,
          { enableScripts: true }
        );
        healthPanel.onDidDispose(() => { healthPanel = undefined; });
      }
      healthPanel.webview.html = renderHealthPanel(result);
      logger.log(vscode.l10n.t('健康检查完成: {0}/100', String(result.score)));
    })
  );
}
