import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";

import type { CommandVaultCommand } from "./model.ts";
import { createWorkspaceId, validatePersistedCommandRecords } from "./model.ts";
import type { CommandVaultRepository } from "./repository.ts";

export const COMMAND_VAULT_EXPORT_FILENAME_PREFIX = "command-vault-export";
export const COMMAND_VAULT_EXPORT_PAYLOAD_VERSION = "1.0";

export interface CommandVaultExportPayload {
  commands: CommandVaultCommand[];
  exportedAt: string;
  version: string;
}

export interface CommandVaultImportExportFileUri {
  fsPath: string;
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
    commands: [...commands],
  };
}

export function mergeImportedCommands(
  importedCommands: readonly CommandVaultCommand[],
  existingCommands: readonly CommandVaultCommand[],
): CommandVaultCommand[] {
  const existingIds = new Set(existingCommands.map((command) => command.id));
  const uniqueImportedCommands = importedCommands.filter(
    (command) => !existingIds.has(command.id),
  );

  return [...uniqueImportedCommands, ...existingCommands];
}

export function createCommandVaultImportExportService(
  options: CreateCommandVaultImportExportServiceOptions,
): CommandVaultImportExportService {
  const now = options.now ?? defaultNow;
  const repository = options.repository;
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
        defaultUri: { fsPath: buildDefaultExportFilename() },
        filters: { JSON: ["json"] },
      });

      if (!fileUri) {
        return;
      }

      const exportPayload = await collectExportPayload(repository, workspace, now);
      const serializedPayload = `${JSON.stringify(exportPayload, null, 2)}\n`;

      await writeFile(fileUri.fsPath, serializedPayload, { encoding: "utf8" });
      await window.showInformationMessage?.(
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

      const importedValue =
        isPlainObject(parsed) && "commands" in parsed ? parsed.commands : parsed;
      const validation = validatePersistedCommandRecords(
        importedValue,
        "import.commands",
      );

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

      const globalImports = validation.valid.filter(
        (command) => command.scope === "global",
      );
      const workspaceImports = validation.valid.filter(
        (command) => command.scope === "workspace",
      );
      const importedCount = await mergeImportBatches(
        repository,
        window,
        workspace,
        globalImports,
        workspaceImports,
      );

      await window.showInformationMessage?.(
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
  const [globalCommands, workspaceCommands] = await Promise.all([
    repository.readGlobalCommands(),
    repository.readWorkspaceCommands(workspaceId),
  ]);

  return buildExportPayload(
    [...globalCommands, ...workspaceCommands],
    now(),
  );
}

async function mergeImportBatches(
  repository: CommandVaultRepository,
  window: CommandVaultImportExportWindow,
  workspace: CommandVaultImportExportWorkspace,
  globalImports: readonly CommandVaultCommand[],
  workspaceImports: readonly CommandVaultCommand[],
): Promise<number> {
  const workspaceId = resolveWorkspaceId(workspace);
  const globalCommands = await repository.readGlobalCommands();
  const mergedGlobalCommands = mergeImportedCommands(
    globalImports,
    globalCommands,
  );
  await repository.writeGlobalCommands(mergedGlobalCommands);

  let importedCount = mergedGlobalCommands.length - globalCommands.length;

  if (workspaceId) {
    const workspaceCommands = await repository.readWorkspaceCommands(workspaceId);
    const mergedWorkspaceCommands = mergeImportedCommands(
      workspaceImports,
      workspaceCommands,
    );
    await repository.writeWorkspaceCommands(workspaceId, mergedWorkspaceCommands);
    importedCount += mergedWorkspaceCommands.length - workspaceCommands.length;
  } else if (workspaceImports.length > 0) {
    await window.showWarningMessage(
      "Command Vault skipped workspace commands because no workspace is open.",
    );
  }

  return importedCount;
}

function resolveWorkspaceId(
  workspace: CommandVaultImportExportWorkspace,
): string | null {
  const workspaceFolderPath = workspace.workspaceFolders?.[0]?.uri.fsPath;
  return workspaceFolderPath ? createWorkspaceId(workspaceFolderPath) : null;
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultNow(): string {
  return new Date().toISOString();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown error.";
}
