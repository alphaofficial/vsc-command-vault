const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  COMMAND_VAULT_GLOBAL_STORAGE_FILE,
  createWorkspaceId,
  getWorkspaceStorageFilePath,
} = require("../out/command-vault/model.js");
const {
  createCommandVaultRepository,
} = require("../out/command-vault/repository.js");

test("compiled repository falls back to empty lists when storage is missing", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "command-vault-repo-"));
  const storageRoot = join(tempDirectory, "storage-root");
  const repository = createCommandVaultRepository({ fsPath: storageRoot });

  try {
    assert.deepEqual(await repository.readGlobalCommands(), []);
    assert.deepEqual(
      await repository.readWorkspaceCommands(createWorkspaceId("/tmp/project")),
      [],
    );
    assert.deepEqual(await repository.readWorkspaceCommands(null), []);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("compiled repository persists global and workspace command files", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "command-vault-repo-"));
  const storageRoot = join(tempDirectory, "storage-root");
  const repository = createCommandVaultRepository({ fsPath: storageRoot });
  const workspaceId = createWorkspaceId("/tmp/project");
  const globalCommands = [
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
  const workspaceCommands = [
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

  try {
    await repository.writeGlobalCommands(globalCommands);
    await repository.writeWorkspaceCommands(workspaceId, workspaceCommands);

    assert.deepEqual(await repository.readGlobalCommands(), globalCommands);
    assert.deepEqual(
      await repository.readWorkspaceCommands(workspaceId),
      workspaceCommands,
    );
    assert.deepEqual(
      JSON.parse(
        await readFile(join(storageRoot, COMMAND_VAULT_GLOBAL_STORAGE_FILE), {
          encoding: "utf8",
        }),
      ),
      globalCommands,
    );
    assert.deepEqual(
      JSON.parse(
        await readFile(
          join(storageRoot, getWorkspaceStorageFilePath(workspaceId)),
          {
            encoding: "utf8",
          },
        ),
      ),
      workspaceCommands,
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
