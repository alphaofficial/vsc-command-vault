import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { CommandVaultCommand } from "./model.ts";
import {
  COMMAND_VAULT_GLOBAL_STORAGE_FILE,
  getWorkspaceStorageFilePath,
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

export function createCommandVaultRepository(
  globalStorageUri: CommandVaultStorageUri,
): CommandVaultRepository {
  return {
    async readGlobalCommands() {
      return readCommandsFile(
        getGlobalCommandsStoragePath(globalStorageUri.fsPath),
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

async function readCommandsFile(filePath: string): Promise<CommandVaultCommand[]> {
  try {
    const contents = await readFile(filePath, { encoding: "utf8" });
    return JSON.parse(contents) as CommandVaultCommand[];
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
