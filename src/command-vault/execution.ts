import type { CommandVaultCommand } from "./model.ts";
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
  onDidCloseTerminal?(
    listener: (terminal: CommandVaultTerminal) => void,
  ): { dispose(): unknown } | void;
}

export interface CommandVaultClipboard {
  writeText(text: string): void | Promise<void>;
}

export interface CommandVaultCommandTarget {
  id: string;
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
  getTerminalExecutionMode?: () => "current" | "dedicated";
  terminals: CommandVaultTerminalManager;
  terminalName?: string;
}

export interface CommandVaultExecutionService {
  copyCommand(command: Pick<CommandVaultCommand, "command">): Promise<void>;
  pasteCommand(command: CommandVaultExecutableCommand): Promise<void>;
  runCommand(command: CommandVaultExecutableCommand): Promise<void>;
}

type CommandVaultExecutableCommand = Pick<CommandVaultCommand, "command" | "id"> &
  Partial<Pick<CommandVaultCommand, "name">>;

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
  const commandTerminals = new Map<string, CommandVaultTerminal>();

  options.terminals.onDidCloseTerminal?.((terminal) => {
    for (const [commandKey, commandTerminal] of commandTerminals) {
      if (commandTerminal === terminal) {
        commandTerminals.delete(commandKey);
      }
    }
  });

  return {
    async copyCommand(command) {
      await options.clipboard.writeText(command.command);
    },

    async pasteCommand(command) {
      dispatchToTerminal(
        options.terminals,
        terminalName,
        commandTerminals,
        options.getTerminalExecutionMode?.() ?? "current",
        command,
        false,
      );
    },

    async runCommand(command) {
      dispatchToTerminal(
        options.terminals,
        terminalName,
        commandTerminals,
        options.getTerminalExecutionMode?.() ?? "current",
        command,
        true,
      );
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

  const commands = await readCommandsForAction(action, options);

  if (!commands) {
    return undefined;
  }

  const command = commands.find((candidate) => candidate.id === target.id);

  if (command) {
    return command;
  }

  await options.window.showWarningMessage(
    `Command Vault could not find the command to ${action}.`,
  );
  return undefined;
}

function dispatchToTerminal(
  terminals: CommandVaultTerminalManager,
  terminalName: string,
  commandTerminals: Map<string, CommandVaultTerminal>,
  terminalExecutionMode: "current" | "dedicated",
  command: CommandVaultExecutableCommand,
  addNewLine: boolean,
): void {
  const terminal =
    terminalExecutionMode === "dedicated"
      ? resolveDedicatedCommandTerminal(terminals, commandTerminals, terminalName, command)
      : terminals.activeTerminal ?? terminals.createTerminal(terminalName);

  terminal.show(false);
  terminal.sendText(command.command, addNewLine);
}

function resolveDedicatedCommandTerminal(
  terminals: CommandVaultTerminalManager,
  commandTerminals: Map<string, CommandVaultTerminal>,
  terminalName: string,
  command: CommandVaultExecutableCommand,
): CommandVaultTerminal {
  const commandKey = command.id || command.command;
  const existingTerminal = commandTerminals.get(commandKey);

  if (existingTerminal) {
    return existingTerminal;
  }

  const terminal = terminals.createTerminal(`${terminalName}: ${command.name ?? command.command}`);
  commandTerminals.set(commandKey, terminal);
  return terminal;
}

async function readCommandsForAction(
  action: CommandVaultExecutionAction,
  options: ResolveStoredCommandForActionOptions,
): Promise<CommandVaultCommand[] | undefined> {
  const workspaceFolderPath = options.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!workspaceFolderPath) {
    await options.window.showWarningMessage(
      `Command Vault needs an open workspace to ${action} commands.`,
    );
    return undefined;
  }

  return options.repository.readCommands(
    createWorkspaceId(workspaceFolderPath),
  );
}
