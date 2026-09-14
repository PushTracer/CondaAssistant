import * as vscode from 'vscode';
import { CommandContext } from './context';
import { getEnvName, isWSLEnv, requireLocalEnv, refreshEnvironments } from './helpers';
import { getConfig } from '../core/config';

export function registerEnvironmentCommands(ctx: CommandContext): void {
  const { context, conda, interpreter, envTree, logger } = ctx;

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.refresh', async () => {
      await refreshEnvironments(conda, envTree);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.createEnvironment', async () => {
      const name = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('输入环境名称'),
        placeHolder: vscode.l10n.t('例如: myenv'),
        validateInput: (value) => (value ? null : vscode.l10n.t('环境名不能为空'))
      });
      if (!name) return;
      const pyVersion = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Python 版本'),
        value: getConfig().defaultPythonVersion || '3.12'
      });
      if (!pyVersion) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('创建环境 {0}', name) },
        async () => { await conda.createEnvironment(name, pyVersion); }
      );
      await refreshEnvironments(conda, envTree);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.deleteEnvironment', async (item: unknown) => {
      const envName = getEnvName(item);
      if (!envName) {
        vscode.window.showErrorMessage(vscode.l10n.t('无法识别要删除的环境，请从环境列表中右键选择'));
        return;
      }
      if (!requireLocalEnv(envName)) return;
      const confirm = await vscode.window.showWarningMessage(
        vscode.l10n.t('确定要删除环境 "{0}" 吗？此操作不可撤销。', envName),
        { modal: true },
        vscode.l10n.t('确认删除')
      );
      if (confirm !== vscode.l10n.t('确认删除')) return;
      const deleted = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('删除 {0}', envName) },
        async () => await conda.deleteEnvironment(envName)
      );
      if (deleted) await refreshEnvironments(conda, envTree);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.activateEnvironment', async (item: unknown) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (isWSLEnv(envName)) {
        vscode.window.showWarningMessage(vscode.l10n.t('请在 WSL 终端中使用 source ~/miniconda3/etc/profile.d/conda.sh && conda activate 激活 WSL 环境'));
        return;
      }
      await conda.activateEnvironment(envName);
      await interpreter.autoSelectCondaEnv(envName);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.analyzeEnvironment', async (item: unknown) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (!requireLocalEnv(envName)) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('分析 {0}', envName) },
        async (progress) => {
          try {
            progress.report({ message: vscode.l10n.t('读取包信息...') });
            const [listOutput, info] = await Promise.all([
              conda.listPackagesWithSize(envName),
              conda.getCondaInfo()
            ]);
            let env = info?.envs.find(candidate => candidate.name === envName);
            if (env && (!env.pythonVersion || !env.size)) {
              env = await conda.enrichEnvironment(env);
            }
            const envSize = env?.size || await conda.getEnvSize(envName);
            const doc = await vscode.workspace.openTextDocument({
              content: `# ${vscode.l10n.t('环境分析')}\n\nPython: ${env?.pythonVersion || '?'}  ${vscode.l10n.t('包')}: ${env?.packages || '?'}  ${vscode.l10n.t('环境目录大小')}: ${envSize || '?'}\n\n${listOutput}`,
              language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
          } catch (err) {
            logger.error(vscode.l10n.t('环境分析失败 ({0})', envName), err);
            vscode.window.showErrorMessage(vscode.l10n.t('环境分析失败'));
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.cloneEnvironment', async (item: unknown) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (!requireLocalEnv(envName)) return;
      const newName = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('新环境名称'),
        placeHolder: vscode.l10n.t('例如: my-clone')
      });
      if (!newName) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('克隆 {0}', envName) },
        async () => { await conda.cloneEnvironment(envName, newName); }
      );
      await refreshEnvironments(conda, envTree);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.renameEnvironment', async (item: unknown) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (!requireLocalEnv(envName)) return;
      const newName = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('新环境名称'),
        placeHolder: vscode.l10n.t('输入新名称')
      });
      if (!newName) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('重命名 {0}', envName) },
        async () => { await conda.renameEnvironment(envName, newName); }
      );
      await refreshEnvironments(conda, envTree);
    })
  );
}
