import { CommandContext } from './context';
import { registerEnvironmentCommands } from './environmentCommands';
import { registerPackageCommands } from './packageCommands';
import { registerAiCommands } from './aiCommands';
import { registerBackupCommands } from './backupCommands';
import { registerInterpreterCommands } from './interpreterCommands';
import { registerMaintenanceCommands } from './maintenanceCommands';

export function registerCommands(ctx: CommandContext): void {
  registerEnvironmentCommands(ctx);
  registerPackageCommands(ctx);
  registerAiCommands(ctx);
  registerBackupCommands(ctx);
  registerInterpreterCommands(ctx);
  registerMaintenanceCommands(ctx);
}

export { CommandContext } from './context';
