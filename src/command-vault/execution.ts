import type { CommandVaultCommand, CommandVaultScope } from "./model.ts";
import { createWorkspaceId } from "./model.ts";
import type { CommandVaultRepository } from "./repository.ts";

export const COMMAND_VAULT_COPY_COMMAND_ID = "commandVault.copyCommand";
export const COMMAND_VAULT_RUN_COMMAND_ID = "commandVault.runCommand";
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

export interface CommandVaultCommandTarget {
  id: string;
  scope: CommandVaultScope;
}

export interface CommandVaultExecutionWorkspaceFolder {
  uri: {
    fsPath: string;
  };
}

export interface CommandVaultExecutionWorkspace {
  workspaceFolders:
    | readonly CommandVaultExecutionWorkspaceFolder[]
    | undefined;
}

export interface CommandVaultExecutionWindow {
  showWarningMessage(message: string): void | Promise<void>;
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

export interface ResolveStoredCommandForActionOptions {
  repository: CommandVaultRepository;
  window: CommandVaultExecutionWindow;
  workspace: CommandVaultExecutionWorkspace;
}

export type CommandVaultExecutionAction = "copy" | "paste" | "run";

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

export async function resolveStoredCommandForAction(
  action: CommandVaultExecutionAction,
  target: CommandVaultCommandTarget | undefined,
  options: ResolveStoredCommandForActionOptions,
): Promise<CommandVaultCommand | undefined> {
  if (!target) {
    return undefined;
  }

  const commands =
    target.scope === "workspace"
      ? await readWorkspaceCommandsForAction(action, options)
      : await options.repository.readGlobalCommands();

  if (!commands) {
    return undefined;
  }

  const command = commands.find((candidate) => candidate.id === target.id);

  if (command) {
    return command;
  }

  await options.window.showWarningMessage(
    `Command Vault could not find the ${target.scope} command to ${action}.`,
  );
  return undefined;
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

async function readWorkspaceCommandsForAction(
  action: CommandVaultExecutionAction,
  options: ResolveStoredCommandForActionOptions,
): Promise<CommandVaultCommand[] | undefined> {
  const workspaceFolderPath = options.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!workspaceFolderPath) {
    await options.window.showWarningMessage(
      `Command Vault needs an open workspace to ${action} workspace commands.`,
    );
    return undefined;
  }

  return options.repository.readWorkspaceCommands(
    createWorkspaceId(workspaceFolderPath),
  );
}
