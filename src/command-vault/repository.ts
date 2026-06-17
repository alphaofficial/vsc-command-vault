import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  CommandValidationIssue,
  CommandVaultCommand,
} from "./model.ts";
import {
  getWorkspaceStorageFilePath,
  validatePersistedCommandRecords,
} from "./model.ts";

export interface CommandVaultStorageUri {
  fsPath: string;
}

export interface CommandVaultRepository {
  readCommands(workspaceId: string | null): Promise<CommandVaultCommand[]>;
  writeCommands(
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
  storageUri: CommandVaultStorageUri,
  options: CommandVaultRepositoryOptions = {},
): CommandVaultRepository {
  return {
    async readCommands(workspaceId) {
      if (workspaceId === null) {
        return [];
      }

      return readCommandsFile(
        getCommandsStoragePath(storageUri.fsPath, workspaceId),
        options.onWarning,
      );
    },

    async writeCommands(workspaceId, commands) {
      await writeCommandsFile(
        getCommandsStoragePath(storageUri.fsPath, workspaceId),
        commands,
      );
    },
  };
}

function getCommandsStoragePath(
  storageFsPath: string,
  workspaceId: string,
): string {
  return join(storageFsPath, getWorkspaceStorageFilePath(workspaceId));
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
