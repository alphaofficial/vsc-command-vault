import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { CommandVaultCommand } from "./model.ts";
import { createWorkspaceId } from "./model.ts";
import { createCommandVaultCreateService } from "./create-command.ts";

describe("command vault create-command service", () => {
  it("creates a command in the hashed workspace storage file", async () => {
    const workspacePath = "/tmp/project-beta";
    const repository = createRepositoryRecorder({
      commands: [
        {
          id: "command_existing",
          name: "Existing command",
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
        workspaceFolders: [{ uri: { fsPath: workspacePath } }],
      },
      now() {
        return "2026-06-02T11:00:00.000Z";
      },
      createId() {
        return "command_created";
      },
    });

    const createdCommand = await service.createCommand();

    assert.deepEqual(createdCommand, {
      id: "command_created",
      name: "Start app",
      command: "npm run dev",
      description: "Starts the dev server",
      createdAt: "2026-06-02T11:00:00.000Z",
      updatedAt: "2026-06-02T11:00:00.000Z",
    });
    assert.deepEqual(repository.writeCommandsCalls, [
      {
        commands: [createdCommand, repository.commands[0]],
        workspaceId: createWorkspaceId(workspacePath),
      },
    ]);
    assert.deepEqual(window.quickPickLabelsSeen, []);
    assert.deepEqual(window.warningMessages, []);
  });

  it("warns and stops without an open workspace", async () => {
    const repository = createRepositoryRecorder();
    const window = createWindowDouble();
    const service = createCommandVaultCreateService({
      repository,
      window,
      workspace: {
        workspaceFolders: undefined,
      },
    });

    const createdCommand = await service.createCommand();

    assert.equal(createdCommand, undefined);
    assert.deepEqual(window.warningMessages, [
      "Command Vault needs an open workspace to create commands.",
    ]);
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
  readCommandsCalls: Array<string | null>;
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
  const readCommandsCalls: Array<string | null> = [];
  const writeCommandsCalls: Array<{
    commands: CommandVaultCommand[];
    workspaceId: string;
  }> = [];

  return {
    commands,
    readCommandsCalls,
    writeCommandsCalls,
    async readCommands(workspaceId) {
      readCommandsCalls.push(workspaceId);
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
}: {
  inputValues?: string[];
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
      return items[0];
    },
    async showWarningMessage(message) {
      warningMessages.push(message);
    },
  };
}
