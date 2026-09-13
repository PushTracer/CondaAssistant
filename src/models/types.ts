export interface CondaEnvironment {
  name: string;
  path: string;
  pythonVersion: string;
  packages: number;
  size: string;
  active: boolean;
  created: Date;
  lastUsed: Date;
}

export interface CondaInfo {
  condaVersion: string;
  pythonVersion: string;
  envs: CondaEnvironment[];
  defaultEnv: string;
  condaPath: string;
}

export interface InstalledPackage {
  name: string;
  version: string;
  channel: string;
}

export interface PackageInfo {
  name: string;
  version: string;
  channel: string;
  size: string;
  dependencies: string[];
}

export type HealthStatus = 'ok' | 'warning' | 'error' | 'info';

export interface HealthCheckItem {
  name: string;
  status: HealthStatus;
  message: string;
}

export interface HealthCheckResult {
  score: number;
  checks: HealthCheckItem[];
}

export type InterpreterType = 'conda' | 'venv' | 'uv' | 'poetry' | 'system';

export interface PythonInterpreter {
  path: string;
  version: string;
  type: InterpreterType;
  envName: string;
}

export type RemoteType = 'local' | 'wsl' | 'ssh' | 'container';

export interface RemoteEnvironment {
  type: RemoteType;
  name: string;
  condaPath: string;
  detail: string;
}

export interface DiskSpace {
  free: number;
  total: number;
  freeGB: string;
}

export interface DiskSpaceReport {
  home: DiskSpace;
  tmp: DiskSpace;
  inodes: string;
  cache: DiskSpace;
  warnings: string[];
  sufficient: boolean;
}

export interface InodeUsage {
  used: number;
  total: number;
  percent: number;
}

export interface TreeItemArg {
  label?: string;
  id?: string;
}
