import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  CommandValidationIssue,
  CommandVaultCommand,
} from "./model.ts";
import {
  COMMAND_VAULT_GLOBAL_STORAGE_FILE,
  getWorkspaceStorageFilePath,
  validatePersistedCommandRecords,
} from "./model.ts";

export interface CommandVaultStorageUri {
  fsPath: string;
}

export interface CommandVaultRepository {
  readGlobalCommands(): Promise<CommandVaultCommand[]>;
  writeGlobalCommands(commands: readonly CommandVaultCommand[]): Promise<void>;
  readWorkspaceCommands(
    workspaceId: string | null,
  ): Promise<CommandVaultCommand[]>;
  writeWorkspaceCommands(
    workspaceId: string,
    commands: readonly CommandVaultCommand[],
  ): Promise<void>;
}

export interface CommandVaultRepositoryOptions {
  onWarning?: CommandVaultWarningHandler;
}

export type CommandVaultWarningHandler = (
  message: string,
) => void | Promise<void>;

export function createCommandVaultRepository(
  globalStorageUri: CommandVaultStorageUri,
  options: CommandVaultRepositoryOptions = {},
): CommandVaultRepository {
  return {
    async readGlobalCommands() {
      return readCommandsFile(
        getGlobalCommandsStoragePath(globalStorageUri.fsPath),
        options.onWarning,
      );
    },

    async writeGlobalCommands(commands) {
      await writeCommandsFile(
        getGlobalCommandsStoragePath(globalStorageUri.fsPath),
        commands,
      );
    },

    async readWorkspaceCommands(workspaceId) {
      if (workspaceId === null) {
        return [];
      }

      return readCommandsFile(
        getWorkspaceCommandsStoragePath(globalStorageUri.fsPath, workspaceId),
        options.onWarning,
      );
    },

    async writeWorkspaceCommands(workspaceId, commands) {
      await writeCommandsFile(
        getWorkspaceCommandsStoragePath(globalStorageUri.fsPath, workspaceId),
        commands,
      );
    },
  };
}

function getGlobalCommandsStoragePath(globalStorageFsPath: string): string {
  return join(globalStorageFsPath, COMMAND_VAULT_GLOBAL_STORAGE_FILE);
}

function getWorkspaceCommandsStoragePath(
  globalStorageFsPath: string,
  workspaceId: string,
): string {
  return join(globalStorageFsPath, getWorkspaceStorageFilePath(workspaceId));
}

async function readCommandsFile(
  filePath: string,
  onWarning?: CommandVaultWarningHandler,
): Promise<CommandVaultCommand[]> {
  try {
    const contents = await readFile(filePath, { encoding: "utf8" });
    const parsed = parseCommandsFile(contents, filePath);

    if (!parsed.ok) {
      await emitWarning(onWarning, parsed.warning);
      return [];
    }

    const validation = validatePersistedCommandRecords(parsed.value);

    if (validation.issues.length > 0) {
      await emitWarning(
        onWarning,
        formatValidationWarning(filePath, validation.issues),
      );
    }

    return validation.valid;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return [];
    }

    throw error;
  }
}

async function writeCommandsFile(
  filePath: string,
  commands: readonly CommandVaultCommand[],
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(commands, null, 2)}\n`, {
    encoding: "utf8",
  });
}

function isFileNotFoundError(error: unknown): error is { code: "ENOENT" } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function parseCommandsFile(
  contents: string,
  filePath: string,
):
  | { ok: true; value: unknown }
  | { ok: false; warning: string } {
  try {
    return {
      ok: true,
      value: JSON.parse(contents) as unknown,
    };
  } catch (error) {
    return {
      ok: false,
      warning: formatJsonParseWarning(filePath, error),
    };
  }
}

function formatJsonParseWarning(filePath: string, error: unknown): string {
  return [
    `Command Vault ignored malformed JSON in ${filePath}.`,
    getErrorMessage(error),
  ].join(" ");
}

function formatValidationWarning(
  filePath: string,
  issues: readonly CommandValidationIssue[],
): string {
  return [
    `Command Vault ignored invalid command entries in ${filePath}.`,
    formatValidationIssues(issues),
  ].join(" ");
}

function formatValidationIssues(
  issues: readonly CommandValidationIssue[],
): string {
  return issues.map((issue) => `${issue.path} ${issue.message}`).join("; ");
}

async function emitWarning(
  onWarning: CommandVaultWarningHandler | undefined,
  message: string,
): Promise<void> {
  if (!onWarning) {
    return;
  }

  try {
    await onWarning(message);
  } catch {
    // Warning delivery should never break command reads.
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown JSON parse error.";
}
