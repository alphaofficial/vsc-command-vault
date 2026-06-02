import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CommandVaultCommand } from "./model.ts";
import {
  createCommandVaultSearchService,
} from "./search-command.ts";

describe("command vault search service", () => {
  it("searches workspace and global commands together and runs the selected result", async () => {
    const workspaceCommand = createCommand("workspace", "workspace-1", {
      command: "pnpm dev",
      description: "Frontend",
      name: "Start web",
    });
    const globalCommand = createCommand("global", "global-1", {
      command: "pnpm lint",
      description: "Shared",
      name: "Lint",
    });
    const repository = createRepositoryRecorder({
      globalCommands: [globalCommand],
      workspaceCommands: [workspaceCommand],
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
        createQuickPick() {
          return quickPick.instance;
        },
        showWarningMessage() {
          throw new Error("warning should not be shown");
        },
      },
      workspace: {
        workspaceFolders: [
          {
            uri: {
              fsPath: "/tmp/project-search",
            },
          },
        ],
      },
    });

    const searchPromise = service.searchCommands();

    await waitForMicrotasks();
    quickPick.setActiveIndex(1);
    await quickPick.accept();
    const selection = await searchPromise;

    assert.deepEqual(selection, {
      action: "run",
      command: globalCommand,
    });
    assert.deepEqual(repository.readGlobalCommandsCalls, 1);
    assert.deepEqual(repository.readWorkspaceCommandsCalls.length, 1);
    assert.deepEqual(
      quickPick.instance.items.map((item) => ({
        description: item.description,
        detail: item.detail,
        label: item.label,
      })),
      [
        {
          label: "Start web",
          description: "Frontend · workspace",
          detail: "pnpm dev",
        },
        {
          label: "Lint",
          description: "Shared · global",
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
    const globalCommand = createCommand("global", "global-2", {
      command: "npm test",
      name: "Test",
    });
    const repository = createRepositoryRecorder({
      globalCommands: [globalCommand],
    });
    const quickPick = createQuickPickHarness();
    const service = createCommandVaultSearchService({
      commands: {
        executeCommand() {},
      },
      getSettings() {
        return {
          defaultExecutionBehavior: "paste",
          enableGlobalScope: true,
          enableWorkspaceScope: true,
        };
      },
      repository,
      window: {
        createQuickPick() {
          return quickPick.instance;
        },
        showWarningMessage() {
          throw new Error("warning should not be shown");
        },
      },
      workspace: {
        workspaceFolders: undefined,
      },
    });

    const searchPromise = service.searchCommands();

    await waitForMicrotasks();
    const triggered = await service.triggerAlternateAction();
    const selection = await searchPromise;

    assert.equal(triggered, true);
    assert.deepEqual(selection, {
      action: "run",
      command: globalCommand,
    });
    assert.deepEqual(repository.readWorkspaceCommandsCalls, []);
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

  it("warns when settings disable every searchable scope", async () => {
    const warningMessages: string[] = [];
    const repository = createRepositoryRecorder({
      globalCommands: [createCommand("global", "global-3")],
      workspaceCommands: [createCommand("workspace", "workspace-3")],
    });
    const service = createCommandVaultSearchService({
      commands: {
        executeCommand() {},
      },
      getSettings() {
        return {
          defaultExecutionBehavior: "run",
          enableGlobalScope: false,
          enableWorkspaceScope: false,
        };
      },
      repository,
      window: {
        createQuickPick() {
          throw new Error("quick pick should not be created");
        },
        showWarningMessage(message) {
          warningMessages.push(message);
        },
      },
      workspace: {
        workspaceFolders: [
          {
            uri: {
              fsPath: "/tmp/project-search",
            },
          },
        ],
      },
    });

    const selection = await service.searchCommands();

    assert.equal(selection, undefined);
    assert.equal(repository.readGlobalCommandsCalls, 0);
    assert.deepEqual(repository.readWorkspaceCommandsCalls, []);
    assert.deepEqual(warningMessages, [
      "Command Vault search is unavailable because all scopes are disabled in settings.",
    ]);
  });
});

function createCommand(
  scope: "global" | "workspace",
  id: string,
  overrides: Partial<CommandVaultCommand> = {},
): CommandVaultCommand {
  return {
    id,
    scope,
    name: overrides.name ?? `${scope}-${id}`,
    command: overrides.command ?? "echo hello",
    description:
      overrides.description === undefined ? null : overrides.description,
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
  };
}

function createRepositoryRecorder({
  globalCommands = [],
  workspaceCommands = [],
}: {
  globalCommands?: CommandVaultCommand[];
  workspaceCommands?: CommandVaultCommand[];
} = {}): {
  readGlobalCommandsCalls: number;
  readWorkspaceCommandsCalls: string[];
  readGlobalCommands(): Promise<CommandVaultCommand[]>;
  readWorkspaceCommands(workspaceId: string | null): Promise<CommandVaultCommand[]>;
  writeGlobalCommands(commands: readonly CommandVaultCommand[]): Promise<void>;
  writeWorkspaceCommands(
    workspaceId: string,
    commands: readonly CommandVaultCommand[],
  ): Promise<void>;
} {
  let readGlobalCommandsCalls = 0;
  const readWorkspaceCommandsCalls: string[] = [];

  return {
    get readGlobalCommandsCalls() {
      return readGlobalCommandsCalls;
    },
    readWorkspaceCommandsCalls,
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
      void commands;
    },
    async writeWorkspaceCommands(workspaceId, commands) {
      void workspaceId;
      void commands;
    },
  };
}

function createQuickPickHarness(): {
  accept(): Promise<void>;
  instance: {
    activeItems: readonly Array<{
      command: CommandVaultCommand;
      description?: string;
      detail?: string;
      label: string;
    }>;
    items: readonly Array<{
      command: CommandVaultCommand;
      description?: string;
      detail?: string;
      label: string;
    }>;
    matchOnDescription: boolean;
    matchOnDetail: boolean;
    placeholder: string;
    title: string;
    dispose(): void;
    hide(): void;
    onDidAccept(listener: () => void | Promise<void>): { dispose(): void };
    onDidHide(listener: () => void | Promise<void>): { dispose(): void };
    show(): void;
  };
  setActiveIndex(index: number): void;
  showCalls: number;
} {
  let acceptListener: (() => void | Promise<void>) | undefined;
  let hideListener: (() => void | Promise<void>) | undefined;
  let showCalls = 0;
  const instance = {
    activeItems: [] as Array<{
      command: CommandVaultCommand;
      description?: string;
      detail?: string;
      label: string;
    }>,
    items: [] as Array<{
      command: CommandVaultCommand;
      description?: string;
      detail?: string;
      label: string;
    }>,
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

      if (item) {
        instance.activeItems = [item];
      }
    },
  };
}

async function waitForMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
