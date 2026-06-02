import { createHash } from "node:crypto";

import type { CommandVaultCommand, CommandVaultScope } from "./model.ts";
import { createWorkspaceId } from "./model.ts";
import type { CommandVaultRepository } from "./repository.ts";
import {
  DEFAULT_COMMAND_VAULT_SETTINGS,
  isCommandVaultScopeEnabled,
  type CommandVaultSettings,
} from "./settings.ts";

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
  getSettings?: () => CommandVaultSettings;
  now?: () => string;
  repository: CommandVaultRepository;
  window: CommandVaultWindow;
  workspace: CommandVaultWorkspace;
}

export interface CommandVaultCreateService {
  createCommand(
    requestedScope?: CommandVaultScope,
  ): Promise<CommandVaultCommand | undefined>;
}

interface CommandVaultScopePickItem extends CommandVaultQuickPickItem {
  scope: CommandVaultScope;
}

export function createCommandVaultCreateService(
  options: CreateCommandVaultServiceOptions,
): CommandVaultCreateService {
  const now = options.now ?? defaultNow;
  const createId = options.createId ?? defaultCreateId;

  return {
    async createCommand(requestedScope) {
      const settings = options.getSettings?.() ?? DEFAULT_COMMAND_VAULT_SETTINGS;
      const scope = await resolveCommandScope(
        requestedScope,
        settings,
        options.window,
        options.workspace.workspaceFolders,
      );

      if (!scope) {
        return undefined;
      }

      const title = getCreateTitle(scope);
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
        scope,
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

      if (scope === "global") {
        const commands = await options.repository.readGlobalCommands();
        await options.repository.writeGlobalCommands([...commands, commandRecord]);
        return commandRecord;
      }

      const workspaceFolderPath = getWorkspaceFolderPath(
        options.workspace.workspaceFolders,
      );

      if (!workspaceFolderPath) {
        await options.window.showWarningMessage(
          "Command Vault needs an open workspace to create workspace commands.",
        );
        return undefined;
      }

      const workspaceId = createWorkspaceId(workspaceFolderPath);
      const commands = await options.repository.readWorkspaceCommands(workspaceId);

      await options.repository.writeWorkspaceCommands(workspaceId, [
        ...commands,
        commandRecord,
      ]);

      return commandRecord;
    },
  };
}

async function resolveCommandScope(
  requestedScope: CommandVaultScope | undefined,
  settings: CommandVaultSettings,
  window: CommandVaultWindow,
  workspaceFolders: readonly CommandVaultWorkspaceFolder[] | undefined,
): Promise<CommandVaultScope | undefined> {
  if (requestedScope && !isCommandVaultScopeEnabled(requestedScope, settings)) {
    await window.showWarningMessage(
      `Command Vault ${requestedScope} commands are disabled in settings.`,
    );
    return undefined;
  }

  if (requestedScope === "workspace" && !getWorkspaceFolderPath(workspaceFolders)) {
    await window.showWarningMessage(
      "Command Vault needs an open workspace to create workspace commands.",
    );
    return undefined;
  }

  if (requestedScope) {
    return requestedScope;
  }

  const scopeItems = createScopePickItems(workspaceFolders, settings);

  if (scopeItems.length === 0) {
    await window.showWarningMessage(
      "Command Vault has no enabled scopes available for new commands.",
    );
    return undefined;
  }

  const selectedScope = await window.showQuickPick(scopeItems, {
    title: "Create Command",
    placeHolder: "Where should this command be saved?",
  });

  return selectedScope?.scope;
}

function createScopePickItems(
  workspaceFolders: readonly CommandVaultWorkspaceFolder[] | undefined,
  settings: CommandVaultSettings,
): CommandVaultScopePickItem[] {
  const items: CommandVaultScopePickItem[] = [];

  if (isCommandVaultScopeEnabled("global", settings)) {
    items.push({
      label: "Global",
      description: "Available in every workspace",
      scope: "global",
    });
  }

  if (
    isCommandVaultScopeEnabled("workspace", settings) &&
    getWorkspaceFolderPath(workspaceFolders)
  ) {
    items.unshift({
      label: "Workspace",
      description: "Available only in this workspace",
      scope: "workspace",
    });
  }

  return items;
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

function getCreateTitle(scope: CommandVaultScope): string {
  return scope === "workspace"
    ? "Create Workspace Command"
    : "Create Global Command";
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
        command.scope,
        command.name,
        command.command,
        command.createdAt,
        `${Math.random()}`,
      ].join("\n"),
    )
    .digest("hex");
}
