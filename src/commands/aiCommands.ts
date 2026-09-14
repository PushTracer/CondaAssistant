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

  async function runQuickCreate(commandCtx: CommandContext): Promise<void> {
    const templateChoice = await vscode.window.showQuickPick(
      AI_ENV_TEMPLATES.map(template => ({
        label: template.label,
        description: template.description,
        detail: `Python ${template.pythonVersion}`,
        template
      })),
      { placeHolder: vscode.l10n.t('选择 AI 环境模板') }
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

    let cudaChoice: { label: string; value: string; extraPip: string[]; pythonTags?: string[] };
    if (variants.length === 1) {
      cudaChoice = {
        label: variants[0].label,
        value: variants[0].cudaVersion,
        extraPip: variants[0].extraPip || [],
        pythonTags: variants[0].pythonTags
      };
    } else {
      const choice = await vscode.window.showQuickPick(
        variants.map(variant => ({
          label: variant.label,
          description: variant.cudaVersion ? `CUDA ${variant.cudaVersion}` : '',
          value: variant.cudaVersion,
          extraPip: variant.extraPip || [],
          pythonTags: variant.pythonTags
        })),
        { placeHolder: vscode.l10n.t('选择 {0} 版本', template.label) }
      );
      if (!choice) return;
      cudaChoice = choice;
    }

    const defaultName = template.name + (cudaChoice.value ? '-' + cudaChoice.value : '');
    const envName = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('环境名称'),
      value: defaultName,
      validateInput: (value) => (value ? null : vscode.l10n.t('环境名不能为空'))
    });
    if (!envName) return;

    const pyVersion = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('Python 版本'),
      value: template.pythonVersion,
      validateInput: (value) => (/^\d+\.\d+$/.test(value) ? null : vscode.l10n.t('格式: x.y (如 3.12)'))
    });
    if (!pyVersion) return;

    const pyTag = `cp${pyVersion.replace(/\./g, '')}`;
    if (cudaChoice.pythonTags && cudaChoice.pythonTags.length > 0 && !cudaChoice.pythonTags.includes(pyTag)) {
      const proceed = await vscode.window.showWarningMessage(
        vscode.l10n.t('所选版本没有适配 Python {0} 的 torch 包（该索引可用: {1}），继续安装大概率失败。', pyVersion, cudaChoice.pythonTags.join(' / ')),
        { modal: true },
        vscode.l10n.t('仍然继续'), vscode.l10n.t('返回重选')
      );
      if (proceed !== vscode.l10n.t('仍然继续')) return;
    }

    const allPipPackages = [...new Set([...template.pipPackages, ...(cudaChoice.extraPip || [])])];
    const extraPipStr = await vscode.window.showInputBox({
      prompt: vscode.l10n.t('额外 pip 包（空格分隔，可选）'),
      placeHolder: vscode.l10n.t('例如: wandb tensorboard tqdm'),
    });
    if (extraPipStr) {
      allPipPackages.push(...extraPipStr.split(/\s+/).filter(Boolean));
    }

    const timeout = getConfig().condaInstallTimeout || 600000;
    const outputChannel = vscode.window.createOutputChannel(vscode.l10n.t('安装 {0}', envName));
    commandCtx.context.subscriptions.push(outputChannel);
    outputChannel.show(true);
    outputChannel.appendLine(vscode.l10n.t('创建环境 {0} (Python {1})', envName, pyVersion));

    const report = checkInstallSpace(envName);
    if (!report.sufficient || report.warnings.length > 0) {
      outputChannel.appendLine(vscode.l10n.t('磁盘检查: HOME={0}, /tmp={1}, inode={2}', report.home.freeGB, report.tmp.freeGB, report.inodes));
      for (const warning of report.warnings) outputChannel.appendLine(`  ⚠ ${warning}`);
      const cleanAction = vscode.l10n.t('清理缓存并继续');
      const userChoice = await vscode.window.showWarningMessage(
        vscode.l10n.t('安装环境 {0} 前检测到 {1} 个问题', envName, String(report.warnings.length)),
        { modal: true, detail: report.warnings.join('\n') },
        cleanAction, vscode.l10n.t('忽略风险继续')
      );
      if (!userChoice) return;
      if (userChoice === cleanAction) {
        outputChannel.appendLine(vscode.l10n.t('>>> 清理 conda 缓存...'));
        await execConda(['clean', '-afy'], 60000);
        outputChannel.appendLine(vscode.l10n.t('>>> 清理 pip 缓存...'));
        await disk.purgePipCache();
        const after = getFreeDiskSpace();
        outputChannel.appendLine(vscode.l10n.t('清理后可用空间: {0}', after.freeGB));
        const afterReport = checkInstallSpace(envName);
        if (!afterReport.sufficient) {
          vscode.window.showErrorMessage(vscode.l10n.t('清理后仍有问题:\n{0}', afterReport.warnings.join('\n')));
          return;
        }
      }
    }

    let lastSpeed = '';
    let completed = false;
    let torchUnavailable = false;
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('创建 {0}', envName), cancellable: true },
        async (progress, token) => {
          outputChannel.appendLine(vscode.l10n.t('>>> conda create -n {0} python={1}', envName, pyVersion));
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
            (err) => { outputChannel.appendLine(vscode.l10n.t('conda 错误: {0}', err.message)); },
            timeout
          );
          if (token.isCancellationRequested) {
            outputChannel.appendLine(vscode.l10n.t('已取消'));
            return;
          }

          const pipPath = getEnvPipPath(envName);
          if (!fs.existsSync(pipPath)) {
            const installPipLabel = vscode.l10n.t('安装 pip');
            const skipPipLabel = vscode.l10n.t('跳过');
            const installPip = await vscode.window.showWarningMessage(
              vscode.l10n.t('环境 {0} 中未检测到 pip，是否安装？', envName),
              { modal: true },
              installPipLabel, skipPipLabel
            );
            if (!installPip || installPip === skipPipLabel) {
              outputChannel.appendLine(vscode.l10n.t('跳过 pip 安装，将尝试 python -m pip'));
            } else {
              outputChannel.appendLine(vscode.l10n.t('>>> conda install pip'));
              await spawnConda(
                ['install', '-y', '-n', envName, 'pip'],
                (line) => outputChannel.appendLine(line),
                (err) => { outputChannel.appendLine(vscode.l10n.t('pip 安装错误: {0}', err.message)); },
                120000
              );
            }
          }

          if (allPipPackages.length > 0) {
            outputChannel.appendLine('');
            outputChannel.appendLine(vscode.l10n.t('>>> {0} install {1}', getEnvPipPath(envName), allPipPackages.join(' ')));
            await spawnPipInEnv(
              envName,
              ['install', ...allPipPackages],
              (line) => {
                outputChannel.appendLine(line);
                if (/No matching distribution found for torch|Could not find a version that satisfies the requirement torch/i.test(line)) {
                  torchUnavailable = true;
                }
                const download = line.match(/(\S+)\s+([\d.]+[kMG]B)\s+[\d.]+\w+\s+([\d.]+[kMG]B\/s])/);
                if (download) {
                  lastSpeed = `${download[1]} ${download[2]} @ ${download[3]}`;
                  progress.report({ message: lastSpeed });
                }
              },
              (err) => { outputChannel.appendLine(vscode.l10n.t('pip 错误: {0}', err.message)); },
              timeout
            );
          }
          if (token.isCancellationRequested) {
            outputChannel.appendLine(vscode.l10n.t('已取消'));
            return;
          }
          completed = true;
          outputChannel.appendLine('');
          outputChannel.appendLine(vscode.l10n.t('环境创建完成！'));
        }
      );
      if (completed) {
        vscode.window.showInformationMessage(vscode.l10n.t('环境 {0} 创建完成！', envName));
      } else {
        vscode.window.showWarningMessage(vscode.l10n.t('环境 {0} 创建已取消', envName));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine('');
      outputChannel.appendLine(vscode.l10n.t('创建失败: {0}', message));
      if (torchUnavailable) {
        outputChannel.appendLine(vscode.l10n.t('提示: 该 CUDA 索引下没有适配当前 Python 版本的 torch 轮子，请更换 CUDA 版本或 Python 版本后重试。'));
      }
      vscode.window.showErrorMessage(vscode.l10n.t('环境创建失败: {0}', message));
    }
  }
}
