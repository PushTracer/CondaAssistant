import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../core/logger';
import { execConda, execFileChecked } from '../core/shell';
import { getEnvPath } from '../core/platform';
import { HealthCheckItem, HealthCheckResult } from '../models/types';

export class HealthService {
  constructor(private readonly logger: Logger) {}

  async runFullCheck(): Promise<HealthCheckResult> {
    const checks: HealthCheckItem[] = [];
    await this.checkConda(checks);
    const envs = await this.getCondaEnvs();
    await this.checkEnvironments(checks, envs);
    await this.checkPyTorchInEnvs(checks, envs);
    await this.checkTensorFlowInEnvs(checks, envs);
    await this.checkPipInEnvs(checks, envs);
    const score = this.calculateScore(checks);
    return { score, checks };
  }

  private async getCondaEnvs(): Promise<string[]> {
    try {
      const out = await execConda(['env', 'list', '--json']);
      const data = JSON.parse(out);
      const envs: string[] = data.envs || [];
      const root = data.conda_prefix || '';
      return envs.map((envPath: string) => (envPath === root ? 'base' : path.basename(envPath)));
    } catch (err) {
      this.logger.error('健康检查: 读取环境列表失败', err);
      return [];
    }
  }

  private calculateScore(checks: HealthCheckItem[]): number {
    const total = checks.length * 10;
    let earned = 0;
    for (const check of checks) {
      if (check.status === 'ok') earned += 10;
      else if (check.status === 'warning') earned += 5;
    }
    return total > 0 ? Math.round((earned / total) * 100) : 0;
  }

  private pyPath(envName: string): string {
    const envPath = getEnvPath(envName);
    if (!envPath) return '';
    return process.platform === 'win32'
      ? path.join(envPath, 'python.exe')
      : path.join(envPath, 'bin', 'python');
  }

  private async checkConda(checks: HealthCheckItem[]): Promise<void> {
    try {
      const output = await execConda(['--version']);
      const version = output.replace('conda ', '').trim();
      checks.push({
        name: 'Conda',
        status: 'ok',
        message: `Conda ${version} 已安装`
      });
    } catch {
      checks.push({
        name: 'Conda',
        status: 'error',
        message: '未找到 Conda，请安装 Miniconda 或 Anaconda'
      });
    }
  }

  private async checkEnvironments(checks: HealthCheckItem[], envs: string[]): Promise<void> {
    const basePy = this.pyPath('base');
    let baseVer = '?';
    if (basePy && fs.existsSync(basePy)) {
      try {
        baseVer = (await execFileChecked(basePy, ['--version'], 5000)).replace('Python ', '').trim();
      } catch {
        // keep unknown version
      }
    }
    const details = envs.map(env => {
      const py = this.pyPath(env);
      if (py && fs.existsSync(py)) return `${env}`;
      return `${env} (!)`;
    }).join(', ');
    checks.push({
      name: '环境',
      status: envs.length > 0 ? 'ok' : 'warning',
      message: `${envs.length} 个环境 | Python ${baseVer} | ${details}`
    });
  }

  private async checkPyTorchInEnvs(checks: HealthCheckItem[], envs: string[]): Promise<void> {
    let found = false;
    for (const env of envs) {
      const py = this.pyPath(env);
      if (!py || !fs.existsSync(py)) continue;
      try {
        const out = await execFileChecked(
          py,
          ['-c', 'import torch; print(torch.__version__); print(torch.cuda.is_available())'],
          10000
        );
        const lines = out.split('\n').filter(l => l.trim());
        const version = lines[0]?.trim() || '';
        const cudaAvailable = lines[1]?.trim() === 'True';
        found = true;
        checks.push({
          name: `PyTorch (${env})`,
          status: cudaAvailable ? 'ok' : 'warning',
          message: cudaAvailable
            ? `PyTorch ${version} (CUDA 可用)`
            : `PyTorch ${version} (CUDA 不可用)`
        });
        break;
      } catch {
        // try next environment
      }
    }
    if (!found) {
      checks.push({
        name: 'PyTorch',
        status: 'warning',
        message: '未在任何环境中检测到 PyTorch'
      });
    }
  }

  private async checkTensorFlowInEnvs(checks: HealthCheckItem[], envs: string[]): Promise<void> {
    let found = false;
    for (const env of envs) {
      const py = this.pyPath(env);
      if (!py || !fs.existsSync(py)) continue;
      try {
        const out = await execFileChecked(
          py,
          ['-c', "import tensorflow as tf; print(tf.__version__); print(len(tf.config.list_physical_devices('GPU')))"],
          10000
        );
        const lines = out.split('\n').filter(l => l.trim());
        const version = lines[0]?.trim() || '';
        const gpuCount = parseInt(lines[1]?.trim() || '0');
        found = true;
        checks.push({
          name: `TensorFlow (${env})`,
          status: gpuCount > 0 ? 'ok' : 'warning',
          message: gpuCount > 0
            ? `TensorFlow ${version} (GPU: ${gpuCount})`
            : `TensorFlow ${version} (仅 CPU)`
        });
        break;
      } catch {
        // try next environment
      }
    }
    if (!found) {
      checks.push({
        name: 'TensorFlow',
        status: 'info',
        message: '未在任何环境中检测到 TensorFlow'
      });
    }
  }

  private async checkPipInEnvs(checks: HealthCheckItem[], envs: string[]): Promise<void> {
    let found = false;
    for (const env of envs) {
      const py = this.pyPath(env);
      if (!py || !fs.existsSync(py)) continue;
      try {
        const pipPath = process.platform === 'win32'
          ? path.join(path.dirname(py), 'pip.exe')
          : path.join(path.dirname(py), 'pip');
        if (!fs.existsSync(pipPath)) continue;
        const out = await execFileChecked(pipPath, ['--version'], 5000);
        found = true;
        checks.push({
          name: `pip (${env})`,
          status: 'ok',
          message: out.split(' ').slice(0, 2).join(' ')
        });
        break;
      } catch {
        // try next environment
      }
    }
    if (!found) {
      checks.push({
        name: 'pip',
        status: 'warning',
        message: '未检测到 pip'
      });
    }
  }
}
