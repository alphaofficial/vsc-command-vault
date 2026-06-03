import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

import { afterEach, describe, it } from "vitest";

import type { CommandVaultCommand } from "./model.ts";
import {
  COMMAND_VAULT_GLOBAL_STORAGE_FILE,
  createWorkspaceId,
  getWorkspaceStorageFilePath,
} from "./model.ts";
import { createCommandVaultRepository } from "./repository.ts";

const SAMPLE_GLOBAL_COMMANDS: CommandVaultCommand[] = [
  {
    id: "command_global_test",
    scope: "global",
    name: "Run tests",
    command: "npm test",
    description: "Runs the test suite",
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
  },
];

const SAMPLE_WORKSPACE_COMMANDS: CommandVaultCommand[] = [
  {
    id: "command_workspace_dev",
    scope: "workspace",
    name: "Start app",
    command: "npm run dev",
    description: null,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
  },
];

const TEMP_DIRECTORIES: string[] = [];

describe("command vault repository", () => {
  afterEach(async () => {
    await Promise.all(
      TEMP_DIRECTORIES.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("returns empty command lists when storage files are missing", async () => {
    const storageRoot = await createTempStorageRoot();
    const repository = createCommandVaultRepository({ fsPath: storageRoot });
    const workspaceId = createWorkspaceId("/tmp/project-alpha");

    assert.deepEqual(await repository.readGlobalCommands(), []);
    assert.deepEqual(await repository.readWorkspaceCommands(workspaceId), []);
  });

  it("returns an empty workspace list when there is no open workspace id", async () => {
    const storageRoot = await createTempStorageRoot();
    const repository = createCommandVaultRepository({ fsPath: storageRoot });

    assert.deepEqual(await repository.readWorkspaceCommands(null), []);
  });

  it("persists and reloads global commands under global.json", async () => {
    const storageRoot = await createTempStorageRoot();
    const repository = createCommandVaultRepository({ fsPath: storageRoot });
    const storageFilePath = join(
      storageRoot,
      COMMAND_VAULT_GLOBAL_STORAGE_FILE,
    );

    await repository.writeGlobalCommands(SAMPLE_GLOBAL_COMMANDS);

    assert.deepEqual(
      await repository.readGlobalCommands(),
      SAMPLE_GLOBAL_COMMANDS,
    );
    assert.deepEqual(
      await readJsonFile(storageFilePath),
      SAMPLE_GLOBAL_COMMANDS,
    );
  });

  it("persists and reloads workspace commands under workspaces/<id>.json", async () => {
    const storageRoot = await createTempStorageRoot();
    const repository = createCommandVaultRepository({ fsPath: storageRoot });
    const workspaceId = createWorkspaceId("/tmp/project-beta");
    const storageFilePath = join(
      storageRoot,
      getWorkspaceStorageFilePath(workspaceId),
    );

    await repository.writeWorkspaceCommands(
      workspaceId,
      SAMPLE_WORKSPACE_COMMANDS,
    );

    assert.deepEqual(
      await repository.readWorkspaceCommands(workspaceId),
      SAMPLE_WORKSPACE_COMMANDS,
    );
    assert.deepEqual(
      await readJsonFile(storageFilePath),
      SAMPLE_WORKSPACE_COMMANDS,
    );
  });

  it("ignores malformed JSON files and emits a non-blocking warning", async () => {
    const storageRoot = await createTempStorageRoot();
    const storageFilePath = join(
      storageRoot,
      COMMAND_VAULT_GLOBAL_STORAGE_FILE,
    );
    const warnings: string[] = [];
    const repository = createCommandVaultRepository(
      { fsPath: storageRoot },
      {
        onWarning(message) {
          warnings.push(message);
        },
      },
    );

    await mkdir(dirname(storageFilePath), { recursive: true });
    await writeFile(storageFilePath, '{"broken":', { encoding: "utf8" });

    assert.deepEqual(await repository.readGlobalCommands(), []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /ignored malformed JSON/u);
    assert.match(warnings[0] ?? "", /global\.json/u);
    assert.equal(
      await readFile(storageFilePath, { encoding: "utf8" }),
      '{"broken":',
    );
  });

  it("filters invalid command entries, keeps valid ones, and warns once", async () => {
    const storageRoot = await createTempStorageRoot();
    const workspaceId = createWorkspaceId("/tmp/project-gamma");
    const storageFilePath = join(
      storageRoot,
      getWorkspaceStorageFilePath(workspaceId),
    );
    const warnings: string[] = [];
    const repository = createCommandVaultRepository(
      { fsPath: storageRoot },
      {
        onWarning(message) {
          warnings.push(message);
        },
      },
    );
    const persistedContents = JSON.stringify(
      [
        SAMPLE_WORKSPACE_COMMANDS[0],
        {
          id: "command_invalid_scope",
          scope: "folder",
          name: "Broken scope",
          command: "npm run lint",
          description: null,
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
        "bad-entry",
      ],
      null,
      2,
    );

    await mkdir(dirname(storageFilePath), { recursive: true });
    await writeFile(storageFilePath, persistedContents, { encoding: "utf8" });

    assert.deepEqual(
      await repository.readWorkspaceCommands(workspaceId),
      SAMPLE_WORKSPACE_COMMANDS,
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? "", /ignored invalid command entries/u);
    assert.match(
      warnings[0] ?? "",
      /commands\[1\]\.scope must be either 'global' or 'workspace'/u,
    );
    assert.match(warnings[0] ?? "", /commands\[2\] must be an object/u);
    assert.equal(
      await readFile(storageFilePath, { encoding: "utf8" }),
      persistedContents,
    );
  });
});

async function createTempStorageRoot(): Promise<string> {
  const tempDirectory = await mkdtemp(join(tmpdir(), "command-vault-repo-"));
  const storageRoot = join(tempDirectory, "storage-root");

  TEMP_DIRECTORIES.push(tempDirectory);

  return storageRoot;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const contents = await readFile(filePath, { encoding: "utf8" });
  return JSON.parse(contents) as unknown;
}
