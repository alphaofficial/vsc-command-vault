import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { createHash } from "node:crypto";

import type { CommandVaultCommand } from "./model.ts";
import { createWorkspaceId, validatePersistedCommandRecords } from "./model.ts";
import type { CommandVaultRepository } from "./repository.ts";

export const COMMAND_VAULT_EXPORT_FILENAME_PREFIX = "command-vault-export";
export const COMMAND_VAULT_EXPORT_PAYLOAD_VERSION = "1.0";

export interface CommandVaultExportPayload {
  commands: CommandVaultPortableCommand[];
  exportedAt: string;
  version: string;
}

export interface CommandVaultPortableCommand {
  command: string;
  description: string | null;
  name: string;
}

export interface CommandVaultImportExportFileUri {
  fsPath: string;
  scheme?: string;
}

export interface CommandVaultImportExportUriFactory {
  file(path: string): CommandVaultImportExportFileUri;
}

export interface CommandVaultImportExportSaveDialogOptions {
  defaultUri?: CommandVaultImportExportFileUri;
  filters?: Record<string, string[]>;
  saveLabel?: string;
  title?: string;
}

export interface CommandVaultImportExportOpenDialogOptions {
  canSelectFiles?: boolean;
  canSelectFolders?: boolean;
  canSelectMany?: boolean;
  filters?: Record<string, string[]>;
  openLabel?: string;
  title?: string;
}

export interface CommandVaultImportExportWindow {
  showInformationMessage?(message: string): void | Promise<void>;
  showOpenDialog?(
    options: CommandVaultImportExportOpenDialogOptions,
  ): Promise<CommandVaultImportExportFileUri[] | undefined>;
  showSaveDialog?(
    options: CommandVaultImportExportSaveDialogOptions,
  ): Promise<CommandVaultImportExportFileUri | undefined>;
  showWarningMessage(message: string): void | Promise<void>;
}

export interface CommandVaultImportExportWorkspaceFolder {
  uri: {
    fsPath: string;
  };
}

export interface CommandVaultImportExportWorkspace {
  workspaceFolders:
    | readonly CommandVaultImportExportWorkspaceFolder[]
    | undefined;
}

export interface CreateCommandVaultImportExportServiceOptions {
  now?: () => string;
  repository: CommandVaultRepository;
  uriFactory?: CommandVaultImportExportUriFactory;
  window: CommandVaultImportExportWindow;
  workspace: CommandVaultImportExportWorkspace;
}

export interface CommandVaultImportExportService {
  exportCommands(): Promise<void>;
  importCommands(): Promise<void>;
}

