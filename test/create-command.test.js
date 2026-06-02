const assert = require("node:assert/strict");
const test = require("node:test");

const { createWorkspaceId } = require("../out/command-vault/model.js");
const {
  createCommandVaultCreateService,
} = require("../out/command-vault/create-command.js");

test("compiled create-command service saves a global command", async () => {
  const repository = createRepositoryRecorder({
    globalCommands: [
      {
        id: "command_existing_global",
        scope: "global",
        name: "Existing",
        command: "pwd",
        description: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
  });
  const window = createWindowDouble({
    inputValues: [" Run tests ", " npm test ", "   "],
    quickPickLabels: ["Global"],
  });
  const service = createCommandVaultCreateService({
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
      return "2026-06-02T10:00:00.000Z";
    },
    createId() {
      return "command_created_global";
    },
  });

  const createdCommand = await service.createCommand();

  assert.deepEqual(createdCommand, {
    id: "command_created_global",
    scope: "global",
    name: "Run tests",
    command: "npm test",
    description: null,
    createdAt: "2026-06-02T10:00:00.000Z",
    updatedAt: "2026-06-02T10:00:00.000Z",
  });
  assert.deepEqual(window.quickPickLabelsSeen, [["Workspace", "Global"]]);
  assert.deepEqual(repository.writeGlobalCommandsCalls, [
    [
      repository.globalCommands[0],
      createdCommand,
    ],
  ]);
  assert.deepEqual(repository.writeWorkspaceCommandsCalls, []);
  assert.deepEqual(window.warningMessages, []);
});

test("compiled create-command service saves a workspace command", async () => {
  const workspacePath = "/tmp/project-beta";
  const repository = createRepositoryRecorder({
    workspaceCommands: [
      {
        id: "command_existing_workspace",
        scope: "workspace",
        name: "Existing workspace command",
        command: "npm run lint",
        description: "Lint the workspace",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
  });
  const window = createWindowDouble({
    inputValues: [
      " Start app ",
      " npm run dev ",
      " Starts the dev server ",
    ],
  });
  const service = createCommandVaultCreateService({
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
    now() {
      return "2026-06-02T11:00:00.000Z";
    },
    createId() {
      return "command_created_workspace";
    },
  });

  const createdCommand = await service.createCommand("workspace");

  assert.deepEqual(createdCommand, {
    id: "command_created_workspace",
    scope: "workspace",
    name: "Start app",
    command: "npm run dev",
    description: "Starts the dev server",
    createdAt: "2026-06-02T11:00:00.000Z",
    updatedAt: "2026-06-02T11:00:00.000Z",
  });
  assert.deepEqual(repository.writeGlobalCommandsCalls, []);
  assert.deepEqual(repository.writeWorkspaceCommandsCalls, [
    {
      commands: [
        repository.workspaceCommands[0],
        createdCommand,
      ],
      workspaceId: createWorkspaceId(workspacePath),
    },
  ]);
  assert.deepEqual(window.warningMessages, []);
});

test("compiled create-command service warns without a workspace", async () => {
  const repository = createRepositoryRecorder();
  const window = createWindowDouble();
  const service = createCommandVaultCreateService({
    repository,
    window,
    workspace: {
      workspaceFolders: undefined,
    },
  });

  const createdCommand = await service.createCommand("workspace");

  assert.equal(createdCommand, undefined);
  assert.deepEqual(window.warningMessages, [
    "Command Vault needs an open workspace to create workspace commands.",
  ]);
  assert.deepEqual(window.inputBoxOptionsSeen, []);
  assert.deepEqual(repository.writeGlobalCommandsCalls, []);
  assert.deepEqual(repository.writeWorkspaceCommandsCalls, []);
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
  const inputBoxOptionsSeen = [];
  const quickPickLabelsSeen = [];
  const warningMessages = [];

  return {
    inputBoxOptionsSeen,
    quickPickLabelsSeen,
    warningMessages,
    async showInputBox(options) {
      inputBoxOptionsSeen.push(options);
      return inputValues.shift();
    },
    async showQuickPick(items) {
      quickPickLabelsSeen.push(items.map((item) => item.label));
      const selectedLabel = quickPickLabels.shift();

      if (!selectedLabel) {
        return items[0];
      }

      return items.find((item) => item.label === selectedLabel);
    },
    async showWarningMessage(message) {
      warningMessages.push(message);
    },
  };
}
