import * as vscode from 'vscode';
import { CommandContext } from './context';

export function registerInterpreterCommands(ctx: CommandContext): void {
  const { context, interpreter } = ctx;

  // Interpreter selection is delegated to the Python extension's own picker,
  // so this is a thin shortcut to it.
  context.subscriptions.push(
    vscode.commands.registerCommand('conda-assistant.selectInterpreter', async () => {
      await interpreter.selectInterpreter();
    })
  );
}
