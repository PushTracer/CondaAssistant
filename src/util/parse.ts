import { CondaEnvironment } from '../models/types';

export function parseCondaEnvList(output: string): CondaEnvironment[] {
  const envs: CondaEnvironment[] = [];
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const name = parts[0].replace(/\*/g, '').trim();
    if (!name) continue;
    const envPath = parts[parts.length - 1];
    const active = parts.slice(0, -1).some(part => part.includes('*'));
    envs.push({
      name,
      path: envPath,
      pythonVersion: '',
      packages: 0,
      size: '',
      active,
      created: new Date(),
      lastUsed: new Date()
    });
  }
  return envs;
}
