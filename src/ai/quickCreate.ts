import * as vscode from 'vscode';
import * as fs from 'fs';
import { CommandContext } from '../commands/context';
import { getConfig } from '../core/config';
import { checkInstallSpace, getEnvPipPath, getFreeDiskSpace, getPipWorkDirs } from '../core/platform';
import { execConda, spawnConda, spawnPipInEnv } from '../core/shell';
import { AI_ENV_TEMPLATES } from './templates';
import { fetchPyTorchCudaVariants } from './pytorchIndex';
import { LIVE_PROGRESS_MIN_BYTES, PipDownloadTracker, PipSizePoller, parseCondaFrame } from './pipProgress';

/**
 * Guided "one-click" AI environment creation: template -> CUDA variant ->
 * name/python -> disk pre-check -> conda create -> pip install, streaming
 * everything into an output channel with live download progress.
 */
export async function runQuickCreate(commandCtx: CommandContext): Promise<void> {
  const { disk } = commandCtx;

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
      await execConda(['clean', '-afy'], timeout);
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

  let completed = false;
  let torchUnavailable = false;
  let cancelled = false;
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('创建 {0}', envName), cancellable: true },
      async (progress, token) => {
        token.onCancellationRequested(() => { cancelled = true; });
        outputChannel.appendLine(vscode.l10n.t('>>> conda create -n {0} python={1}', envName, pyVersion));
        await spawnConda(
          ['create', '-y', '-n', envName, `python=${pyVersion}`],
          (line) => {
            // only large packages merit live per-frame display
            const frame = parseCondaFrame(line);
            if (frame) {
              if (frame.bytes >= LIVE_PROGRESS_MIN_BYTES) {
                outputChannel.appendLine(line);
                progress.report({ message: `⬇ ${frame.name}  ${frame.percent}%` });
              }
              return;
            }
            outputChannel.appendLine(line);
          },
          (err) => { outputChannel.appendLine(vscode.l10n.t('conda 错误: {0}', err.message)); },
          timeout,
          token
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
              timeout,
              token
            );
          }
        }

        if (allPipPackages.length > 0) {
          outputChannel.appendLine('');
          outputChannel.appendLine(vscode.l10n.t('>>> {0} install {1}', getEnvPipPath(envName), allPipPackages.join(' ')));

          // --- live download speed ---
          // Channel 1: pip's textual progress ("Downloading x.whl (780.4 MB)",
          // "45.2/780.4 MB 3.2 MB/s ..."). Channel 2 (fallback when pip is
          // silent): poll bytes added to the env-local pip temp/cache dirs.
          // Per user preference only packages >= 100 MB get live display.
          const tracker = new PipDownloadTracker();
          const { tmpDir, cacheDir } = getPipWorkDirs(envName, false);
          const watchedDirs = [tmpDir, cacheDir].filter(dir => dir.length > 0);
          const sizePoller = new PipSizePoller(watchedDirs, (speed, bytes) => {
            const message = tracker.handleByteSample(speed, bytes);
            if (message) progress.report({ message });
          });

          try {
            await spawnPipInEnv(
              envName,
              ['install', ...allPipPackages],
              (line) => {
                const result = tracker.handleLine(line);
                if (result.torchUnavailable) torchUnavailable = true;
                if (result.showLine) outputChannel.appendLine(line);
                if (result.message) progress.report({ message: result.message });
              },
              (err) => { outputChannel.appendLine(vscode.l10n.t('pip 错误: {0}', err.message)); },
              timeout,
              token
            );
          } finally {
            await sizePoller.stop();
          }
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
    if (cancelled) {
      outputChannel.appendLine(vscode.l10n.t('创建失败: 已取消'));
      vscode.window.showWarningMessage(vscode.l10n.t('环境 {0} 创建已取消', envName));
    } else {
      outputChannel.appendLine(vscode.l10n.t('创建失败: {0}', message));
      if (/超时|timed out/i.test(message)) {
        outputChannel.appendLine(vscode.l10n.t('提示: 安装任务超过 {0} 毫秒未产生输出而被终止，可在设置中调大 conda-assistant.condaInstallTimeout。', String(timeout)));
      }
      if (torchUnavailable) {
        outputChannel.appendLine(vscode.l10n.t('提示: 该 CUDA 索引下没有适配当前 Python 版本的 torch 轮子，请更换 CUDA 版本或 Python 版本后重试。'));
      }
      vscode.window.showErrorMessage(vscode.l10n.t('环境创建失败: {0}', message));
    }
  }
}
