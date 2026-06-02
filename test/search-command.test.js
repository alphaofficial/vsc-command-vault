const assert = require("node:assert/strict");
const test = require("node:test");

const {
  COMMAND_VAULT_SEARCH_COMMAND_ID,
  createCommandVaultSearchService,
} = require("../out/command-vault/search-command.js");

test("compiled search service exports the search command id", () => {
  assert.equal(COMMAND_VAULT_SEARCH_COMMAND_ID, "commandVault.searchCommands");
});

test("compiled search service returns a paste action for the active result", async () => {
  const globalCommand = createCommand("global", "global-1", {
    command: "npm test",
    name: "Test",
  });
  const quickPick = createQuickPickHarness();
  const service = createCommandVaultSearchService({
    commands: {
      executeCommand() {},
    },
    repository: {
      async readGlobalCommands() {
        return [globalCommand];
      },
      async readWorkspaceCommands() {
        throw new Error("workspace commands should not be read");
      },
      async writeGlobalCommands() {},
      async writeWorkspaceCommands() {},
    },
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
  const triggered = await service.triggerActiveAction("paste");
  const selection = await searchPromise;

  assert.equal(triggered, true);
  assert.deepEqual(selection, {
    action: "paste",
    command: globalCommand,
  });
  assert.equal(quickPick.showCalls, 1);
});

function createCommand(scope, id, overrides = {}) {
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

function createQuickPickHarness() {
  let acceptListener;
  let hideListener;
  let showCalls = 0;
  const instance = {
    activeItems: [],
    items: [],
    matchOnDescription: false,
    matchOnDetail: false,
    placeholder: "",
    title: "",
    dispose() {},
    hide() {
      void hideListener?.();
    },
    onDidAccept(listener) {
      acceptListener = listener;
      return { dispose() {} };
    },
    onDidHide(listener) {
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
  };
}

async function waitForMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
