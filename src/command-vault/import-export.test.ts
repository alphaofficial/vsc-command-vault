import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { CommandVaultCommand } from "./model.ts";
import {
  COMMAND_VAULT_EXPORT_FILENAME_PREFIX,
  buildDefaultExportFilename,
  createCommandVaultImportExportService,
  isJsonFilePath,
  mergeImportedCommands,
} from "./import-export.ts";

describe("command vault import-export helpers", () => {
  it("builds a default export filename with the current local date", () => {
    const filename = buildDefaultExportFilename(
      new Date(2026, 5, 11, 14, 30, 0, 0),
    );

    assert.equal(filename, `${COMMAND_VAULT_EXPORT_FILENAME_PREFIX}-2026-06-11.json`);
  });

  it("zero-pads single-digit months and days in the default export filename", () => {
    const filename = buildDefaultExportFilename(
      new Date(2026, 0, 3, 9, 0, 0, 0),
    );

    assert.equal(filename, `${COMMAND_VAULT_EXPORT_FILENAME_PREFIX}-2026-01-03.json`);
  });

  it("includes today's local date and the .json extension when no date is provided", () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const expected = `${COMMAND_VAULT_EXPORT_FILENAME_PREFIX}-${year}-${month}-${day}.json`;

    const filename = buildDefaultExportFilename();

    assert.equal(filename, expected);
    assert.match(filename, /\.json$/);
  });

  it("accepts .json extensions case-insensitively", () => {
    assert.equal(isJsonFilePath("/tmp/commands.json"), true);
    assert.equal(isJsonFilePath("/tmp/commands.JSON"), true);
    assert.equal(isJsonFilePath("/tmp/Commands.Json"), true);
    assert.equal(isJsonFilePath("commands.json"), true);
  });

  it("rejects non-JSON extensions even when JSON appears in the name", () => {
    assert.equal(isJsonFilePath("/tmp/commands.json.bak"), false);
    assert.equal(isJsonFilePath("/tmp/commands"), false);
    assert.equal(isJsonFilePath("/tmp/commands.txt"), false);
    assert.equal(isJsonFilePath(""), false);
  });

  it("prepends unique imported commands and skips ids that already exist", () => {
    const existing = [
      createCommand("global-1"),
      createCommand("global-2"),
    ];
    const imported = [
      createCommand("global-2"),
      createCommand("global-3"),
      createCommand("global-4"),
    ];

    const merged = mergeImportedCommands(imported, existing);

    assert.deepEqual(merged.map((command) => command.id), [
      "global-3",
      "global-4",
      "global-1",
      "global-2",
    ]);
  });

  it("leaves the existing list unchanged when every imported id is already present", () => {
    const existing = [createCommand("global-1"), createCommand("global-2")];
    const imported = [createCommand("global-1")];

    const merged = mergeImportedCommands(imported, existing);

    assert.deepEqual(merged.map((command) => command.id), [
      "global-1",
      "global-2",
    ]);
  });
});

describe("command vault import-export service", () => {
  it("rejects non-JSON import selections with a warning and no storage writes", async () => {
    const repository = createRepositoryRecorder();
    const warningMessages: string[] = [];
    let showSaveDialogCalls = 0;
    let showOpenDialogCalls = 0;
    const nonJsonFilePath = "/tmp/command-vault-import/external.txt";

    const service = createCommandVaultImportExportService({
      now() {
        return "2026-06-12T00:00:00.000Z";
      },
      repository,
      window: {
        async showOpenDialog() {
          showOpenDialogCalls += 1;
          return [{ fsPath: nonJsonFilePath }];
        },
        async showSaveDialog() {
          showSaveDialogCalls += 1;
          return undefined;
        },
        showWarningMessage(message) {
          warningMessages.push(message);
        },
        showInformationMessage() {
          throw new Error("information message should not be shown for non-JSON imports");
        },
      },
      workspace: {
        workspaceFolders: [
          {
            uri: {
              fsPath: "/tmp/command-vault-import",
            },
          },
        ],
      },
    });

    await service.importCommands();

    assert.equal(showOpenDialogCalls, 1);
    assert.equal(showSaveDialogCalls, 0);
    assert.deepEqual(warningMessages, [
      "Command Vault import only accepts JSON files.",
    ]);
    assert.deepEqual(repository.readGlobalCommandsCalls, 0);
    assert.deepEqual(repository.readWorkspaceCommandsCalls, []);
    assert.deepEqual(repository.writeGlobalCommandsCalls, []);
    assert.deepEqual(repository.writeWorkspaceCommandsCalls, []);
  });
});

function createRepositoryRecorder(): {
  readGlobalCommandsCalls: number;
  readWorkspaceCommandsCalls: Array<string | null>;
  writeGlobalCommandsCalls: CommandVaultCommand[][];
  writeWorkspaceCommandsCalls: Array<{
    commands: CommandVaultCommand[];
    workspaceId: string;
  }>;
  readGlobalCommands(): Promise<CommandVaultCommand[]>;
  readWorkspaceCommands(workspaceId: string | null): Promise<CommandVaultCommand[]>;
  writeGlobalCommands(commands: readonly CommandVaultCommand[]): Promise<void>;
  writeWorkspaceCommands(
    workspaceId: string,
    commands: readonly CommandVaultCommand[],
  ): Promise<void>;
} {
  let readGlobalCommandsCalls = 0;
  const readWorkspaceCommandsCalls: Array<string | null> = [];
  const writeGlobalCommandsCalls: CommandVaultCommand[][] = [];
  const writeWorkspaceCommandsCalls: Array<{
    commands: CommandVaultCommand[];
    workspaceId: string;
  }> = [];

  return {
    get readGlobalCommandsCalls() {
      return readGlobalCommandsCalls;
    },
    readWorkspaceCommandsCalls,
    writeGlobalCommandsCalls,
    writeWorkspaceCommandsCalls,
    async readGlobalCommands() {
      readGlobalCommandsCalls += 1;
      throw new Error("storage should not be read for non-JSON import selections");
    },
    async readWorkspaceCommands(workspaceId) {
      readWorkspaceCommandsCalls.push(workspaceId);
      throw new Error("storage should not be read for non-JSON import selections");
    },
    async writeGlobalCommands(commands) {
      writeGlobalCommandsCalls.push([...commands]);
      throw new Error("storage should not be written for non-JSON import selections");
    },
    async writeWorkspaceCommands(workspaceId, commands) {
      writeWorkspaceCommandsCalls.push({
        workspaceId,
        commands: [...commands],
      });
      throw new Error("storage should not be written for non-JSON import selections");
    },
  };
}

function createCommand(
  id: string,
  overrides: Partial<CommandVaultCommand> = {},
): CommandVaultCommand {
  return {
    id,
    scope: "global",
    name: `Command ${id}`,
    command: "echo test",
    description: null,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    ...overrides,
  };
}
