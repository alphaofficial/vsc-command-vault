import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  COMMAND_VAULT_WORKSPACES_STORAGE_DIR,
  createWorkspaceId,
  getWorkspaceStorageFilePath,
  validateCommandRecord,
  validatePersistedCommandRecords,
} from "./model.ts";

describe("command vault model", () => {
  it("derives stable workspace storage identifiers and paths", () => {
    const workspacePath = "/Users/albertmacmini/Developer/personal/vsc-snippet-catalog";
    const workspaceId = createWorkspaceId(workspacePath);

    assert.match(workspaceId, /^[a-f0-9]{64}$/u);
    assert.equal(createWorkspaceId(workspacePath), workspaceId);
    assert.notEqual(createWorkspaceId(`${workspacePath}-copy`), workspaceId);
    assert.equal(COMMAND_VAULT_WORKSPACES_STORAGE_DIR, "workspaces");
    assert.equal(getWorkspaceStorageFilePath(workspaceId),
      `workspaces/${workspaceId}.json`,
    );
  });

  it("accepts a persisted command and ignores legacy fields", () => {
    const result = validateCommandRecord({
      id: "command_api_dev",
      name: "Run API dev server",
      command: "pnpm --filter api dev",
      description: "Starts the API dev server",
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
    });

    assert.deepEqual(result, {
      ok: true,
      value: {
        id: "command_api_dev",
        name: "Run API dev server",
        command: "pnpm --filter api dev",
        description: "Starts the API dev server",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
      issues: [],
    });
  });

  it("filters invalid persisted command records and reports indexed issues", () => {
    const result = validatePersistedCommandRecords([
      {
        id: "command_valid",
        name: "Valid command",
        command: "npm test",
        description: null,
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
      {
        id: "command_missing_name",
        name: "   ",
        command: "echo hi",
        description: 42,
        createdAt: "not-a-date",
        updatedAt: "2026-06-02",
      },
      "not-an-object",
    ]);

    assert.equal(result.valid.length, 1);
    assert.equal(result.valid[0]?.id, "command_valid");
    assert.deepEqual(result.issues, [
      {
        path: "commands[1].name",
        message: "must be a non-empty string",
      },
      {
        path: "commands[1].description",
        message: "must be a string or null",
      },
      {
        path: "commands[1].createdAt",
        message: "must be an ISO-8601 timestamp string",
      },
      {
        path: "commands[1].updatedAt",
        message: "must be an ISO-8601 timestamp string",
      },
      {
        path: "commands[2]",
        message: "must be an object",
      },
    ]);
  });
});
