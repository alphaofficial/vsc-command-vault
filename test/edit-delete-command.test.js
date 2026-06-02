const assert = require("node:assert/strict");
const test = require("node:test");

const { createWorkspaceId } = require("../out/command-vault/model.js");
const {
  createCommandVaultEditDeleteService,
} = require("../out/command-vault/edit-delete-command.js");

test("compiled edit-delete service edits a global command", async () => {
  const repository = createRepositoryRecorder({
    globalCommands: [
      {
        id: "command_global_tests",
        scope: "global",
        name: "Run tests",
        command: "npm test",
        description: "Runs the full test suite",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
  });
  const window = createWindowDouble({
    inputValues: [
      " Run all tests ",
      " npm run test:all ",
      " Runs every test target ",
    ],
    quickPickLabels: ["Global", "Run tests"],
  });
  const service = createCommandVaultEditDeleteService({
    repository,
    window,
    workspace: {
      workspaceFolders: [
        {
          uri: {
            fsPath: "/tmp/project-alpha",
          },
        },
      ],
    },
    now() {
      return "2026-06-02T12:00:00.000Z";
    },
  });

  const editedCommand = await service.editCommand();

  assert.deepEqual(editedCommand, {
    id: "command_global_tests",
    scope: "global",
    name: "Run all tests",
    command: "npm run test:all",
    description: "Runs every test target",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-02T12:00:00.000Z",
  });
  assert.deepEqual(repository.writeGlobalCommandsCalls, [[editedCommand]]);
  assert.deepEqual(repository.writeWorkspaceCommandsCalls, []);
  assert.deepEqual(window.warningMessages, []);
});

test("compiled edit-delete service deletes a workspace command", async () => {
  const workspacePath = "/tmp/project-beta";
  const repository = createRepositoryRecorder({
    workspaceCommands: [
      {
        id: "command_workspace_lint",
        scope: "workspace",
        name: "Lint",
        command: "npm run lint",
        description: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "command_workspace_test",
        scope: "workspace",
        name: "Test",
        command: "npm test",
        description: "Runs workspace tests",
        createdAt: "2026-06-01T01:00:00.000Z",
        updatedAt: "2026-06-01T01:00:00.000Z",
      },
    ],
  });
  const window = createWindowDouble({
    quickPickLabels: ["Workspace", "Test", "Delete"],
  });
  const service = createCommandVaultEditDeleteService({
    repository,
    window,
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

  const deletedCommand = await service.deleteCommand();

  assert.deepEqual(deletedCommand, repository.workspaceCommands[1]);
  assert.deepEqual(repository.writeGlobalCommandsCalls, []);
  assert.deepEqual(repository.writeWorkspaceCommandsCalls, [
    {
      workspaceId: createWorkspaceId(workspacePath),
      commands: [repository.workspaceCommands[0]],
    },
  ]);
  assert.deepEqual(window.warningMessages, []);
});

function createRepositoryRecorder({
  globalCommands = [],
  workspaceCommands = [],
} = {}) {
  const writeGlobalCommandsCalls = [];
  const writeWorkspaceCommandsCalls = [];

  return {
    globalCommands,
    workspaceCommands,
    writeGlobalCommandsCalls,
    writeWorkspaceCommandsCalls,
    async readGlobalCommands() {
      return [...globalCommands];
    },
    async readWorkspaceCommands() {
      return [...workspaceCommands];
    },
    async writeGlobalCommands(commands) {
      writeGlobalCommandsCalls.push([...commands]);
    },
    async writeWorkspaceCommands(workspaceId, commands) {
      writeWorkspaceCommandsCalls.push({
        workspaceId,
        commands: [...commands],
      });
    },
  };
}

function createWindowDouble({
  inputValues = [],
  quickPickLabels = [],
} = {}) {
  const warningMessages = [];

  return {
    async showInputBox() {
      return inputValues.shift();
    },
    async showQuickPick(items) {
      const selectedLabel = quickPickLabels.shift();

      if (!selectedLabel) {
        return items[0];
      }

      return items.find((item) => item.label === selectedLabel);
    },
    async showWarningMessage(message) {
      warningMessages.push(message);
    },
    warningMessages,
  };
}
