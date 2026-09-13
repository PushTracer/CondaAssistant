import * as vscode from 'vscode';
import { Logger } from '../core/logger';
import { CondaService } from '../services/condaService';
import { HealthService } from '../services/healthService';
import { InterpreterService } from '../services/interpreterService';
import { BackupService } from '../services/backupService';
import { RemoteService } from '../services/remoteService';
import { DiskService } from '../services/diskService';
import { EnvironmentsTreeProvider } from '../views/environmentsTree';

export interface CommandContext {
  context: vscode.ExtensionContext;
  logger: Logger;
  conda: CondaService;
  health: HealthService;
  interpreter: InterpreterService;
  backup: BackupService;
  remote: RemoteService;
  disk: DiskService;
  envTree: EnvironmentsTreeProvider;
}
