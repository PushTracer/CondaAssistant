import * as vscode from 'vscode';
import { TreeItemArg, RemoteEnvironment } from '../models/types';
import { CondaService } from '../services/condaService';
import { RemoteService } from '../services/remoteService';
import { EnvironmentsTreeProvider } from '../views/environmentsTree';

export function getEnvName(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const arg = item as TreeItemArg;
  const raw = arg.label?.replace(/^✓\s*/, '') || arg.id || '';
  const name = raw.trim();
  return name || undefined;
}

export function isWSLEnv(envName: string): boolean {
  return envName.includes('(WSL)');
}

export function requireLocalEnv(envName: string): boolean {
  if (isWSLEnv(envName)) {
    vscode.window.showWarningMessage(vscode.l10n.t('WSL 环境暂不支持此操作，请在 WSL 终端中直接操作'));
    return false;
  }
  return true;
}

/** Let the user pick a local Conda environment by name. */
export async function pickEnvironment(
  conda: CondaService,
  placeHolder: string
): Promise<string | undefined> {
  const info = await conda.getCondaInfo();
  if (!info) return undefined;
  const pick = await vscode.window.showQuickPick(
    info.envs.map(env => ({ label: env.name, description: env.pythonVersion })),
    { placeHolder }
  );
  return pick?.label;
}

/**
 * All WSL distributions that expose a usable Conda, excluding the "current"
 * pseudo-entry (the WSL instance VS Code itself is running in).
 */
export async function listWslDistros(remote: RemoteService): Promise<RemoteEnvironment[]> {
  const remoteEnvs = await remote.detectAllEnvironments();
  return remoteEnvs.filter(env => env.type === 'wsl' && env.name !== vscode.l10n.t('WSL (当前)'));
}

export async function refreshEnvironments(
  conda: CondaService,
  envTree: EnvironmentsTreeProvider
): Promise<void> {
  const info = await conda.getCondaInfo();
  if (info) envTree.refresh(info.envs);
}
