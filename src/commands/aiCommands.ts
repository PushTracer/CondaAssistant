import * as vscode from 'vscode';
import * as fs from 'fs';
import { CommandContext } from './context';
import { refreshEnvironments } from './helpers';
import { getConfig } from '../core/config';
import { checkInstallSpace, getEnvPipPath, getFreeDiskSpace } from '../core/platform';
import { execConda, spawnConda, spawnPipInEnv } from '../core/shell';
import { AI_ENV_TEMPLATES } from '../ai/templates';
import { fetchPyTorchCudaVariants } from '../ai/pytorchIndex';
import { renderHealthPanel } from '../views/healthPanel';

export function registerAiCommands(ctx: CommandContext): void {
  const { context, conda, health, disk, envTree, logger } = ctx;

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
        { location: vscode.ProgressLocation.Notification, title: 'AI 环境健康检查' },
        async (progress) => {
          progress.report({ message: '正在检测 Conda/Python/CUDA/Torch...' });
          return await health.runFullCheck();
        }
      );
      if (healthPanel) {
        healthPanel.reveal(vscode.ViewColumn.One);
      } else {
        healthPanel = vscode.window.createWebviewPanel(
          'healthCheck', 'AI 环境健康检查', vscode.ViewColumn.One,
          { enableScripts: true }
        );
        healthPanel.onDidDispose(() => { healthPanel = undefined; });
      }
      healthPanel.webview.html = renderHealthPanel(result);
      logger.log(`健康检查完成: ${result.score}/100`);
    })
  );

  async function runQuickCreate(commandCtx: CommandContext): Promise<void> {
    const templateChoice = await vscode.window.showQuickPick(
      AI_ENV_TEMPLATES.map(template => ({
        label: template.label,
        description: template.description,
        detail: `Python ${template.pythonVersion}`,
        template
      })),
      { placeHolder: '选择 AI 环境模板' }
    );
    if (!templateChoice) return;
    const template = templateChoice.template;

    let variants = template.cudaVariants;
    if (template.name === 'pytorch' || template.name === 'computervision' || template.name === 'nlp') {
      const fetched = await fetchPyTorchCudaVariants();
      if (template.name === 'computervision') {
        fetched.forEach(variant => {
          variant.extraPip = (variant.extraPip || []).filter(pkg => pkg !== 'torchaudio');
        });
      }
      if (template.name === 'nlp') {
        fetched.forEach(variant => {
          variant.extraPip = (variant.extraPip || []).filter(pkg => pkg !== 'torchvision' && pkg !== 'torchaudio');
        });
      }
      variants = fetched;
    }

    let cudaChoice: { label: string; value: string; extraPip: string[] };
    if (variants.length === 1) {
      cudaChoice = {
        label: variants[0].label,
        value: variants[0].cudaVersion,
        extraPip: variants[0].extraPip || []
      };
    } else {
      const choice = await vscode.window.showQuickPick(
        variants.map(variant => ({
          label: variant.label,
          description: variant.cudaVersion ? `CUDA ${variant.cudaVersion}` : '',
          value: variant.cudaVersion,
          extraPip: variant.extraPip || []
        })),
        { placeHolder: `选择 ${template.label} 版本` }
      );
      if (!choice) return;
      cudaChoice = choice;
    }

    const defaultName = template.name + (cudaChoice.value ? '-' + cudaChoice.value : '');
    const envName = await vscode.window.showInputBox({
      prompt: '环境名称',
      value: defaultName,
      validateInput: (value) => (value ? null : '环境名不能为空')
    });
    if (!envName) return;

    const pyVersion = await vscode.window.showInputBox({
      prompt: 'Python 版本',
      value: template.pythonVersion,
      validateInput: (value) => (/^\d+\.\d+$/.test(value) ? null : '格式: x.y (如 3.12)')
    });
    if (!pyVersion) return;

    const allPipPackages = [...new Set([...template.pipPackages, ...(cudaChoice.extraPip || [])])];
    const extraPipStr = await vscode.window.showInputBox({
      prompt: '额外 pip 包（空格分隔，可选）',
      placeHolder: '例如: wandb tensorboard tqdm',
    });
    if (extraPipStr) {
      allPipPackages.push(...extraPipStr.split(/\s+/).filter(Boolean));
    }

    const timeout = getConfig().condaInstallTimeout || 600000;
    const outputChannel = vscode.window.createOutputChannel(`安装 ${envName}`);
    commandCtx.context.subscriptions.push(outputChannel);
    outputChannel.show(true);
    outputChannel.appendLine(`创建环境 ${envName} (Python ${pyVersion})`);

    const report = checkInstallSpace(envName);
    if (!report.sufficient || report.warnings.length > 0) {
      outputChannel.appendLine(`磁盘检查: HOME=${report.home.freeGB}, /tmp=${report.tmp.freeGB}, inode=${report.inodes}`);
      for (const warning of report.warnings) outputChannel.appendLine(`  ⚠ ${warning}`);
      const cleanAction = '清理缓存并继续';
      const userChoice = await vscode.window.showWarningMessage(
        `安装环境 ${envName} 前检测到 ${report.warnings.length} 个问题`,
        { modal: true, detail: report.warnings.join('\n') },
        cleanAction, '忽略风险继续'
      );
      if (!userChoice) return;
      if (userChoice === cleanAction) {
        outputChannel.appendLine('>>> 清理 conda 缓存...');
        await execConda(['clean', '-afy'], 60000);
        outputChannel.appendLine('>>> 清理 pip 缓存...');
        await disk.purgePipCache();
        const after = getFreeDiskSpace();
        outputChannel.appendLine(`清理后可用空间: ${after.freeGB}`);
        const afterReport = checkInstallSpace(envName);
        if (!afterReport.sufficient) {
          vscode.window.showErrorMessage(`清理后仍有问题:\n${afterReport.warnings.join('\n')}`);
          return;
        }
      }
    }

    let lastSpeed = '';
    let completed = false;
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `创建 ${envName}`, cancellable: true },
        async (progress, token) => {
          outputChannel.appendLine('>>> conda create -n ' + envName + ' python=' + pyVersion);
          await spawnConda(
            ['create', '-y', '-n', envName, `python=${pyVersion}`],
            (line) => {
              outputChannel.appendLine(line);
              const download = line.match(/([\d.]+\s+[kMG]B)\s+\|/);
              if (download) lastSpeed = download[1];
              if (line.includes('#')) {
                const progressMatch = line.match(/#\s*\[?\s*(\d+)\s*\/\s*(\d+)\]?/);
                if (progressMatch) {
                  const percent = Math.round((parseInt(progressMatch[1]) / parseInt(progressMatch[2])) * 100);
                  progress.report({ message: `${lastSpeed}  ${percent}%`, increment: 1 });
                }
              }
            },
            (err) => { outputChannel.appendLine(`conda 错误: ${err.message}`); },
            timeout
          );
          if (token.isCancellationRequested) {
            outputChannel.appendLine('已取消');
            return;
          }

          const pipPath = getEnvPipPath(envName);
          if (!fs.existsSync(pipPath)) {
            const installPip = await vscode.window.showWarningMessage(
              `环境 ${envName} 中未检测到 pip，是否安装？`,
              { modal: true },
              '安装 pip', '跳过'
            );
            if (!installPip || installPip === '跳过') {
              outputChannel.appendLine('跳过 pip 安装，将尝试 python -m pip');
            } else {
              outputChannel.appendLine('>>> conda install pip');
              await spawnConda(
                ['install', '-y', '-n', envName, 'pip'],
                (line) => outputChannel.appendLine(line),
                (err) => { outputChannel.appendLine(`pip 安装错误: ${err.message}`); },
                120000
              );
            }
          }

          if (allPipPackages.length > 0) {
            outputChannel.appendLine(`\n>>> ${getEnvPipPath(envName)} install ${allPipPackages.join(' ')}`);
            await spawnPipInEnv(
              envName,
              ['install', ...allPipPackages],
              (line) => {
                outputChannel.appendLine(line);
                const download = line.match(/(\S+)\s+([\d.]+[kMG]B)\s+[\d.]+\w+\s+([\d.]+[kMG]B\/s])/);
                if (download) {
                  lastSpeed = `${download[1]} ${download[2]} @ ${download[3]}`;
                  progress.report({ message: lastSpeed });
                }
              },
              (err) => { outputChannel.appendLine(`pip 错误: ${err.message}`); },
              timeout
            );
          }
          if (token.isCancellationRequested) {
            outputChannel.appendLine('已取消');
            return;
          }
          completed = true;
          outputChannel.appendLine('\n环境创建完成！');
        }
      );
      if (completed) {
        vscode.window.showInformationMessage(`环境 ${envName} 创建完成！`);
      } else {
        vscode.window.showWarningMessage(`环境 ${envName} 创建已取消`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`\n创建失败: ${message}`);
      vscode.window.showErrorMessage(`环境创建失败: ${message}`);
    }
  }
}