export function buildDefaultExportFilename(
  now: Date = new Date(),
): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${COMMAND_VAULT_EXPORT_FILENAME_PREFIX}-${year}-${month}-${day}.json`;
}

export function isJsonFilePath(filePath: string): boolean {
  return extname(filePath).toLowerCase() === ".json";
}

export function buildExportPayload(
  commands: readonly CommandVaultCommand[],
  exportedAt: string,
): CommandVaultExportPayload {
  return {
    version: COMMAND_VAULT_EXPORT_PAYLOAD_VERSION,
    exportedAt,
    commands: commands.map(toPortableCommand),
  };
}

export interface MergeImportedCommandsResult {
  changedCount: number;
  commands: CommandVaultCommand[];
}

export function mergeImportedCommands(
  importedCommands: readonly CommandVaultCommand[],
  existingCommands: readonly CommandVaultCommand[],
): MergeImportedCommandsResult {
  const uniqueImportedCommands = dedupeCommandsByIdentity(importedCommands);
  const nextExistingCommands = [...existingCommands];
  const existingIndexesByIdentity = new Map(
    existingCommands.map((command, index) => [
      createCommandIdentity(command),
      index,
    ]),
  );
  const newCommands: CommandVaultCommand[] = [];
  let changedCount = 0;

  for (const importedCommand of uniqueImportedCommands) {
    const existingIndex = existingIndexesByIdentity.get(
      createCommandIdentity(importedCommand),
    );

    if (existingIndex === undefined) {
      newCommands.push(importedCommand);
      changedCount += 1;
      continue;
    }

    const existingCommand = nextExistingCommands[existingIndex];

    if (
      existingCommand &&
      existingCommand.description !== importedCommand.description
    ) {
      nextExistingCommands[existingIndex] = {
        ...existingCommand,
        description: importedCommand.description,
        updatedAt: importedCommand.updatedAt,
      };
      changedCount += 1;
    }
  }

  return {
    changedCount,
    commands: [...newCommands, ...nextExistingCommands],
  };
}

export function createCommandVaultImportExportService(
  options: CreateCommandVaultImportExportServiceOptions,
): CommandVaultImportExportService {
  const now = options.now ?? defaultNow;
  const repository = options.repository;
  const uriFactory = options.uriFactory ?? defaultUriFactory;
  const window = options.window;
  const workspace = options.workspace;

  return {
    async exportCommands() {
      const showSaveDialog = window.showSaveDialog;

      if (!showSaveDialog) {
        await window.showWarningMessage(
          "Command Vault export requires save dialog support.",
        );
        return;
      }

      const fileUri = await showSaveDialog({
        title: "Export Command Vault Commands",
        saveLabel: "Export",
        defaultUri: uriFactory.file(resolveDefaultExportPath(workspace)),
        filters: { JSON: ["json"] },
      });

      if (!fileUri) {
        return;
      }

      const exportPayload = await collectExportPayload(repository, workspace, now);
      const serializedPayload = `${JSON.stringify(exportPayload, null, 2)}\n`;

      await writeFile(fileUri.fsPath, serializedPayload, { encoding: "utf8" });
      showInformationMessage(
        window,
        `Command Vault exported ${exportPayload.commands.length} command${
          exportPayload.commands.length === 1 ? "" : "s"
        }.`,
      );
    },

    async importCommands() {
      const showOpenDialog = window.showOpenDialog;

      if (!showOpenDialog) {
        await window.showWarningMessage(
          "Command Vault import requires open dialog support.",
        );
        return;
      }

      const fileUris = await showOpenDialog({
        title: "Import Command Vault Commands",
        openLabel: "Import",
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { JSON: ["json"] },
      });
      const fileUri = fileUris?.[0];

      if (!fileUri) {
        return;
      }

      if (!isJsonFilePath(fileUri.fsPath)) {
        await window.showWarningMessage(
          "Command Vault import only accepts JSON files.",
        );
        return;
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(
          await readFile(fileUri.fsPath, { encoding: "utf8" }),
        ) as unknown;
      } catch (error) {
        await window.showWarningMessage(
          `Command Vault could not import JSON. ${getErrorMessage(error)}`,
        );
        return;
      }

      const validation = validatePortableCommandRecords(parsed);

      if (validation.issues.length > 0) {
        await window.showWarningMessage(
          `Command Vault ignored ${validation.issues.length} invalid import issue${
            validation.issues.length === 1 ? "" : "s"
          }.`,
        );
      }

      if (validation.valid.length === 0) {
        await window.showWarningMessage(
          "Command Vault did not find any valid commands to import.",
        );
        return;
      }

      const importedCount = await importWorkspaceCommands(
        repository,
        window,
        workspace,
        validation.valid.map((command) => createImportedCommand(command, now())),
      );

      showInformationMessage(
        window,
        `Command Vault imported ${importedCount} command${
          importedCount === 1 ? "" : "s"
        }.`,
      );
    },
  };
}

async function collectExportPayload(
  repository: CommandVaultRepository,
  workspace: CommandVaultImportExportWorkspace,
  now: () => string,
): Promise<CommandVaultExportPayload> {
  const workspaceId = resolveWorkspaceId(workspace);
  const workspaceCommands = await repository.readCommands(workspaceId);

  return buildExportPayload(
    workspaceCommands,
    now(),
  );
}

async function importWorkspaceCommands(
  repository: CommandVaultRepository,
  window: CommandVaultImportExportWindow,
  workspace: CommandVaultImportExportWorkspace,
  importedCommands: readonly CommandVaultCommand[],
): Promise<number> {
  const workspaceId = resolveWorkspaceId(workspace);

  if (!workspaceId) {
    await window.showWarningMessage(
      "Command Vault needs an open workspace to import commands.",
    );
    return 0;
  }

  const workspaceCommands = await repository.readCommands(workspaceId);
  const mergedWorkspaceCommands = mergeImportedCommands(
    importedCommands,
    workspaceCommands,
  );

  if (mergedWorkspaceCommands.changedCount > 0) {
    await repository.writeCommands(
      workspaceId,
      mergedWorkspaceCommands.commands,
    );
  }

  return mergedWorkspaceCommands.changedCount;
}

function resolveWorkspaceId(
  workspace: CommandVaultImportExportWorkspace,
): string | null {
  const workspaceFolderPath = workspace.workspaceFolders?.[0]?.uri.fsPath;
  return workspaceFolderPath ? createWorkspaceId(workspaceFolderPath) : null;
}

function resolveDefaultExportPath(
  workspace: CommandVaultImportExportWorkspace,
): string {
  const filename = buildDefaultExportFilename();
  const workspaceFolderPath = workspace.workspaceFolders?.[0]?.uri.fsPath;

  return workspaceFolderPath ? join(workspaceFolderPath, filename) : filename;
}

const defaultUriFactory: CommandVaultImportExportUriFactory = {
  file(path) {
    return {
      fsPath: path,
      scheme: "file",
    };
  },
};

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPortableCommand(command: CommandVaultCommand): CommandVaultPortableCommand {
  return {
    name: command.name,
    command: command.command,
    description: command.description,
  };
}

function validatePortableCommandRecords(
  value: unknown,
): {
  valid: CommandVaultPortableCommand[];
  issues: Array<{ path: string; message: string }>;
} {
  const importedValue =
    isPlainObject(value) && "commands" in value ? value.commands : value;

  if (!Array.isArray(importedValue)) {
    return {
      valid: [],
      issues: [{ path: "import.commands", message: "must be an array" }],
    };
  }

  const valid: CommandVaultPortableCommand[] = [];
  const issues: Array<{ path: string; message: string }> = [];

  importedValue.forEach((record, index) => {
    const commandPath = `import.commands[${index}]`;

    if (!isPlainObject(record)) {
      issues.push({ path: commandPath, message: "must be an object" });
      return;
    }

    const name = readRequiredPortableString(record, "name", commandPath, issues);
    const command = readRequiredPortableString(
      record,
      "command",
      commandPath,
      issues,
    );
    const description = readPortableDescription(record, commandPath, issues);

    if (name && command) {
      valid.push({
        name,
        command,
        description,
      });
    }
  });

  if (valid.length === 0) {
    const legacyValidation = validatePersistedCommandRecords(
      importedValue,
      "import.commands",
    );

    if (legacyValidation.valid.length > 0) {
      return {
        valid: legacyValidation.valid.map(toPortableCommand),
        issues: legacyValidation.issues,
      };
    }
  }

  return { valid, issues };
}

function readRequiredPortableString(
  value: Record<string, unknown>,
  key: "command" | "name",
  commandPath: string,
  issues: Array<{ path: string; message: string }>,
): string {
  if (!Object.prototype.hasOwnProperty.call(value, key)) {
    issues.push({
      path: `${commandPath}.${key}`,
      message: "is required",
    });
    return "";
  }

  const fieldValue = value[key];

  if (typeof fieldValue !== "string" || fieldValue.trim().length === 0) {
    issues.push({
      path: `${commandPath}.${key}`,
      message: "must be a non-empty string",
    });
    return "";
  }

  return fieldValue.trim();
}

function readPortableDescription(
  value: Record<string, unknown>,
  commandPath: string,
  issues: Array<{ path: string; message: string }>,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(value, "description")) {
    return null;
  }

  const description = value.description;

  if (description === null) {
    return null;
  }

  if (typeof description === "string") {
    return description.trim().length > 0 ? description.trim() : null;
  }

  issues.push({
    path: `${commandPath}.description`,
    message: "must be a string or null",
  });
  return null;
}

function createImportedCommand(
  command: CommandVaultPortableCommand,
  timestamp: string,
): CommandVaultCommand {
  const commandRecordWithoutId = {
    name: command.name,
    command: command.command,
    description: command.description,
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies Omit<CommandVaultCommand, "id">;

  return {
    id: createImportedCommandId(commandRecordWithoutId),
    ...commandRecordWithoutId,
  };
}

function createImportedCommandId(command: Omit<CommandVaultCommand, "id">): string {
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

function dedupeCommandsByIdentity(
  commands: readonly CommandVaultCommand[],
): CommandVaultCommand[] {
  const seenIdentities = new Set<string>();
  const dedupedCommands: CommandVaultCommand[] = [];

  for (const command of commands) {
    const identity = createCommandIdentity(command);

    if (seenIdentities.has(identity)) {
      continue;
    }

    seenIdentities.add(identity);
    dedupedCommands.push(command);
  }

  return dedupedCommands;
}

function createCommandIdentity(command: Pick<CommandVaultCommand, "command" | "name">): string {
  return `${command.name.trim()}\u0000${command.command.trim()}`;
}

function defaultNow(): string {
  return new Date().toISOString();
}

function showInformationMessage(
  window: CommandVaultImportExportWindow,
  message: string,
): void {
  try {
    void Promise.resolve(window.showInformationMessage?.(message)).catch(() => {});
  } catch {
    // Information messages should not block completed import/export work.
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown error.";
}
