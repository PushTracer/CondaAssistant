import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../core/logger';
import { getConfig } from '../core/config';
import { getCondaPath } from '../core/platform';

/**
 * Interpreter handling is deliberately thin.
 *
 * Selecting the interpreter is owned by the Python extension's own picker: it
 * handles environment discovery, per-folder scoping and persistence. This
 * service only makes sure the Python extension can *see* conda environments,
 * and opens that picker when the user asks for it.
 */
export class InterpreterService {
  constructor(private readonly logger: Logger) {}

  /**
   * The Python extension only offers environments it has discovered, and it
   * finds conda environments through `python.condaPath` (or conda on PATH).
   * Mirror the conda path we resolved so conda environments become selectable —
   * without ever overwriting a value the user set themselves.
   */
  async syncCondaPathToPythonExtension(): Promise<void> {
    try {
      const pythonConfig = vscode.workspace.getConfiguration('python');
      if (pythonConfig.get<string>('condaPath')) return;

      // Prefer an explicitly configured path, otherwise the one we detected.
      // The bare "conda" fallback is useless to the Python extension.
      const condaPath = getConfig().condaPath || getCondaPath();
      if (!condaPath || !path.isAbsolute(condaPath)) return;

      await pythonConfig.update('condaPath', condaPath, vscode.ConfigurationTarget.Global);
      this.logger.log(vscode.l10n.t('[setInterpreter] 已把 conda 路径同步到 python.condaPath: {0}', condaPath));
    } catch (err) {
      this.logger.error(vscode.l10n.t('[setInterpreter] 同步 python.condaPath 失败'), err);
    }
  }

  /** Open the Python extension's own interpreter picker. */
  async selectInterpreter(): Promise<void> {
    try {
      await vscode.commands.executeCommand('python.setInterpreter');
    } catch {
      // Some Python extension versions only expose the palette entry.
      await vscode.commands.executeCommand('workbench.action.quickOpen', '>Python: Select Interpreter');
    }
  }
}
