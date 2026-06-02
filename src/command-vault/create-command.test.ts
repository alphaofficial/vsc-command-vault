import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CommandVaultCommand } from "./model.ts";
import { createWorkspaceId } from "./model.ts";
import { createCommandVaultCreateService } from "./create-command.ts";

describe("command vault create-command service", () => {
  it("creates a global command after prompting for scope and fields", async () => {
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

  it("creates a workspace command in the hashed workspace storage file", async () => {
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

  it("warns and stops when a workspace command is requested without an open workspace", async () => {
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

  it("filters disabled scopes out of the create picker", async () => {
    const workspacePath = "/tmp/project-delta";
    const repository = createRepositoryRecorder();
    const window = createWindowDouble({
      inputValues: [" Build ", " npm run build ", " Compile the repo "],
    });
    const service = createCommandVaultCreateService({
      getSettings() {
        return {
          defaultExecutionBehavior: "run",
          enableGlobalScope: false,
          enableWorkspaceScope: true,
        };
      },
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
        return "2026-06-03T09:00:00.000Z";
      },
      createId() {
        return "command_filtered_workspace";
      },
    });

    const createdCommand = await service.createCommand();

    assert.deepEqual(window.quickPickLabelsSeen, [["Workspace"]]);
    assert.deepEqual(createdCommand, {
      id: "command_filtered_workspace",
      scope: "workspace",
      name: "Build",
      command: "npm run build",
      description: "Compile the repo",
      createdAt: "2026-06-03T09:00:00.000Z",
      updatedAt: "2026-06-03T09:00:00.000Z",
    });
    assert.deepEqual(repository.writeGlobalCommandsCalls, []);
    assert.deepEqual(repository.writeWorkspaceCommandsCalls, [
      {
        commands: [createdCommand],
        workspaceId: createWorkspaceId(workspacePath),
      },
    ]);
  });
});

function createRepositoryRecorder({
  globalCommands = [],
  workspaceCommands = [],
}: {
  globalCommands?: CommandVaultCommand[];
  workspaceCommands?: CommandVaultCommand[];
} = {}): {
  globalCommands: CommandVaultCommand[];
  readGlobalCommandsCalls: number;
  readWorkspaceCommandsCalls: string[];
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
  workspaceCommands: CommandVaultCommand[];
} {
  let readGlobalCommandsCalls = 0;
  const readWorkspaceCommandsCalls: string[] = [];
  const writeGlobalCommandsCalls: CommandVaultCommand[][] = [];
  const writeWorkspaceCommandsCalls: Array<{
    commands: CommandVaultCommand[];
    workspaceId: string;
  }> = [];

  return {
    globalCommands,
    workspaceCommands,
    get readGlobalCommandsCalls() {
      return readGlobalCommandsCalls;
    },
    readWorkspaceCommandsCalls,
    writeGlobalCommandsCalls,
    writeWorkspaceCommandsCalls,
    async readGlobalCommands() {
      readGlobalCommandsCalls += 1;
      return [...globalCommands];
    },
    async readWorkspaceCommands(workspaceId) {
      if (workspaceId !== null) {
        readWorkspaceCommandsCalls.push(workspaceId);
      }

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
}: {
  inputValues?: string[];
  quickPickLabels?: string[];
} = {}): {
  inputBoxOptionsSeen: Array<{ placeHolder?: string; prompt?: string; title?: string; value?: string }>;
  quickPickLabelsSeen: string[][];
  showInputBox(options: {
    placeHolder?: string;
    prompt?: string;
    title?: string;
    value?: string;
  }): Promise<string | undefined>;
  showQuickPick<Item extends { label: string }>(
    items: readonly Item[],
  ): Promise<Item | undefined>;
  showWarningMessage(message: string): Promise<void>;
  warningMessages: string[];
} {
  const inputBoxOptionsSeen: Array<{
    placeHolder?: string;
    prompt?: string;
    title?: string;
    value?: string;
  }> = [];
  const quickPickLabelsSeen: string[][] = [];
  const warningMessages: string[] = [];

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
