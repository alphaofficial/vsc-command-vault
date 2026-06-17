import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

  it("prepends unique imported commands and skips matching names and commands", () => {
    const existing = [
      createCommand("existing-1", {
        name: "Run server",
        command: "npm run dev",
      }),
      createCommand("existing-2", {
        name: "Run tests",
        command: "npm test",
      }),
    ];
    const imported = [
      createCommand("imported-1", {
        name: "Run tests",
        command: "npm test",
      }),
      createCommand("imported-2", {
        name: "Run build",
        command: "npm run build",
      }),
    ];

    const merged = mergeImportedCommands(imported, existing);

    assert.equal(merged.changedCount, 1);
    assert.deepEqual(merged.commands.map((command) => command.id), [
      "imported-2",
      "existing-1",
      "existing-2",
    ]);
  });

  it("updates descriptions for matching imported commands without duplicating them", () => {
    const existing = [
      createCommand("existing-1", {
        name: "Run server",
        command: "npm run dev",
        description: null,
      }),
    ];
    const imported = [
      createCommand("imported-1", {
        name: "Run server",
        command: "npm run dev",
        description: "Starts the dev server",
        updatedAt: "2026-06-17T21:44:02.383Z",
      }),
    ];

    const merged = mergeImportedCommands(imported, existing);

    assert.equal(merged.changedCount, 1);
    assert.equal(merged.commands.length, 1);
    assert.equal(merged.commands[0]?.id, "existing-1");
    assert.equal(merged.commands[0]?.description, "Starts the dev server");
    assert.equal(merged.commands[0]?.updatedAt, "2026-06-17T21:44:02.383Z");
  });
});

describe("command vault import-export service", () => {
  it("uses a file URI for the export default path so VS Code has a filesystem provider", async () => {
    const repository = createExportRepositoryRecorder();
    const saveDialogCalls: Array<{
      defaultUri?: { fsPath: string; scheme?: string };
      filters?: Record<string, string[]>;
    }> = [];
    const workspacePath = "/tmp/command-vault-export";

    const service = createCommandVaultImportExportService({
      now() {
        return "2026-06-12T00:00:00.000Z";
      },
      repository,
      uriFactory: {
        file(path) {
          return {
            fsPath: path,
            scheme: "file",
          };
        },
      },
      window: {
        async showSaveDialog(options) {
          saveDialogCalls.push({
            defaultUri: options.defaultUri,
            filters: options.filters,
          });
          return undefined;
        },
        showWarningMessage() {
          throw new Error("warning message should not be shown for export cancellation");
        },
      },
      workspace: {
        workspaceFolders: [
          {
            uri: {
              fsPath: workspacePath,
            },
          },
        ],
      },
    });

    await service.exportCommands();

    assert.equal(saveDialogCalls.length, 1);
    assert.equal(saveDialogCalls[0]?.defaultUri?.scheme, "file");
    assert.match(
      saveDialogCalls[0]?.defaultUri?.fsPath ?? "",
      /^\/tmp\/command-vault-export\/command-vault-export-\d{4}-\d{2}-\d{2}\.json$/,
    );
    assert.deepEqual(saveDialogCalls[0]?.filters, { JSON: ["json"] });
    assert.deepEqual(repository.readCommandsCalls, []);
  });

  it("exports workspace commands with no internal command metadata", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "command-vault-export-"));
    const exportPath = join(tempDir, "commands.json");
    const repository = createMutableRepositoryRecorder({
      workspaceCommands: [
        createCommand("workspace-1", {
          name: "Run server",
          command: "npm run dev",
          description: "Starts the dev server",
        }),
      ],
    });

    const service = createCommandVaultImportExportService({
      now() {
        return "2026-06-17T21:44:02.383Z";
      },
      repository,
      window: {
        async showSaveDialog() {
          return { fsPath: exportPath };
        },
        showWarningMessage() {
          throw new Error("warning message should not be shown for export");
        },
      },
      workspace: {
        workspaceFolders: [
          {
            uri: {
              fsPath: tempDir,
            },
          },
        ],
      },
    });

    await service.exportCommands();

    assert.equal(repository.readCommandsCalls.length, 1);
    assert.deepEqual(JSON.parse(await readFile(exportPath, "utf8")), {
      version: "1.0",
      exportedAt: "2026-06-17T21:44:02.383Z",
      commands: [
        {
          name: "Run server",
          command: "npm run dev",
          description: "Starts the dev server",
        },
      ],
    });
  });

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
    assert.deepEqual(repository.readCommandsCalls, []);
    assert.deepEqual(repository.writeCommandsCalls, []);
  });

  it("imports the simple command format into the current workspace idempotently", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "command-vault-import-"));
    const importPath = join(tempDir, "commands.json");
    await writeFile(
      importPath,
      `${JSON.stringify({
        version: "1.0",
        commands: [
          {
            name: "Run server",
            command: "npm run dev",
            description: "Starts the dev server",
          },
        ],
      })}\n`,
      "utf8",
    );
    const repository = createMutableRepositoryRecorder();
    const informationMessages: string[] = [];

    const service = createCommandVaultImportExportService({
      now() {
        return "2026-06-17T21:44:02.383Z";
      },
      repository,
      window: {
        async showOpenDialog() {
          return [{ fsPath: importPath }];
        },
        showInformationMessage(message) {
          informationMessages.push(message);
        },
        showWarningMessage(message) {
          throw new Error(`warning message should not be shown: ${message}`);
        },
      },
      workspace: {
        workspaceFolders: [
          {
            uri: {
              fsPath: tempDir,
            },
          },
        ],
      },
    });

    await service.importCommands();
    await service.importCommands();

    assert.equal(repository.workspaceCommands.length, 1);
    assert.equal(repository.writeCommandsCalls.length, 1);
    assert.equal(repository.workspaceCommands[0]?.name, "Run server");
    assert.equal(repository.workspaceCommands[0]?.command, "npm run dev");
    assert.equal(repository.workspaceCommands[0]?.description, "Starts the dev server");
    assert.deepEqual(informationMessages, [
      "Command Vault imported 1 command.",
      "Command Vault imported 0 commands.",
    ]);
  });

  it("does not wait for import information messages before resolving", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "command-vault-import-info-"));
    const importPath = join(tempDir, "commands.json");
    await writeFile(
      importPath,
      `${JSON.stringify({
        version: "1.0",
        commands: [
          {
            name: "Run server",
            command: "npm run dev",
          },
        ],
      })}\n`,
      "utf8",
    );
    const repository = createMutableRepositoryRecorder();
    const service = createCommandVaultImportExportService({
      repository,
      window: {
        async showOpenDialog() {
          return [{ fsPath: importPath }];
        },
        showInformationMessage() {
          return new Promise<void>(() => {});
        },
        showWarningMessage(message) {
          throw new Error(`warning message should not be shown: ${message}`);
        },
      },
      workspace: {
        workspaceFolders: [
          {
            uri: {
              fsPath: tempDir,
            },
          },
        ],
      },
    });

    const result = await Promise.race([
      service.importCommands().then(() => "resolved"),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve("timed-out"), 20);
      }),
    ]);

    assert.equal(result, "resolved");
    assert.equal(repository.workspaceCommands.length, 1);
  });

  it("imports legacy full records as workspace commands without exporting internals", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "command-vault-legacy-import-"));
    const importPath = join(tempDir, "commands.json");
    await writeFile(
      importPath,
      `${JSON.stringify({
        version: "1.0",
        exportedAt: "2026-06-11T14:30:00.000Z",
        commands: [
          createCommand("legacy-command", {
            name: "Run legacy",
            command: "npm run legacy",
            description: null,
          }),
        ],
      })}\n`,
      "utf8",
    );
    const repository = createMutableRepositoryRecorder();

    const service = createCommandVaultImportExportService({
      now() {
        return "2026-06-17T21:44:02.383Z";
      },
      repository,
      window: {
        async showOpenDialog() {
          return [{ fsPath: importPath }];
        },
        showWarningMessage(message) {
          throw new Error(`warning message should not be shown: ${message}`);
        },
      },
      workspace: {
        workspaceFolders: [
          {
            uri: {
              fsPath: tempDir,
            },
          },
        ],
      },
    });

    await service.importCommands();

    assert.equal(repository.workspaceCommands.length, 1);
    assert.notEqual(repository.workspaceCommands[0]?.id, "legacy-command");
    assert.equal(repository.workspaceCommands[0]?.name, "Run legacy");
  });
});

