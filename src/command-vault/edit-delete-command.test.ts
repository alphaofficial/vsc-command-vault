import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { CommandVaultCommand } from "./model.ts";
import { createWorkspaceId } from "./model.ts";
import { createCommandVaultEditDeleteService } from "./edit-delete-command.ts";

describe("command vault edit-delete service", () => {
  it("edits a command after prompting for fields", async () => {
    const workspacePath = "/tmp/project-alpha";
    const repository = createRepositoryRecorder({
      commands: [
        {
          id: "command_tests",
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
      quickPickLabels: ["Run tests"],
    });
    const service = createCommandVaultEditDeleteService({
      repository,
      window,
      workspace: {
        workspaceFolders: [{ uri: { fsPath: workspacePath } }],
      },
      now() {
        return "2026-06-02T12:00:00.000Z";
      },
    });

    const editedCommand = await service.editCommand();

    assert.deepEqual(window.quickPickLabelsSeen, [["Run tests"]]);
    assert.deepEqual(editedCommand, {
      id: "command_tests",
      name: "Run all tests",
      command: "npm run test:all",
      description: "Runs every test target",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-02T12:00:00.000Z",
    });
    assert.deepEqual(repository.writeCommandsCalls, [
      {
        workspaceId: createWorkspaceId(workspacePath),
        commands: [editedCommand],
      },
    ]);
    assert.deepEqual(window.warningMessages, []);
  });

  it("deletes a command after confirmation", async () => {
    const workspacePath = "/tmp/project-beta";
    const repository = createRepositoryRecorder({
      commands: [
        {
          id: "command_lint",
          name: "Lint",
          command: "npm run lint",
          description: null,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
        {
          id: "command_test",
          name: "Test",
          command: "npm test",
          description: "Runs tests",
          createdAt: "2026-06-01T01:00:00.000Z",
          updatedAt: "2026-06-01T01:00:00.000Z",
        },
      ],
    });
    const window = createWindowDouble({
      quickPickLabels: ["Test", "Delete"],
    });
    const service = createCommandVaultEditDeleteService({
      repository,
      window,
      workspace: {
        workspaceFolders: [{ uri: { fsPath: workspacePath } }],
      },
    });

    const deletedCommand = await service.deleteCommand();

    assert.deepEqual(deletedCommand, repository.commands[1]);
    assert.deepEqual(window.quickPickLabelsSeen, [
      ["Lint", "Test"],
      ["Delete", "Cancel"],
    ]);
    assert.deepEqual(repository.writeCommandsCalls, [
      {
        workspaceId: createWorkspaceId(workspacePath),
        commands: [repository.commands[0]],
      },
    ]);
  });

  it("warns and stops without an open workspace", async () => {
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
      id: "command_missing",
    });

    assert.equal(editedCommand, undefined);
    assert.deepEqual(window.warningMessages, [
      "Command Vault needs an open workspace to edit commands.",
    ]);
    assert.deepEqual(window.quickPickLabelsSeen, []);
    assert.deepEqual(window.inputBoxOptionsSeen, []);
    assert.deepEqual(repository.writeCommandsCalls, []);
  });
});

function createRepositoryRecorder({
  commands = [],
}: {
  commands?: CommandVaultCommand[];
} = {}): {
  commands: CommandVaultCommand[];
  writeCommandsCalls: Array<{
    commands: CommandVaultCommand[];
    workspaceId: string;
  }>;
  readCommands(workspaceId: string | null): Promise<CommandVaultCommand[]>;
  writeCommands(
    workspaceId: string,
    commands: readonly CommandVaultCommand[],
  ): Promise<void>;
} {
  const writeCommandsCalls: Array<{
    commands: CommandVaultCommand[];
    workspaceId: string;
  }> = [];

  return {
    commands,
    writeCommandsCalls,
    async readCommands() {
      return [...commands];
    },
    async writeCommands(workspaceId, nextCommands) {
      writeCommandsCalls.push({
        workspaceId,
        commands: [...nextCommands],
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

      return (
        items.find((item) => item.label === selectedLabel) ??
        items[0]
      );
    },
    async showWarningMessage(message) {
      warningMessages.push(message);
    },
  };
}
