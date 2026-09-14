import * as vscode from 'vscode';
import { Logger } from './core/logger';
import { getConfig } from './core/config';
import { CondaService } from './services/condaService';
import { HealthService } from './services/healthService';
import { InterpreterService } from './services/interpreterService';
import { RemoteService } from './services/remoteService';
import { DiskService } from './services/diskService';
import { PytorchTestService } from './services/pytorchTestService';
import { EnvironmentsTreeProvider } from './views/environmentsTree';
import { QuickActionsTreeProvider } from './views/quickActionsTree';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Conda Manager');
  const logger = new Logger(outputChannel);
  logger.log(vscode.l10n.t('Conda Manager 启动中...'));

  const conda = new CondaService(logger);
  const health = new HealthService(logger);
  const interpreter = new InterpreterService(logger);
  const remote = new RemoteService(logger);
  const disk = new DiskService(logger);
  const pytorchTest = new PytorchTestService(logger);

  const envTree = new EnvironmentsTreeProvider(conda);
  const quickActions = new QuickActionsTreeProvider();

  context.subscriptions.push(
    outputChannel,
    vscode.window.registerTreeDataProvider('condaEnvironments', envTree),
    vscode.window.registerTreeDataProvider('condaQuickActions', quickActions)
  );

  registerCommands({ context, logger, conda, health, interpreter, remote, disk, pytorchTest, envTree });

  if (getConfig().autoDetectConda) {
    void initialize(logger, conda, health, remote, envTree);
  }

  logger.log(vscode.l10n.t('Conda Manager 已激活'));
}

async function initialize(
  logger: Logger,
  conda: CondaService,
  health: HealthService,
  remote: RemoteService,
  envTree: EnvironmentsTreeProvider
): Promise<void> {
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Window,
    title: vscode.l10n.t('Conda Manager 初始化中...'),
  }, async (progress) => {
    try {
      progress.report({ message: vscode.l10n.t('检测 Conda 环境') });
      logger.log(vscode.l10n.t('正在检测 Conda 环境...'));
      const remoteEnvs = await remote.detectAllEnvironments();
      const wslEnv = remoteEnvs.find(env => env.type === 'wsl' && env.name !== vscode.l10n.t('WSL (当前)'));
      if (remoteEnvs.length > 1) {
        logger.log(vscode.l10n.t('检测到 {0} 个运行环境:', String(remoteEnvs.length)));
        for (const env of remoteEnvs) {
          logger.log(`  - ${env.type}: ${env.name}`);
        }
      }

      progress.report({ message: vscode.l10n.t('获取 Conda 环境列表') });
      const info = await conda.getCondaInfo();
      if (info) {
        logger.log(vscode.l10n.t('Conda {0} | {1} 个环境', info.condaVersion, String(info.envs.length)));
        const allEnvs = [...info.envs];
        if (wslEnv) {
          try {
            progress.report({ message: vscode.l10n.t('扫描 WSL 环境') });
            const wslEnvs = await remote.getWSLEnvironments(wslEnv.name);
            for (const wsl of wslEnvs) {
              wsl.name = `🐧 ${wsl.name} (WSL)`;
              allEnvs.push(wsl);
            }
            logger.log(vscode.l10n.t('  + {0} 个 WSL 环境', String(wslEnvs.length)));
          } catch (err) {
            logger.error(vscode.l10n.t('WSL 环境扫描失败'), err);
          }
        }
        envTree.refresh(allEnvs);
        logger.log(vscode.l10n.t('环境列表已加载'));
        progress.report({ message: vscode.l10n.t('已加载 {0} 个环境（展开查看详情）', String(allEnvs.length)) });
      } else {
        logger.log(vscode.l10n.t('未检测到 Conda'));
        if (remote.isWSL()) {
          vscode.window.showWarningMessage(vscode.l10n.t('WSL 环境中未检测到 Conda。请在 WSL 中安装 Conda。'));
        } else {
          const setupAction = vscode.l10n.t('查看安装指南');
          vscode.window.showWarningMessage(
            vscode.l10n.t('未检测到 Conda。请安装 Miniconda 或 Anaconda，或在设置中配置 conda-assistant.condaPath。'),
            setupAction
          ).then(action => {
            if (action === setupAction) {
              vscode.env.openExternal(vscode.Uri.parse('https://docs.conda.io/en/latest/miniconda.html'));
            }
          });
        }
      }

      if (getConfig().healthCheckOnStartup && info) {
        progress.report({ message: vscode.l10n.t('执行健康检查...') });
        logger.log(vscode.l10n.t('正在执行启动健康检查...'));
        const result = await health.runFullCheck();
        const errors = result.checks.filter(check => check.status === 'error');
        const warnings = result.checks.filter(check => check.status === 'warning');
        if (errors.length > 0) {
          vscode.window.showWarningMessage(vscode.l10n.t(
            '健康检查: {0}/100 | {1} 个错误, {2} 个警告',
            String(result.score), String(errors.length), String(warnings.length)
          ));
        }
        logger.log(vscode.l10n.t('健康检查完成: {0}/100', String(result.score)));
      }
    } catch (err) {
      logger.error(vscode.l10n.t('初始化失败'), err);
    }
  });
}

export function deactivate(): void {
  // no resources to release
}
