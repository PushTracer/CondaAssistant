import * as vscode from 'vscode';
import { CommandContext } from './context';

export function registerInterpreterCommands(ctx: CommandContext): void {
  const { context, interpreter } = ctx;

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.switchInterpreter', async (envName: string) => {
      if (!envName) return;
      const pyPath = interpreter.getEnvPythonPath(envName);
      if (!pyPath) {
        vscode.window.showWarningMessage(`未找到环境 ${envName} 的 Python 解释器`);
        return;
      }
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `正在切换解释器到 ${envName}...`
      }, async () => {
        const ok = await interpreter.autoSelectCondaEnv(envName);
        if (ok) {
          vscode.window.showInformationMessage(`已切换解释器到 ${envName} (${pyPath})`);
        } else {
          vscode.window.showWarningMessage('切换解释器失败，请检查输出面板');
        }
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.selectInterpreter', async () => {
      await interpreter.selectInterpreter();
    })
  );
}
