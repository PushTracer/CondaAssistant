import * as vscode from 'vscode';

export function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err === undefined || err === null) return vscode.l10n.t('未知错误');
  return String(err);
}

export class Logger {
  constructor(private readonly channel: vscode.OutputChannel) {}

  get outputChannel(): vscode.OutputChannel {
    return this.channel;
  }

  log(message: string): void {
    this.channel.appendLine(message);
  }

  error(context: string, err: unknown): void {
    this.channel.appendLine(`${context}: ${errorToString(err)}`);
  }

  show(preserveFocus = true): void {
    this.channel.show(preserveFocus);
  }
}
