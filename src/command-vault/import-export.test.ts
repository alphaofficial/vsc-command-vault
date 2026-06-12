import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { CommandVaultCommand } from "./model.ts";
import {
  COMMAND_VAULT_EXPORT_FILENAME_PREFIX,
  buildDefaultExportFilename,
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