function createRepositoryRecorder(): {
  readCommandsCalls: Array<string | null>;
  writeCommandsCalls: Array<{
    commands: CommandVaultCommand[];
    workspaceId: string;
  }>;
  readCommands(workspaceId: string | null): Promise<CommandVaultCommand[]>;
  writeCommands(
    workspaceId: string,
    commands: readonly CommandVaultCommand[],
  ): Promise<void>;
} {
  const readCommandsCalls: Array<string | null> = [];
  const writeCommandsCalls: Array<{
    commands: CommandVaultCommand[];
    workspaceId: string;
  }> = [];

  return {
    readCommandsCalls,
    writeCommandsCalls,
    async readCommands(workspaceId) {
      readCommandsCalls.push(workspaceId);
      throw new Error("storage should not be read for non-JSON import selections");
    },
    async writeCommands(workspaceId, commands) {
      writeCommandsCalls.push({
        workspaceId,
        commands: [...commands],
      });
      throw new Error("storage should not be written for non-JSON import selections");
    },
  };
}

function createExportRepositoryRecorder(): ReturnType<typeof createRepositoryRecorder> {
  const repository = createRepositoryRecorder();

  return {
    ...repository,
    async readCommands(workspaceId) {
      repository.readCommandsCalls.push(workspaceId);
      throw new Error("storage should not be read when export is cancelled");
    },
  };
}

function createMutableRepositoryRecorder({
  workspaceCommands = [],
}: {
  workspaceCommands?: CommandVaultCommand[];
} = {}): {
  readCommandsCalls: Array<string | null>;
  workspaceCommands: CommandVaultCommand[];
  writeCommandsCalls: Array<{
    commands: CommandVaultCommand[];
    workspaceId: string;
  }>;
  readCommands(workspaceId: string | null): Promise<CommandVaultCommand[]>;
  writeCommands(
    workspaceId: string,
    commands: readonly CommandVaultCommand[],
  ): Promise<void>;
} {
  const readCommandsCalls: Array<string | null> = [];
  const writeCommandsCalls: Array<{
    commands: CommandVaultCommand[];
    workspaceId: string;
  }> = [];
  const currentWorkspaceCommands = [...workspaceCommands];

  return {
    readCommandsCalls,
    get workspaceCommands() {
      return currentWorkspaceCommands;
    },
    writeCommandsCalls,
    async readCommands(workspaceId) {
      readCommandsCalls.push(workspaceId);
      return [...currentWorkspaceCommands];
    },
    async writeCommands(workspaceId, commands) {
      writeCommandsCalls.push({
        workspaceId,
        commands: [...commands],
      });
      currentWorkspaceCommands.splice(
        0,
        currentWorkspaceCommands.length,
        ...commands,
      );
    },
  };
}

function createCommand(
  id: string,
  overrides: Partial<CommandVaultCommand> = {},
): CommandVaultCommand {
  return {
    id,
    name: `Command ${id}`,
    command: "echo test",
    description: null,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    ...overrides,
  };
}
