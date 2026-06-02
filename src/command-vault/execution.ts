import type { CommandVaultCommand } from "./model.ts";

export const COMMAND_VAULT_TERMINAL_NAME = "Command Vault";

export interface CommandVaultTerminal {
  show(preserveFocus?: boolean): void;
  sendText(text: string, addNewLine?: boolean): void;
}

export interface CommandVaultTerminalManager {
  activeTerminal: CommandVaultTerminal | undefined;
  createTerminal(name: string): CommandVaultTerminal;
}

export interface CommandVaultClipboard {
  writeText(text: string): void | Promise<void>;
}

export interface CommandVaultExecutionServiceOptions {
  clipboard: CommandVaultClipboard;
  terminals: CommandVaultTerminalManager;
  terminalName?: string;
}

export interface CommandVaultExecutionService {
  copyCommand(command: Pick<CommandVaultCommand, "command">): Promise<void>;
  pasteCommand(command: Pick<CommandVaultCommand, "command">): Promise<void>;
  runCommand(command: Pick<CommandVaultCommand, "command">): Promise<void>;
}

export function createCommandVaultExecutionService(
  options: CommandVaultExecutionServiceOptions,
): CommandVaultExecutionService {
  const terminalName = options.terminalName ?? COMMAND_VAULT_TERMINAL_NAME;

  return {
    async copyCommand(command) {
      await options.clipboard.writeText(command.command);
    },

    async pasteCommand(command) {
      dispatchToTerminal(options.terminals, terminalName, command.command, false);
    },

    async runCommand(command) {
      dispatchToTerminal(options.terminals, terminalName, command.command, true);
    },
  };
}

function dispatchToTerminal(
  terminals: CommandVaultTerminalManager,
  terminalName: string,
  text: string,
  addNewLine: boolean,
): void {
  const terminal = terminals.activeTerminal ?? terminals.createTerminal(terminalName);

  terminal.show(false);
  terminal.sendText(text, addNewLine);
}
