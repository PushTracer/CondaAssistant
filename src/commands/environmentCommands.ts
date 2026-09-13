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
        prompt: '输入环境名称',
        placeHolder: '例如: myenv',
        validateInput: (value) => (value ? null : '环境名不能为空')
      });
      if (!name) return;
      const pyVersion = await vscode.window.showInputBox({
        prompt: 'Python 版本',
        value: getConfig().defaultPythonVersion || '3.12'
      });
      if (!pyVersion) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `创建环境 ${name}` },
        async () => { await conda.createEnvironment(name, pyVersion); }
      );
      await refreshEnvironments(conda, envTree);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.deleteEnvironment', async (item: unknown) => {
      const envName = getEnvName(item);
      if (!envName) {
        vscode.window.showErrorMessage('无法识别要删除的环境，请从环境列表中右键选择');
        return;
      }
      if (!requireLocalEnv(envName)) return;
      const confirm = await vscode.window.showWarningMessage(
        `确定要删除环境 "${envName}" 吗？此操作不可撤销。`,
        { modal: true },
        '确认删除'
      );
      if (confirm !== '确认删除') return;
      const deleted = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `删除 ${envName}` },
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
        vscode.window.showWarningMessage('请在 WSL 终端中使用 source ~/miniconda3/etc/profile.d/conda.sh && conda activate 激活 WSL 环境');
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
        { location: vscode.ProgressLocation.Notification, title: `分析 ${envName}` },
        async (progress) => {
          try {
            progress.report({ message: '读取包信息...' });
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
              content: `# ${envName} 环境分析\n\nPython: ${env?.pythonVersion || '?'}  包: ${env?.packages || '?'}  环境目录大小: ${envSize || '?'}\n\n${listOutput}`,
              language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
          } catch (err) {
            logger.error(`环境分析失败 (${envName})`, err);
            vscode.window.showErrorMessage('环境分析失败');
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
        prompt: '新环境名称',
        placeHolder: '例如: my-clone'
      });
      if (!newName) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `克隆 ${envName}` },
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
        prompt: '新环境名称',
        placeHolder: '输入新名称'
      });
      if (!newName) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `重命名 ${envName}` },
        async () => { await conda.renameEnvironment(envName, newName); }
      );
      await refreshEnvironments(conda, envTree);
    })
  );
}
