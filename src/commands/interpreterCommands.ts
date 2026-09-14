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
          const action = '打开选择界面';
          const choice = await vscode.window.showWarningMessage(
            `未能自动切换解释器到 ${envName}，请手动执行 "Python: Select Interpreter"。`,
            action
          );
          if (choice === action) {
            await vscode.commands.executeCommand('workbench.action.quickOpen', '>Python: Select Interpreter');
          }
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
