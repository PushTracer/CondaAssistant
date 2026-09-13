import * as vscode from 'vscode';

export interface CondaAssistantConfig {
  condaPath: string;
  autoDetectConda: boolean;
  defaultPythonVersion: string;
  healthCheckOnStartup: boolean;
  showInactiveEnvironments: boolean;
  enableWSLSupport: boolean;
  condaInstallTimeout: number;
}

const SECTION = 'conda-assistant';

export const CONFIG_DEFAULTS: CondaAssistantConfig = {
  condaPath: '',
  autoDetectConda: true,
  defaultPythonVersion: '3.12',
  healthCheckOnStartup: true,
  showInactiveEnvironments: true,
  enableWSLSupport: true,
  condaInstallTimeout: 600000,
};

export function getConfig(): CondaAssistantConfig {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    condaPath: config.get<string>('condaPath', CONFIG_DEFAULTS.condaPath),
    autoDetectConda: config.get<boolean>('autoDetectConda', CONFIG_DEFAULTS.autoDetectConda),
    defaultPythonVersion: config.get<string>('defaultPythonVersion', CONFIG_DEFAULTS.defaultPythonVersion),
    healthCheckOnStartup: config.get<boolean>('healthCheckOnStartup', CONFIG_DEFAULTS.healthCheckOnStartup),
    showInactiveEnvironments: config.get<boolean>('showInactiveEnvironments', CONFIG_DEFAULTS.showInactiveEnvironments),
    enableWSLSupport: config.get<boolean>('enableWSLSupport', CONFIG_DEFAULTS.enableWSLSupport),
    condaInstallTimeout: config.get<number>('condaInstallTimeout', CONFIG_DEFAULTS.condaInstallTimeout),
  };
}
