import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { CommandVaultCommand } from "./model.ts";
import {
  createCommandVaultSearchService,
  type CommandVaultSearchQuickPick,
  type CommandVaultSearchQuickPickItem,
} from "./search-command.ts";

describe("command vault search service", () => {
  it("searches workspace commands and runs the selected result", async () => {
    const firstCommand = createCommand("command-1", {
      command: "pnpm dev",
      description: "Frontend",
      name: "Start web",
    });
    const secondCommand = createCommand("command-2", {
      command: "pnpm lint",
      description: "Lint checks",
      name: "Lint",
    });
    const repository = createRepositoryRecorder({
      commands: [firstCommand, secondCommand],
    });
    const quickPick = createQuickPickHarness();
    const contextTransitions: boolean[] = [];
    const service = createCommandVaultSearchService({
      commands: {
        executeCommand(command, _contextKey, visible) {
          assert.equal(command, "setContext");
          contextTransitions.push(Boolean(visible));
        },
      },
      repository,
      window: {
        createQuickPick<Item extends CommandVaultSearchQuickPickItem>() {
          return quickPick.instance as CommandVaultSearchQuickPick<Item>;
        },
        showWarningMessage() {
          throw new Error("warning should not be shown");
        },
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: "/tmp/project-search" } }],
      },
    });

    const searchPromise = service.searchCommands();

    await waitForMicrotasks();
    quickPick.setActiveIndex(1);
    await quickPick.accept();
    const selection = await searchPromise;

    assert.deepEqual(selection, {
      action: "run",
      command: secondCommand,
    });
    assert.deepEqual(repository.readCommandsCalls.length, 1);
    assert.deepEqual(
      quickPick.instance.items.map((item) => ({
        description: item.description,
        detail: item.detail,
        label: item.label,
      })),
      [
        {
          label: "Start web",
          description: "Frontend",
          detail: "pnpm dev",
        },
        {
          label: "Lint",
          description: "Lint checks",
          detail: "pnpm lint",
        },
      ],
    );
    assert.equal(quickPick.instance.matchOnDescription, true);
    assert.equal(quickPick.instance.matchOnDetail, true);
    assert.match(
      quickPick.instance.placeholder,
      /Alt\/Option\+Enter pastes, Cmd\/Ctrl\+Enter edits\./,
    );
    assert.deepEqual(contextTransitions, [true, false]);
  });

  it("lets the active picker switch to paste without reopening the quick pick", async () => {
    const command = createCommand("command-2", {
      command: "npm test",
      name: "Test",
    });
    const quickPick = createQuickPickHarness();
    const service = createCommandVaultSearchService({
      commands: {
        executeCommand() {},
      },
      getSettings() {
        return {
          defaultExecutionBehavior: "paste",
        };
      },
      repository: createRepositoryRecorder({ commands: [command] }),
      window: {
        createQuickPick<Item extends CommandVaultSearchQuickPickItem>() {
          return quickPick.instance as CommandVaultSearchQuickPick<Item>;
        },
        showWarningMessage() {
          throw new Error("warning should not be shown");
        },
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: "/tmp/project-search" } }],
      },
    });

    const searchPromise = service.searchCommands();

    await waitForMicrotasks();
    const triggered = await service.triggerAlternateAction();
    const selection = await searchPromise;

    assert.equal(triggered, true);
    assert.deepEqual(selection, {
      action: "run",
      command,
    });
    assert.equal(quickPick.showCalls, 1);
    assert.match(
      quickPick.instance.placeholder,
      /Enter pastes, Alt\/Option\+Enter runs, Cmd\/Ctrl\+Enter edits\./,
    );
  });

  it("warns instead of opening a picker when there is nothing to search", async () => {
    const warningMessages: string[] = [];
    let quickPickCreated = false;
    const service = createCommandVaultSearchService({
      commands: {
        executeCommand() {},
      },
      repository: createRepositoryRecorder(),
      window: {
        createQuickPick() {
          quickPickCreated = true;
          throw new Error("quick pick should not be created");
        },
        showWarningMessage(message) {
          warningMessages.push(message);
        },
      },
      workspace: {
        workspaceFolders: undefined,
      },
    });

    const selection = await service.searchCommands();

    assert.equal(selection, undefined);
    assert.equal(quickPickCreated, false);
    assert.deepEqual(warningMessages, [
      "Command Vault has no commands to search.",
    ]);
  });
});

function createCommand(
  id: string,
  overrides: Partial<CommandVaultCommand> = {},
): CommandVaultCommand {
  return {
    id,
    name: overrides.name ?? id,
    command: overrides.command ?? "echo hello",
    description:
      overrides.description === undefined ? null : overrides.description,
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
  };
}

function createRepositoryRecorder({
  commands = [],
}: {
  commands?: CommandVaultCommand[];
} = {}): {
  readCommandsCalls: Array<string | null>;
  readCommands(workspaceId: string | null): Promise<CommandVaultCommand[]>;
  writeCommands(
    workspaceId: string,
    commands: readonly CommandVaultCommand[],
  ): Promise<void>;
} {
  const readCommandsCalls: Array<string | null> = [];

  return {
    readCommandsCalls,
    async readCommands(workspaceId) {
      readCommandsCalls.push(workspaceId);
      return [...commands];
    },
    async writeCommands(workspaceId, nextCommands) {
      void workspaceId;
      void nextCommands;
    },
  };
}

function createQuickPickHarness(): {
  accept(): Promise<void>;
  instance: CommandVaultSearchQuickPick<CommandVaultSearchQuickPickItem>;
  setActiveIndex(index: number): void;
  showCalls: number;
} {
  let acceptListener: (() => void | Promise<void>) | undefined;
  let hideListener: (() => void | Promise<void>) | undefined;
  let showCalls = 0;
  const instance: CommandVaultSearchQuickPick<CommandVaultSearchQuickPickItem> = {
    activeItems: [] as CommandVaultSearchQuickPickItem[],
    items: [] as CommandVaultSearchQuickPickItem[],
    matchOnDescription: false,
    matchOnDetail: false,
    placeholder: "",
    title: "",
    dispose() {},
    hide() {
      void hideListener?.();
    },
    onDidAccept(listener: () => void | Promise<void>) {
      acceptListener = listener;
      return { dispose() {} };
    },
    onDidHide(listener: () => void | Promise<void>) {
      hideListener = listener;
      return { dispose() {} };
    },
    show() {
      showCalls += 1;

      if (instance.items[0]) {
        instance.activeItems = [instance.items[0]];
      }
    },
  };

  return {
    get showCalls() {
      return showCalls;
    },
    instance,
    async accept() {
      await acceptListener?.();
    },
    setActiveIndex(index) {
      const item = instance.items[index];

      if (!item) {
        throw new Error(`No quick pick item at index ${index}`);
      }

      instance.activeItems = [item];
    },
  };
}

async function waitForMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
