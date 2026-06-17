import { createHash } from "node:crypto";

import type { CommandVaultCommand } from "./model.ts";
import { createWorkspaceId } from "./model.ts";
import type { CommandVaultRepository } from "./repository.ts";

export const COMMAND_VAULT_CREATE_COMMAND_ID = "commandVault.createCommand";

export interface CommandVaultInputBoxOptions {
  placeHolder?: string;
  prompt?: string;
  title?: string;
  value?: string;
}

export interface CommandVaultQuickPickOptions {
  placeHolder?: string;
  title?: string;
}

export interface CommandVaultQuickPickItem {
  description?: string;
  detail?: string;
  label: string;
}

export interface CommandVaultWindow {
  showInputBox(
    options: CommandVaultInputBoxOptions,
  ): Promise<string | undefined>;
  showQuickPick<Item extends CommandVaultQuickPickItem>(
    items: readonly Item[],
    options?: CommandVaultQuickPickOptions,
  ): Promise<Item | undefined>;
  showWarningMessage(message: string): void | Promise<void>;
}

export interface CommandVaultWorkspaceFolder {
  uri: {
    fsPath: string;
  };
}

export interface CommandVaultWorkspace {
  workspaceFolders: readonly CommandVaultWorkspaceFolder[] | undefined;
}

export interface CreateCommandVaultServiceOptions {
  createId?: (command: Omit<CommandVaultCommand, "id">) => string;
  now?: () => string;
  repository: CommandVaultRepository;
  window: CommandVaultWindow;
  workspace: CommandVaultWorkspace;
}

export interface CommandVaultCreateService {
  createCommand(): Promise<CommandVaultCommand | undefined>;
}

export function createCommandVaultCreateService(
  options: CreateCommandVaultServiceOptions,
): CommandVaultCreateService {
  const now = options.now ?? defaultNow;
  const createId = options.createId ?? defaultCreateId;

  return {
    async createCommand() {
      const workspaceFolderPath = getWorkspaceFolderPath(
        options.workspace.workspaceFolders,
      );

      if (!workspaceFolderPath) {
        await options.window.showWarningMessage(
          "Command Vault needs an open workspace to create commands.",
        );
        return undefined;
      }

      const title = "Create Command";
      const nameInput = await options.window.showInputBox({
        title,
        prompt: "Name this command.",
        placeHolder: "Run tests",
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
        title,
        prompt: "Enter the terminal command to save.",
        placeHolder: "npm test",
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
        title,
        prompt: "Add an optional description.",
        placeHolder: "Runs the test suite",
      });

      if (descriptionInput === undefined) {
        return undefined;
      }

      const timestamp = now();
      const commandRecordWithoutId = {
        name,
        command: commandText,
        description: normalizeOptionalInput(descriptionInput),
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies Omit<CommandVaultCommand, "id">;
      const commandRecord: CommandVaultCommand = {
        id: createId(commandRecordWithoutId),
        ...commandRecordWithoutId,
      };

      const workspaceId = createWorkspaceId(workspaceFolderPath);
      const commands = await options.repository.readCommands(workspaceId);

      await options.repository.writeCommands(workspaceId, [
        commandRecord,
        ...commands,
      ]);

      return commandRecord;
    },
  };
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

function getWorkspaceFolderPath(
  workspaceFolders: readonly CommandVaultWorkspaceFolder[] | undefined,
): string | undefined {
  return workspaceFolders?.[0]?.uri.fsPath;
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultCreateId(command: Omit<CommandVaultCommand, "id">): string {
  return createHash("sha256")
    .update(
      [
        command.name,
        command.command,
        command.createdAt,
        `${Math.random()}`,
      ].join("\n"),
    )
    .digest("hex");
}
