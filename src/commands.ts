import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CondaManager } from './condaManager';
import { HealthChecker } from './healthChecker';
import { CondaEnvTreeProvider, CondaQuickActionsProvider } from './treeView';
import { RemoteAdapter } from './remoteAdapter';
import { InterpreterManager } from './interpreterManager';
import { BackupManager } from './backupManager';
import { AI_ENV_TEMPLATES, fetchPyTorchCudaVariants } from './aiRecommendation';
import { spawnConda, spawnPipInEnv, getEnvPipPath, getFreeDiskSpace, execConda, execCommand, formatBytes, checkInstallSpace } from './utils';

function getEnvName(item: any): string | undefined {
  if (!item) return undefined;
  const raw = item.label?.replace(/^✓\s*/, '') || item.id || '';
  const name = raw.trim();
  return name || undefined;
}

function isWSLEnv(envName: string): boolean {
  return envName.includes('(WSL)');
}

function requireLocalEnv(envName: string): boolean {
  if (isWSLEnv(envName)) {
    vscode.window.showWarningMessage('WSL 环境暂不支持此操作，请在 WSL 终端中直接操作');
    return false;
  }
  return true;
}
export function registerCommands(
  context: vscode.ExtensionContext,
  condaManager: CondaManager,
  envTreeProvider: CondaEnvTreeProvider,
  _quickActionsProvider: CondaQuickActionsProvider,
  outputChannel: vscode.OutputChannel,
  remoteAdapter: RemoteAdapter
): void {
  const healthChecker = new HealthChecker();
  const interpreterManager = new InterpreterManager(outputChannel);
  const backupManager = new BackupManager(outputChannel);

  const refreshEnvironments = async () => {
    const info = await condaManager.getCondaInfo();
    if (info) {
      envTreeProvider.refresh(info.envs);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.refresh', refreshEnvironments)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.createEnvironment', async () => {
      const name = await vscode.window.showInputBox({
        prompt: '输入环境名称',
        placeHolder: '例如: myenv',
        validateInput: (val) => val ? null : '环境名不能为空'
      });
      if (!name) return;
      const config = vscode.workspace.getConfiguration('conda-assistant');
      const defaultPy = config.get<string>('defaultPythonVersion') || '3.12';
      const pyVersion = await vscode.window.showInputBox({
        prompt: 'Python 版本',
        value: defaultPy
      });
      if (!pyVersion) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `创建环境 ${name}` },
        async () => { await condaManager.createEnvironment(name, pyVersion); }
      );
      await refreshEnvironments();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.deleteEnvironment', async (item: any) => {
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
        async () => { return await condaManager.deleteEnvironment(envName); }
      );
      if (deleted) await refreshEnvironments();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.activateEnvironment', async (item: any) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (isWSLEnv(envName)) {
        vscode.window.showWarningMessage('请在 WSL 终端中使用 source ~/miniconda3/etc/profile.d/conda.sh && conda activate 激活 WSL 环境');
        return;
      }
      await condaManager.activateEnvironment(envName);
      await interpreterManager.autoSelectCondaEnv(envName);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.quickCreate', async () => {
      const templateChoice = await vscode.window.showQuickPick(
        AI_ENV_TEMPLATES.map(t => ({
          label: t.label,
          description: t.description,
          detail: `Python ${t.pythonVersion}`,
          template: t
        })),
        { placeHolder: '选择 AI 环境模板' }
      );
      if (!templateChoice) return;
      const template = templateChoice.template;
      let cudaChoice: { label: string; value: string; extraPip: string[] };
      let variants = template.cudaVariants;
      if (template.name === 'pytorch' || template.name === 'computervision' || template.name === 'nlp') {
        const fetched = await fetchPyTorchCudaVariants();
        if (template.name === 'computervision') {
          fetched.forEach(v => {
            v.extraPip = (v.extraPip || []).filter(p => p !== 'torchaudio');
          });
        }
        if (template.name === 'nlp') {
          fetched.forEach(v => {
            v.extraPip = (v.extraPip || []).filter(p => p !== 'torchvision' && p !== 'torchaudio');
          });
        }
        variants = fetched;
      }
      if (variants.length === 1) {
        cudaChoice = {
          label: variants[0].label,
          value: variants[0].cudaVersion,
          extraPip: variants[0].extraPip || []
        };
      } else {
        const choice = await vscode.window.showQuickPick(
          variants.map(v => ({
            label: v.label,
            description: v.cudaVersion ? `CUDA ${v.cudaVersion}` : '',
            value: v.cudaVersion,
            extraPip: v.extraPip || []
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
        validateInput: (val) => val ? null : '环境名不能为空'
      });
      if (!envName) return;
      const pyVersion = await vscode.window.showInputBox({
        prompt: 'Python 版本',
        value: template.pythonVersion,
        validateInput: (v) => /^\d+\.\d+$/.test(v) ? null : '格式: x.y (如 3.12)'
      });
      if (!pyVersion) return;
      const allPipPkgs = [...new Set([...template.pipPackages, ...(cudaChoice.extraPip || [])])];
      const extraPipStr = await vscode.window.showInputBox({
        prompt: '额外 pip 包（空格分隔，可选）',
        placeHolder: '例如: wandb tensorboard tqdm',
      });
      if (extraPipStr) {
        allPipPkgs.push(...extraPipStr.split(/\s+/).filter(Boolean));
      }
      const config = vscode.workspace.getConfiguration('conda-assistant');
      const timeout = config.get<number>('condaInstallTimeout') || 600000;
      const outputChannel = vscode.window.createOutputChannel(`安装 ${envName}`);
      outputChannel.show(true);
      outputChannel.appendLine(`创建环境 ${envName} (Python ${pyVersion})`);

      // disk space & inode check
      const report = checkInstallSpace(envName);
      if (!report.sufficient || report.warnings.length > 0) {
        outputChannel.appendLine(`磁盘检查: HOME=${report.home.freeGB}, /tmp=${report.tmp.freeGB}, inode=${report.inodes}`);
        for (const w of report.warnings) outputChannel.appendLine(`  ⚠ ${w}`);
        const cleanAction = '清理缓存并继续';
        const detail = report.warnings.join('\n');
        const userChoice = await vscode.window.showWarningMessage(
          `安装环境 ${envName} 前检测到 ${report.warnings.length} 个问题`,
          { modal: true, detail },
          cleanAction, '忽略风险继续'
        );
        if (!userChoice) return;
        if (userChoice === cleanAction) {
          outputChannel.appendLine('>>> 清理 conda 缓存...');
          await execConda(['clean', '-afy'], 60000);
          outputChannel.appendLine('>>> 清理 pip 缓存...');
          try { await execCommand('rm -rf ~/.cache/pip 2>/dev/null', 10000); } catch { /* ignore */ }
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
          async (_progress, token) => {
            outputChannel.appendLine('>>> conda create -n ' + envName + ' python=' + pyVersion);
            await spawnConda(
              ['create', '-y', '-n', envName, `python=${pyVersion}`],
              (line) => {
                outputChannel.appendLine(line);
                const dl = line.match(/([\d.]+\s+[kMG]B)\s+\|/);
                if (dl) lastSpeed = dl[1];
                if (line.includes('#')) {
                  const m = line.match(/#\s*\[?\s*(\d+)\s*\/\s*(\d+)\]?/);
                  if (m) {
                    const pct = Math.round((parseInt(m[1]) / parseInt(m[2])) * 100);
                    _progress.report({ message: `${lastSpeed}  ${pct}%`, increment: 1 });
                  }
                }
              },
              (err) => { outputChannel.appendLine(`conda 错误: ${err.message}`); },
              timeout
            );
            if (token.isCancellationRequested) { outputChannel.appendLine('已取消'); return; }

            // ensure pip is installed
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
                  (l) => outputChannel.appendLine(l),
                  (err) => { outputChannel.appendLine(`pip 安装错误: ${err.message}`); },
                  120000
                );
              }
            }

            if (allPipPkgs.length > 0) {
              outputChannel.appendLine(`\n>>> ${getEnvPipPath(envName)} install ${allPipPkgs.join(' ')}`);
              await spawnPipInEnv(
                envName,
                ['install', ...allPipPkgs],
                (line) => {
                  outputChannel.appendLine(line);
                  const dl = line.match(/(\S+)\s+([\d.]+[kMG]B)\s+[\d.]+\w+\s+([\d.]+[kMG]B\/s])/);
                  if (dl) {
                    lastSpeed = `${dl[1]} ${dl[2]} @ ${dl[3]}`;
                    _progress.report({ message: lastSpeed });
                  }
                },
                (err) => { outputChannel.appendLine(`pip 错误: ${err.message}`); },
                timeout
              );
            }
            if (token.isCancellationRequested) { outputChannel.appendLine('已取消'); return; }
            completed = true;
            outputChannel.appendLine('\n环境创建完成！');
          }
        );
        if (completed) {
          vscode.window.showInformationMessage(`环境 ${envName} 创建完成！`);
        } else {
          vscode.window.showWarningMessage(`环境 ${envName} 创建已取消`);
        }
      } catch (err: any) {
        outputChannel.appendLine(`\n创建失败: ${err.message}`);
        vscode.window.showErrorMessage(`环境创建失败: ${err.message}`);
      }
      await refreshEnvironments();
    })
  );

  let healthPanel: vscode.WebviewPanel | undefined;
  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.healthCheck', async () => {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'AI 环境健康检查' },
        async (progress) => {
          progress.report({ message: '正在检测 Conda/Python/CUDA/Torch...' });
          return await healthChecker.runFullCheck();
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
      const s = (st: string) => st === 'ok' ? '✅' : st === 'warning' ? '⚠️' : '❌';
      healthPanel.webview.html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,sans-serif;padding:20px;background:#1e1e1e;color:#d4d4d4}
.score{font-size:48px;text-align:center;padding:20px}
.sv{font-size:64px;font-weight:bold}
.checks{max-width:600px;margin:0 auto}
.ci{padding:12px;margin:8px 0;border-radius:6px;display:flex;align-items:center;gap:12px}
.ok{background:#1b3a1b;border-left:4px solid #4CAF50}
.warn{background:#3a2e1b;border-left:4px solid #FF9800}
.err{background:#3a1b1b;border-left:4px solid #f44336}
.cn{font-weight:bold;min-width:120px}
.cm{color:#aaa}
</style></head><body>
<div class=score><div class=sv style=color:${result.score>=80?'#4CAF50':result.score>=60?'#FF9800':'#f44336'}>${result.score}</div><div>/ 100</div><div style=font-size:14px;color:#888;margin-top:8px>Health Score</div></div>
<div class=checks>${result.checks.map(c => `<div class="ci ${c.status==='ok'?'ok':c.status==='warning'?'warn':'err'}"><span>${s(c.status)}</span><span class=cn>${c.name}</span><span class=cm>${c.message}</span></div>`).join('')}</div>
</body></html>`;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.analyzeEnvironment', async (item: any) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (!requireLocalEnv(envName)) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `分析 ${envName}` },
        async (progress) => {
          try {
            progress.report({ message: '读取包信息...' });
            const [listOutput, info] = await Promise.all([
              condaManager.listPackagesWithSize(envName),
              condaManager.getCondaInfo()
            ]);
            let env = info?.envs.find(e => e.name === envName);
            if (env && (!env.pythonVersion || !env.size)) {
              env = await condaManager.enrichEnvironment(env);
            }
            const envSize = env?.size || await condaManager.getEnvSize(envName);
            const doc = await vscode.workspace.openTextDocument({
              content: `# ${envName} 环境分析\n\nPython: ${env?.pythonVersion || '?'}  包: ${env?.packages || '?'}  环境目录大小: ${envSize || '?'}\n\n${listOutput}`,
              language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
          } catch (err) {
            vscode.window.showErrorMessage('环境分析失败');
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.exportEnvironment', async (item: any) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (!requireLocalEnv(envName)) return;
      await backupManager.backupEnvironment(envName);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.importEnvironment', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '恢复环境' },
        async (progress) => {
          progress.report({ message: '正在安装依赖...' });
          await condaManager.importEnvironment();
        }
      );
      await refreshEnvironments();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.switchInterpreter', async (envName: string) => {
      if (!envName) return;
      const pyPath = interpreterManager.getEnvPythonPath(envName);
      if (!pyPath) {
        vscode.window.showWarningMessage(`未找到环境 ${envName} 的 Python 解释器`);
        return;
      }
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `正在切换解释器到 ${envName}...`
      }, async () => {
        const ok = await interpreterManager.autoSelectCondaEnv(envName);
        if (ok) {
          vscode.window.showInformationMessage(`已切换解释器到 ${envName} (${pyPath})`);
        } else {
          vscode.window.showWarningMessage(`切换解释器失败，请检查输出面板`);
        }
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.selectInterpreter', async () => {
      await interpreterManager.selectInterpreter();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.installPackage', async (item: any) => {
      const envName = getEnvName(item);
      if (envName && !requireLocalEnv(envName)) return;
      if (!envName) {
        const envs = await condaManager.getCondaInfo();
        if (!envs) return;
        const pick = await vscode.window.showQuickPick(
          envs.envs.map(e => ({ label: e.name, description: e.pythonVersion })),
          { placeHolder: '选择环境' }
        );
        if (!pick) return;
        const pkgName = await vscode.window.showInputBox({ prompt: '输入包名' });
        if (!pkgName) return;
        await condaManager.installPackage(pick.label, pkgName);
      } else {
        const pkgName = await vscode.window.showInputBox({ prompt: `安装包到 ${envName}` });
        if (!pkgName) return;
        await condaManager.installPackage(envName, pkgName);
      }
      await refreshEnvironments();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.uninstallPackage', async (item: any) => {
      const getEnv = async (): Promise<string | undefined> => {
        const name = getEnvName(item);
        if (name) {
          if (!requireLocalEnv(name)) return undefined;
          return name;
        }
        const envs = await condaManager.getCondaInfo();
        if (!envs) return undefined;
        const pick = await vscode.window.showQuickPick(
          envs.envs.map(e => ({ label: e.name, description: e.pythonVersion })),
          { placeHolder: '选择环境' }
        );
        return pick?.label;
      };
      const envName = await getEnv();
      if (!envName) return;

      const pkgNames = await condaManager.listPackagesJSON(envName);
      if (!pkgNames || pkgNames.length === 0) {
        vscode.window.showInformationMessage(`环境 ${envName} 中没有可卸载的包`);
        return;
      }
      const pkgChoices = pkgNames.map(p => ({
        label: p.name,
        description: p.version,
        detail: p.channel || '',
      }));
      const selected = await vscode.window.showQuickPick(pkgChoices, {
        placeHolder: `选择 ${envName} 中要卸载的包`,
        matchOnDescription: true,
      });
      if (!selected) return;

      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `卸载 ${selected.label}` },
        async () => await condaManager.uninstallPackage(envName, selected.label)
      );
      if (result.success) {
        vscode.window.showInformationMessage(`已从 ${envName} 卸载 ${selected.label}`);
        await refreshEnvironments();
      } else {
        vscode.window.showErrorMessage(`卸载 ${selected.label} 失败: ${result.error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.showPackageDeps', async (item: any) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (!requireLocalEnv(envName)) return;
      const pkgName = await vscode.window.showInputBox({ prompt: '输入要查看依赖的包名' });
      if (!pkgName) return;
      const deps = await condaManager.getPackageDeps(envName, pkgName);
      if (deps.length === 0) {
        vscode.window.showInformationMessage(`${pkgName} 没有依赖或未找到`);
      } else {
        vscode.window.showInformationMessage(`${pkgName} 依赖:\n${deps.join('\n')}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.cloneEnvironment', async (item: any) => {
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
        async () => { await condaManager.cloneEnvironment(envName, newName); }
      );
      await refreshEnvironments();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.renameEnvironment', async (item: any) => {
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
        async () => { await condaManager.renameEnvironment(envName, newName); }
      );
      await refreshEnvironments();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.detectConflict', async (item: any) => {
      const envName = getEnvName(item);
      if (!envName) return;
      if (!requireLocalEnv(envName)) return;
      const conflicts = await condaManager.detectConflicts(envName);
      if (conflicts.length === 0) {
        vscode.window.showInformationMessage(`环境 ${envName} 未检测到依赖冲突`);
      } else {
        vscode.window.showWarningMessage(`检测到 ${conflicts.length} 个潜在冲突:\n${conflicts.join('\n\n')}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.scanWSL', async () => {
      const wslEnvs = await remoteAdapter.detectAllEnvironments();
      const wsl = wslEnvs.filter(e => e.type === 'wsl' && e.name !== 'WSL (当前)');
      if (wsl.length === 0) {
        vscode.window.showInformationMessage('未检测到 WSL Conda 环境');
        return;
      }
      const items = wsl.map(w => ({
        label: w.name,
        description: w.condaPath,
        detail: w.detail
      }));
      const selected = await vscode.window.showQuickPick(items, { placeHolder: '选择要浏览的 WSL 环境' });
      if (!selected) return;
      const wslName = selected.label;
      const wslCondaEnvs = await remoteAdapter.getWSLEnvironments(wslName);
      if (wslCondaEnvs.length === 0) {
        vscode.window.showInformationMessage(`${wslName} 中未找到 Conda 环境`);
        return;
      }
      const envNames = wslCondaEnvs.map(e => ({
        label: e.name,
        description: `Python ${e.pythonVersion || '?'}`,
        detail: e.path
      }));
      vscode.window.showQuickPick(envNames, { placeHolder: `${wslName} 中的环境` });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.diskDiagnose', async () => {
      const home = process.env.HOME || '/home';
      const reportLines: string[] = [];
      const paths = ['/', '/tmp', home, path.join(home, '.cache', 'pip'), path.join(home, 'miniconda3')];
      reportLines.push('磁盘空间诊断');
      for (const p of paths) {
        const space = getFreeDiskSpace(p);
        reportLines.push(`  ${p}  →  ${space.freeGB} 空闲`);
      }
      try {
        const out = await execCommand(`df -i "${home}" 2>/dev/null | tail -1`, 5000);
        const parts = out.trim().split(/\s+/);
        if (parts.length >= 5) {
          reportLines.push(`  inode  →  已用 ${parts[3]}/${parts[1]} (${parts[4]})`);
        }
      } catch { }
      vscode.window.showInformationMessage(reportLines.join('\n'));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.cleanCache', async () => {
      const choice = await vscode.window.showQuickPick([
        { label: '🧹 清理 Conda 缓存', description: 'conda clean -afy', value: 'conda' },
        { label: '🧹 清理 pip 缓存', description: 'rm -rf ~/.cache/pip', value: 'pip' },
        { label: '🧹 全部清理', description: '同时清理 conda + pip', value: 'all' },
      ], { placeHolder: '选择要清理的缓存' });
      if (!choice) return;
      const spaceBefore = getFreeDiskSpace();
      if (choice.value === 'conda' || choice.value === 'all') {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: '清理 Conda 缓存' },
          async () => { await execConda(['clean', '-afy'], 120000); }
        );
      }
      if (choice.value === 'pip' || choice.value === 'all') {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: '清理 pip 缓存' },
          async () => {
            try { await execCommand('rm -rf ~/.cache/pip 2>/dev/null', 15000); } catch { /* ignore */ }
          }
        );
      }
      const spaceAfter = getFreeDiskSpace();
      const diff = spaceAfter.free - spaceBefore.free;
      const freedStr = diff > 0 ? `释放了 ${formatBytes(diff)}` : '未检测到可释放空间';
      vscode.window.showInformationMessage(`清理完成！${freedStr}，当前可用: ${spaceAfter.freeGB}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.openWSLTerminal', async () => {
      const wslEnvs = await remoteAdapter.detectAllEnvironments();
      const wsl = wslEnvs.filter(e => e.type === 'wsl' && e.name !== 'WSL (当前)');
      if (wsl.length === 0) {
        vscode.window.showInformationMessage('未检测到 WSL');
        return;
      }
      let wslName: string;
      if (wsl.length === 1) {
        wslName = wsl[0].name;
      } else {
        const pick = await vscode.window.showQuickPick(
          wsl.map(w => ({ label: w.name, description: w.detail })),
          { placeHolder: '选择 WSL 发行版' }
        );
        if (!pick) return;
        wslName = pick.label;
      }
      const wslNameClean = wslName.replace(/^WSL:\s*/, '');
      const terminal = vscode.window.createTerminal({ name: `WSL: ${wslNameClean}`, shellPath: 'wsl.exe', shellArgs: [`-d`, wslNameClean] });
      terminal.show();
    })
  );
}


