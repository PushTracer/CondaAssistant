import { CommandContext } from './context';
import { registerEnvironmentCommands } from './environmentCommands';
import { registerPackageCommands } from './packageCommands';
import { registerAiCommands } from './aiCommands';
import { registerTestCommands } from './testCommands';
import { registerInterpreterCommands } from './interpreterCommands';
import { registerMaintenanceCommands } from './maintenanceCommands';

export function registerCommands(ctx: CommandContext): void {
  registerEnvironmentCommands(ctx);
  registerPackageCommands(ctx);
  registerAiCommands(ctx);
  registerTestCommands(ctx);
  registerInterpreterCommands(ctx);
  registerMaintenanceCommands(ctx);
}

export { CommandContext } from './context';
