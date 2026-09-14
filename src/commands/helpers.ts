import * as vscode from 'vscode';
import { TreeItemArg } from '../models/types';
import { CondaService } from '../services/condaService';
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

export async function refreshEnvironments(
  conda: CondaService,
  envTree: EnvironmentsTreeProvider
): Promise<void> {
  const info = await conda.getCondaInfo();
  if (info) envTree.refresh(info.envs);
}
