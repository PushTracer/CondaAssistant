import * as path from 'path';
import * as fs from 'fs';
import { execConda, execCommand, HealthCheckResult, HealthCheckItem, getEnvPath } from './utils';

export class HealthChecker {
  constructor() { }

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
      return envs.map((p: string) => p === root ? 'base' : path.basename(p));
    } catch {
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
      const ver = output.replace('conda ', '').trim();
      checks.push({
        name: 'Conda',
        status: 'ok',
        message: `Conda ${ver} 已安装`
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
        baseVer = (await execCommand(`"${basePy}" --version`, 5000)).replace('Python ', '').trim();
      } catch { }
    }
    const details = envs.map(e => {
      const py = this.pyPath(e);
      if (py && fs.existsSync(py)) return `${e}`;
      return `${e} (!)`;
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
        const out = await execCommand(`"${py}" -c "import torch; print(torch.__version__); print(torch.cuda.is_available())"`, 10000);
        const lines = out.split('\n').filter(l => l.trim());
        const ver = lines[0]?.trim() || '';
        const cudaAvail = lines[1]?.trim() === 'True';
        found = true;
        checks.push({
          name: `PyTorch (${env})`,
          status: cudaAvail ? 'ok' : 'warning',
          message: cudaAvail
            ? `PyTorch ${ver} (CUDA 可用)`
            : `PyTorch ${ver} (CUDA 不可用)`
        });
        break;
      } catch { /* try next env */ }
    }
    if (!found) {
      checks.push({
        name: 'PyTorch',
        status: 'warning',
        message: `未在任何环境中检测到 PyTorch`
      });
    }
  }

  private async checkTensorFlowInEnvs(checks: HealthCheckItem[], envs: string[]): Promise<void> {
    let found = false;
    for (const env of envs) {
      const py = this.pyPath(env);
      if (!py || !fs.existsSync(py)) continue;
      try {
        const out = await execCommand(`"${py}" -c "import tensorflow as tf; print(tf.__version__); print(len(tf.config.list_physical_devices('GPU')))"`, 10000);
        const lines = out.split('\n').filter(l => l.trim());
        const ver = lines[0]?.trim() || '';
        const gpuCount = parseInt(lines[1]?.trim() || '0');
        found = true;
        checks.push({
          name: `TensorFlow (${env})`,
          status: gpuCount > 0 ? 'ok' : 'warning',
          message: gpuCount > 0
            ? `TensorFlow ${ver} (GPU: ${gpuCount})`
            : `TensorFlow ${ver} (仅 CPU)`
        });
        break;
      } catch { /* try next env */ }
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
        const out = await execCommand(`"${pipPath}" --version`, 5000);
        found = true;
        checks.push({
          name: `pip (${env})`,
          status: 'ok',
          message: out.split(' ').slice(0, 2).join(' ')
        });
        break;
      } catch { /* try next env */ }
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
