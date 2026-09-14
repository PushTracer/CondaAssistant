import * as fs from 'fs';
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
    onLine: (line: string) => void,
    timeout = DEFAULT_TEST_TIMEOUT
  ): Promise<void> {
    if (this.running.has(envName)) {
      throw new Error(`环境 ${envName} 的测试正在进行中`);
    }
    const pythonPath = getEnvPythonPath(envName);
    if (!pythonPath) {
      throw new Error(`未找到环境 ${envName} 的 Python 解释器`);
    }
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`测试脚本不存在: ${scriptPath}`);
    }

    this.running.add(envName);
    this.logger.log(`[pytorchTest] 开始测试环境 ${envName} -> ${pythonPath}`);
    try {
      await spawnProcess(pythonPath, [scriptPath], {
        onLine,
        onError: (err) => this.logger.error(`[pytorchTest] 进程错误 (${envName})`, err),
        timeout,
        timeoutMessage: 'PyTorch 测试超时',
      });
    } finally {
      this.running.delete(envName);
    }
  }
}
