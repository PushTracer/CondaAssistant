import * as vscode from 'vscode';
import { Logger } from '../core/logger';
import { CondaService } from '../services/condaService';
import { HealthService } from '../services/healthService';
import { InterpreterService } from '../services/interpreterService';
import { RemoteService } from '../services/remoteService';
import { DiskService } from '../services/diskService';
import { PytorchTestService } from '../services/pytorchTestService';
import { EnvironmentsTreeProvider } from '../views/environmentsTree';

export interface CommandContext {
  context: vscode.ExtensionContext;
  logger: Logger;
  conda: CondaService;
  health: HealthService;
  interpreter: InterpreterService;
  remote: RemoteService;
  disk: DiskService;
  pytorchTest: PytorchTestService;
  envTree: EnvironmentsTreeProvider;
}
