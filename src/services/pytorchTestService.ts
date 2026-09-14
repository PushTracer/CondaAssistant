import * as fs from 'fs';
import * as vscode from 'vscode';
import { Logger } from '../core/logger';
import { spawnProcess } from '../core/shell';
import { getEnvPythonPath } from '../core/platform';

const DEFAULT_TEST_TIMEOUT = 30 * 60 * 1000;

export class PytorchTestService {
  private readonly running = new Set<string>();

  constructor(private readonly logger: Logger) {}

  isRunning(envName: string): boolean {
    return this.running.has(envName);
  }

  async run(
    envName: string,
    scriptPath: string,
    language: 'zh' | 'en',
    onLine: (line: string) => void,
    timeout = DEFAULT_TEST_TIMEOUT
  ): Promise<void> {
    if (this.running.has(envName)) {
      throw new Error(vscode.l10n.t('环境 {0} 的测试正在进行中', envName));
    }
    const pythonPath = getEnvPythonPath(envName);
    if (!pythonPath) {
      throw new Error(vscode.l10n.t('未找到环境 {0} 的 Python 解释器', envName));
    }
    if (!fs.existsSync(scriptPath)) {
      throw new Error(vscode.l10n.t('测试脚本不存在: {0}', scriptPath));
    }

    this.running.add(envName);
    this.logger.log(vscode.l10n.t('[pytorchTest] 开始测试环境 {0} -> {1}', envName, pythonPath));
    try {
      await spawnProcess(pythonPath, [scriptPath, '--lang', language], {
        onLine,
        onError: (err) => this.logger.error(vscode.l10n.t('[pytorchTest] 进程错误 ({0})', envName), err),
        timeout,
        timeoutMessage: vscode.l10n.t('PyTorch 测试超时'),
      });
    } finally {
      this.running.delete(envName);
    }
  }
}
