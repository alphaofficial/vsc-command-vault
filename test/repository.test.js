const assert = require("node:assert/strict");
const { mkdir, mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
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

test("compiled repository warns and ignores malformed or invalid storage data", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "command-vault-repo-"));
  const storageRoot = join(tempDirectory, "storage-root");
  const workspaceId = createWorkspaceId("/tmp/project-invalid");
  const globalStoragePath = join(storageRoot, COMMAND_VAULT_GLOBAL_STORAGE_FILE);
  const workspaceStoragePath = join(
    storageRoot,
    getWorkspaceStorageFilePath(workspaceId),
  );
  const warnings = [];
  const repository = createCommandVaultRepository(
    { fsPath: storageRoot },
    {
      onWarning(message) {
        warnings.push(message);
      },
    },
  );

  try {
    await mkdir(dirname(globalStoragePath), { recursive: true });
    await mkdir(dirname(workspaceStoragePath), { recursive: true });
    await writeFile(globalStoragePath, '{"broken":', { encoding: "utf8" });
    await writeFile(
      workspaceStoragePath,
      JSON.stringify([
        {
          id: "command_workspace_dev",
          scope: "workspace",
          name: "Start app",
          command: "npm run dev",
          description: null,
          createdAt: "2026-06-02T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
        "bad-entry",
      ]),
      { encoding: "utf8" },
    );

    assert.deepEqual(await repository.readGlobalCommands(), []);
    assert.deepEqual(await repository.readWorkspaceCommands(workspaceId), [
      {
        id: "command_workspace_dev",
        scope: "workspace",
        name: "Start app",
        command: "npm run dev",
        description: null,
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    ]);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /ignored malformed JSON/u);
    assert.match(warnings[1], /ignored invalid command entries/u);
    assert.match(warnings[1], /commands\[1\] must be an object/u);
    assert.equal(
      await readFile(globalStoragePath, { encoding: "utf8" }),
      '{"broken":',
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
