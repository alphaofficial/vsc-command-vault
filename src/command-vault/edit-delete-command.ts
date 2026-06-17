import type { CommandVaultCommand } from "./model.ts";
import { createWorkspaceId } from "./model.ts";
import type { CommandVaultRepository } from "./repository.ts";

import type {
  CommandVaultQuickPickItem,
  CommandVaultWindow,
  CommandVaultWorkspace,
  CommandVaultWorkspaceFolder,
} from "./create-command.ts";

export const COMMAND_VAULT_EDIT_COMMAND_ID = "commandVault.editCommand";
export const COMMAND_VAULT_DELETE_COMMAND_ID = "commandVault.deleteCommand";

export interface CommandVaultCommandTarget {
  id: string;
}

export interface CreateCommandVaultEditDeleteServiceOptions {
  now?: () => string;
  repository: CommandVaultRepository;
  window: CommandVaultWindow;
  workspace: CommandVaultWorkspace;
}

export interface CommandVaultEditDeleteService {
  deleteCommand(
    target?: CommandVaultCommandTarget,
  ): Promise<CommandVaultCommand | undefined>;
  editCommand(
    target?: CommandVaultCommandTarget,
  ): Promise<CommandVaultCommand | undefined>;
}

interface CommandVaultRecordPickItem extends CommandVaultQuickPickItem {
  command: CommandVaultCommand;
}

interface CommandVaultDeleteChoiceItem extends CommandVaultQuickPickItem {
  shouldDelete: boolean;
}

interface ResolvedCommandSelection {
  command: CommandVaultCommand;
  commands: CommandVaultCommand[];
  workspaceId: string;
}

export function createCommandVaultEditDeleteService(
  options: CreateCommandVaultEditDeleteServiceOptions,
): CommandVaultEditDeleteService {
  const now = options.now ?? defaultNow;

  return {
    async editCommand(target) {
      const selection = await resolveCommandSelection(
        "edit",
        target,
        options.repository,
        options.window,
        options.workspace.workspaceFolders,
      );

      if (!selection) {
        return undefined;
      }

      const nameInput = await options.window.showInputBox({
        title: "Edit Command",
        prompt: "Update the command name.",
        placeHolder: "Run tests",
        value: selection.command.name,
      });
      const name = await readRequiredInput(
        options.window,
        nameInput,
        "Command name",
      );

      if (!name) {
        return undefined;
      }

      const commandInput = await options.window.showInputBox({
        title: "Edit Command",
        prompt: "Update the terminal command.",
        placeHolder: "npm test",
        value: selection.command.command,
      });
      const commandText = await readRequiredInput(
        options.window,
        commandInput,
        "Command text",
      );

      if (!commandText) {
        return undefined;
      }

      const descriptionInput = await options.window.showInputBox({
        title: "Edit Command",
        prompt: "Update the optional description.",
        placeHolder: "Runs the test suite",
        value: selection.command.description ?? "",
      });

      if (descriptionInput === undefined) {
        return undefined;
      }

      const updatedCommand: CommandVaultCommand = {
        ...selection.command,
        name,
        command: commandText,
        description: normalizeOptionalInput(descriptionInput),
        updatedAt: now(),
      };

      const nextCommands = selection.commands.map((command) =>
        command.id === updatedCommand.id ? updatedCommand : command,
      );
      await writeScopedCommands(options.repository, selection, nextCommands);

      return updatedCommand;
    },

    async deleteCommand(target) {
      const selection = await resolveCommandSelection(
        "delete",
        target,
        options.repository,
        options.window,
        options.workspace.workspaceFolders,
      );

      if (!selection) {
        return undefined;
      }

      const confirmation = await options.window.showQuickPick(
        [
          {
            label: "Delete",
            description: `Remove "${selection.command.name}"`,
            shouldDelete: true,
          },
          {
            label: "Cancel",
            description: "Keep this command",
            shouldDelete: false,
          },
        ],
        {
          title: "Delete Command",
          placeHolder: `Delete "${selection.command.name}"?`,
        },
      );

      if (!confirmation?.shouldDelete) {
        return undefined;
      }

      const nextCommands = selection.commands.filter(
        (command) => command.id !== selection.command.id,
      );
      await writeScopedCommands(options.repository, selection, nextCommands);

      return selection.command;
    },
  };
}

async function resolveCommandSelection(
  action: "delete" | "edit",
  target: CommandVaultCommandTarget | undefined,
  repository: CommandVaultRepository,
  window: CommandVaultWindow,
  workspaceFolders: readonly CommandVaultWorkspaceFolder[] | undefined,
): Promise<ResolvedCommandSelection | undefined> {
  const workspaceFolderPath = getWorkspaceFolderPath(workspaceFolders);

  if (!workspaceFolderPath) {
    await window.showWarningMessage(
      `Command Vault needs an open workspace to ${action} commands.`,
    );
    return undefined;
  }

  const workspaceId = createWorkspaceId(workspaceFolderPath);
  const commands = await repository.readCommands(workspaceId);

  if (target) {
    const existingCommand = commands.find((command) => command.id === target.id);

    if (!existingCommand) {
      await window.showWarningMessage(
        `Command Vault could not find the command to ${action}.`,
      );
      return undefined;
    }

    return {
      command: existingCommand,
      commands,
      workspaceId,
    };
  }

  if (commands.length === 0) {
    await window.showWarningMessage(
      `Command Vault has no commands to ${action}.`,
    );
    return undefined;
  }

  const selectedCommand = await window.showQuickPick(
    commands.map((command) => ({
      label: command.name,
      description: command.description ?? undefined,
      detail: command.command,
      command,
    })),
    {
      title: `${capitalizeAction(action)} Command`,
      placeHolder: `Select a command to ${action}`,
    },
  );

  if (!selectedCommand) {
    return undefined;
  }

  return {
    command: selectedCommand.command,
    commands,
    workspaceId,
  };
}

async function writeScopedCommands(
  repository: CommandVaultRepository,
  selection: ResolvedCommandSelection,
  commands: readonly CommandVaultCommand[],
): Promise<void> {
  await repository.writeCommands(selection.workspaceId, commands);
}

async function readRequiredInput(
  window: CommandVaultWindow,
  value: string | undefined,
  fieldName: string,
): Promise<string | undefined> {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length > 0) {
    return normalizedValue;
  }

  await window.showWarningMessage(
    `${fieldName} is required to save a command.`,
  );
  return undefined;
}

function normalizeOptionalInput(value: string): string | null {
  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function capitalizeAction(action: "delete" | "edit"): string {
  return action[0].toUpperCase() + action.slice(1);
}

function getWorkspaceFolderPath(
  workspaceFolders: readonly CommandVaultWorkspaceFolder[] | undefined,
): string | undefined {
  return workspaceFolders?.[0]?.uri.fsPath;
}

function defaultNow(): string {
  return new Date().toISOString();
}
