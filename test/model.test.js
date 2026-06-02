const assert = require("node:assert/strict");
const test = require("node:test");

const {
  COMMAND_VAULT_GLOBAL_STORAGE_FILE,
  COMMAND_VAULT_WORKSPACES_STORAGE_DIR,
  createWorkspaceId,
  getWorkspaceStorageFilePath,
  validateCommandRecord,
  validatePersistedCommandRecords,
} = require("../out/command-vault/model.js");

test("compiled model exports stable storage helpers", () => {
  const workspacePath =
    "/Users/albertmacmini/Developer/personal/vsc-snippet-catalog";
  const workspaceId = createWorkspaceId(workspacePath);

  assert.match(workspaceId, /^[a-f0-9]{64}$/u);
  assert.equal(createWorkspaceId(workspacePath), workspaceId);
  assert.notEqual(createWorkspaceId(`${workspacePath}-copy`), workspaceId);
  assert.equal(COMMAND_VAULT_GLOBAL_STORAGE_FILE, "global.json");
  assert.equal(COMMAND_VAULT_WORKSPACES_STORAGE_DIR, "workspaces");
  assert.equal(
    getWorkspaceStorageFilePath(workspaceId),
    `workspaces/${workspaceId}.json`,
  );
});

test("compiled model validates simplified persisted command records", () => {
  const validRecord = validateCommandRecord({
    id: "command_api_dev",
    scope: "workspace",
    name: "Run API dev server",
    command: "pnpm --filter api dev",
    description: "Starts the API dev server",
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    folderId: "ignored-legacy-field",
  });

  assert.deepEqual(validRecord, {
    ok: true,
    value: {
      id: "command_api_dev",
      scope: "workspace",
      name: "Run API dev server",
      command: "pnpm --filter api dev",
      description: "Starts the API dev server",
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
    },
    issues: [],
  });

  const result = validatePersistedCommandRecords([
    {
      id: "command_valid",
      scope: "global",
      name: "Valid command",
      command: "npm test",
      description: null,
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
    },
    {
      id: "command_old_scope",
      scope: "user",
      name: "Legacy scope",
      command: "npm run dev",
      description: null,
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
    },
  ]);

  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].id, "command_valid");
  assert.deepEqual(result.issues, [
    {
      path: "commands[1].scope",
      message: "must be either 'global' or 'workspace'",
    },
  ]);
});
