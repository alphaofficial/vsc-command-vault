import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { CommandVaultCommand } from "./model.ts";
import { createWorkspaceId } from "./model.ts";
import { createCommandVaultEditDeleteService } from "./edit-delete-command.ts";

describe("command vault edit-delete service", () => {
  it("edits a global command after prompting for scope and command", async () => {
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

    assert.deepEqual(window.quickPickLabelsSeen, [
      ["Workspace", "Global"],
      ["Run tests"],
    ]);
    assert.deepEqual(window.inputBoxOptionsSeen, [
      {
        title: "Edit Global Command",
        prompt: "Update the command name.",
        placeHolder: "Run tests",
        value: "Run tests",
      },
      {
        title: "Edit Global Command",
        prompt: "Update the terminal command.",
        placeHolder: "npm test",
        value: "npm test",
      },
      {
        title: "Edit Global Command",
        prompt: "Update the optional description.",
        placeHolder: "Runs the test suite",
        value: "Runs the full test suite",
      },
    ]);
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

  it("deletes a workspace command after confirmation", async () => {
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
    assert.deepEqual(window.quickPickLabelsSeen, [
      ["Workspace", "Global"],
      ["Lint", "Test"],
      ["Delete", "Cancel"],
    ]);
    assert.deepEqual(repository.writeGlobalCommandsCalls, []);
    assert.deepEqual(repository.writeWorkspaceCommandsCalls, [
      {
        workspaceId: createWorkspaceId(workspacePath),
        commands: [repository.workspaceCommands[0]],
      },
    ]);
    assert.deepEqual(window.warningMessages, []);
  });

  it("warns and stops when a workspace edit is requested without an open workspace", async () => {
    const repository = createRepositoryRecorder();
    const window = createWindowDouble();
    const service = createCommandVaultEditDeleteService({
      repository,
      window,
      workspace: {
        workspaceFolders: undefined,
      },
    });

    const editedCommand = await service.editCommand({
      id: "command_workspace_missing",
      scope: "workspace",
    });

    assert.equal(editedCommand, undefined);
    assert.deepEqual(window.warningMessages, [
      "Command Vault needs an open workspace to edit workspace commands.",
    ]);
    assert.deepEqual(window.quickPickLabelsSeen, []);
    assert.deepEqual(window.inputBoxOptionsSeen, []);
    assert.deepEqual(repository.writeGlobalCommandsCalls, []);
    assert.deepEqual(repository.writeWorkspaceCommandsCalls, []);
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
  workspaceCommands: CommandVaultCommand[];
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
} {
  const writeGlobalCommandsCalls: CommandVaultCommand[][] = [];
  const writeWorkspaceCommandsCalls: Array<{
    commands: CommandVaultCommand[];
    workspaceId: string;
  }> = [];

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
