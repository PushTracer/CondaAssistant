import * as vscode from 'vscode';
import * as path from 'path';
import { CommandContext } from './context';
import { getEnvName, requireLocalEnv } from './helpers';

export function registerTestCommands(ctx: CommandContext): void {
  const { context, conda, pytorchTest } = ctx;

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.pytorchTest', async (item: unknown) => {
      let envName = getEnvName(item);
      if (!envName) {
        const info = await conda.getCondaInfo();
        if (!info) return;
        const pick = await vscode.window.showQuickPick(
          info.envs.map(env => ({ label: env.name, description: env.pythonVersion || '' })),
          { placeHolder: vscode.l10n.t('选择要测试的 Conda 环境') }
        );
        if (!pick) return;
        envName = pick.label;
      }
      if (!requireLocalEnv(envName)) return;
      if (pytorchTest.isRunning(envName)) {
        vscode.window.showWarningMessage(vscode.l10n.t('环境 {0} 的 PyTorch 测试正在进行中', envName));
        return;
      }

      const scriptPath = context.asAbsolutePath(path.join('resources', 'pytorch_test.py'));
      const language: 'zh' | 'en' = vscode.env.language.toLowerCase().startsWith('en') ? 'en' : 'zh';
      const outputChannel = vscode.window.createOutputChannel(vscode.l10n.t('PyTorch 测试 {0}', envName));
      context.subscriptions.push(outputChannel);
      outputChannel.show(true);
      outputChannel.appendLine(vscode.l10n.t('PyTorch 功能测试: {0}', envName));
      outputChannel.appendLine(vscode.l10n.t('脚本: {0}', scriptPath));
      outputChannel.appendLine('');

      let pass = 0;
      let warn = 0;
      let fail = 0;
      let torchMissing = false;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('PyTorch 测试 {0}', envName) },
        async (progress) => {
          try {
            await pytorchTest.run(envName, scriptPath, language, (line) => {
              outputChannel.appendLine(line);
              const currentTest = line.match(/^\[TEST\]\s*(.+)$/);
              if (currentTest) progress.report({ message: vscode.l10n.t('正在测试: {0}', currentTest[1]) });
              const summary = line.match(/^(PASS|WARN|FAIL)\s*:\s*(\d+)/);
              if (summary) {
                const count = parseInt(summary[2], 10);
                if (summary[1] === 'PASS') pass = count;
                else if (summary[1] === 'WARN') warn = count;
                else fail = count;
              }
              if (/No module named ['"]torch['"]/.test(line)) torchMissing = true;
            });
          } catch (err) {
            outputChannel.appendLine('');
            outputChannel.appendLine(vscode.l10n.t('运行失败: {0}', err instanceof Error ? err.message : String(err)));
          }
        }
      );

      if (torchMissing) {
        outputChannel.appendLine(vscode.l10n.t('提示: 该环境未安装 PyTorch，请先用「环境一键创建」或 pip 安装 torch。'));
        vscode.window.showWarningMessage(vscode.l10n.t('环境 {0} 未安装 PyTorch，测试无法执行', envName));
        return;
      }

      const summary = `PASS ${pass} | WARN ${warn} | FAIL ${fail}`;
      outputChannel.appendLine('');
      outputChannel.appendLine(vscode.l10n.t('测试汇总: {0}', summary));
      if (fail > 0) {
        vscode.window.showWarningMessage(vscode.l10n.t('PyTorch 测试完成 ({0}): {1}', envName, summary));
      } else {
        vscode.window.showInformationMessage(vscode.l10n.t('PyTorch 测试完成 ({0}): {1}', envName, summary));
      }
    })
  );
}
