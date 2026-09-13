import * as vscode from 'vscode';
import { CommandContext } from './context';
import { getEnvName, requireLocalEnv, refreshEnvironments } from './helpers';

export function registerPackageCommands(ctx: CommandContext): void {
  const { context, conda, envTree } = ctx;

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.installPackage', async (item: unknown) => {
      const envName = getEnvName(item);
      if (envName && !requireLocalEnv(envName)) return;
      if (!envName) {
        const info = await conda.getCondaInfo();
        if (!info) return;
        const pick = await vscode.window.showQuickPick(
          info.envs.map(env => ({ label: env.name, description: env.pythonVersion })),
          { placeHolder: '选择环境' }
        );
        if (!pick) return;
        const pkgName = await vscode.window.showInputBox({ prompt: '输入包名' });
        if (!pkgName) return;
        await conda.installPackage(pick.label, pkgName);
      } else {
        const pkgName = await vscode.window.showInputBox({ prompt: `安装包到 ${envName}` });
        if (!pkgName) return;
        await conda.installPackage(envName, pkgName);
      }
      await refreshEnvironments(conda, envTree);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.uninstallPackage', async (item: unknown) => {
      const resolveEnv = async (): Promise<string | undefined> => {
        const name = getEnvName(item);
        if (name) {
          if (!requireLocalEnv(name)) return undefined;
          return name;
        }
        const info = await conda.getCondaInfo();
        if (!info) return undefined;
        const pick = await vscode.window.showQuickPick(
          info.envs.map(env => ({ label: env.name, description: env.pythonVersion })),
          { placeHolder: '选择环境' }
        );
        return pick?.label;
      };
      const envName = await resolveEnv();
      if (!envName) return;

      const packages = await conda.listPackagesJSON(envName);
      if (!packages || packages.length === 0) {
        vscode.window.showInformationMessage(`环境 ${envName} 中没有可卸载的包`);
        return;
      }
      const pkgChoices = packages.map(pkg => ({
        label: pkg.name,
        description: pkg.version,
        detail: pkg.channel || '',
      }));
      const selected = await vscode.window.showQuickPick(pkgChoices, {
        placeHolder: `选择 ${envName} 中要卸载的包`,
        matchOnDescription: true,
      });
      if (!selected) return;

      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `卸载 ${selected.label}` },
        async () => await conda.uninstallPackage(envName, selected.label)
      );
      if (result.success) {
        vscode.window.showInformationMessage(`已从 ${envName} 卸载 ${selected.label}`);
        await refreshEnvironments(conda, envTree);
      } else {
        vscode.window.showErrorMessage(`卸载 ${selected.label} 失败: ${result.error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.showPackageDeps', async (item: unknown) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (!requireLocalEnv(envName)) return;
      const pkgName = await vscode.window.showInputBox({ prompt: '输入要查看依赖的包名' });
      if (!pkgName) return;
      const deps = await conda.getPackageDeps(envName, pkgName);
      if (deps.length === 0) {
        vscode.window.showInformationMessage(`${pkgName} 没有依赖或未找到`);
      } else {
        vscode.window.showInformationMessage(`${pkgName} 依赖:\n${deps.join('\n')}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.detectConflict', async (item: unknown) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (!requireLocalEnv(envName)) return;
      const conflicts = await conda.detectConflicts(envName);
      if (conflicts.length === 0) {
        vscode.window.showInformationMessage(`环境 ${envName} 未检测到依赖冲突`);
      } else {
        vscode.window.showWarningMessage(`检测到 ${conflicts.length} 个潜在冲突:\n${conflicts.join('\n\n')}`);
      }
    })
  );
}
