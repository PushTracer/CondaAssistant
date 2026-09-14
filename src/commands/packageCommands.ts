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
          { placeHolder: vscode.l10n.t('选择环境') }
        );
        if (!pick) return;
        const pkgName = await vscode.window.showInputBox({ prompt: vscode.l10n.t('输入包名') });
        if (!pkgName) return;
        await conda.installPackage(pick.label, pkgName);
      } else {
        const pkgName = await vscode.window.showInputBox({ prompt: vscode.l10n.t('安装包到 {0}', envName) });
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
          { placeHolder: vscode.l10n.t('选择环境') }
        );
        return pick?.label;
      };
      const envName = await resolveEnv();
      if (!envName) return;

      const packages = await conda.listPackagesJSON(envName);
      if (!packages || packages.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('环境 {0} 中没有可卸载的包', envName));
        return;
      }
      const pkgChoices = packages.map(pkg => ({
        label: pkg.name,
        description: pkg.version,
        detail: pkg.channel || '',
      }));
      const selected = await vscode.window.showQuickPick(pkgChoices, {
        placeHolder: vscode.l10n.t('选择 {0} 中要卸载的包', envName),
        matchOnDescription: true,
      });
      if (!selected) return;

      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('卸载 {0}', selected.label) },
        async () => await conda.uninstallPackage(envName, selected.label)
      );
      if (result.success) {
        vscode.window.showInformationMessage(vscode.l10n.t('已从 {0} 卸载 {1}', envName, selected.label));
        await refreshEnvironments(conda, envTree);
      } else {
        vscode.window.showErrorMessage(vscode.l10n.t('卸载 {0} 失败: {1}', selected.label, result.error || ''));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.showPackageDeps', async (item: unknown) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (!requireLocalEnv(envName)) return;
      const pkgName = await vscode.window.showInputBox({ prompt: vscode.l10n.t('输入要查看依赖的包名') });
      if (!pkgName) return;
      const deps = await conda.getPackageDeps(envName, pkgName);
      if (deps.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('{0} 没有依赖或未找到', pkgName));
      } else {
        vscode.window.showInformationMessage(vscode.l10n.t('{0} 依赖:\n{1}', pkgName, deps.join('\n')));
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
        vscode.window.showInformationMessage(vscode.l10n.t('环境 {0} 未检测到依赖冲突', envName));
      } else {
        vscode.window.showWarningMessage(vscode.l10n.t('检测到 {0} 个潜在冲突:\n{1}', String(conflicts.length), conflicts.join('\n\n')));
      }
    })
  );
}
