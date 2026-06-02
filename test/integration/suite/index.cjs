"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { dirname, join } = require("node:path");
const vscode = require("vscode");

const EXTENSION_ID =
  process.env.COMMAND_VAULT_TEST_EXTENSION_ID ??
  "albertmacmini.vsc-snippet-catalog";
const STORAGE_DIR = join(
  process.env.COMMAND_VAULT_TEST_USER_DATA_DIR,
  "User",
  "globalStorage",
  EXTENSION_ID,
);
const WORKSPACE_DIR = process.env.COMMAND_VAULT_TEST_WORKSPACE_DIR;
const GLOBAL_STORAGE_FILE = join(STORAGE_DIR, "global.json");

module.exports = {
  async run() {
    await testExtensionActivation();
    await testCreateEditDeleteFlow();
    await testRunCommandDispatch();
    await testSearchFlowAcrossScopes();
  },
};

async function testExtensionActivation() {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);

  assert.ok(extension, `Expected ${EXTENSION_ID} to be available.`);
  await extension.activate();
  assert.equal(extension.isActive, true);

  const commands = await vscode.commands.getCommands(true);
  const requiredCommands = [
    "commandVault.copyCommand",
    "commandVault.createCommand",
    "commandVault.deleteCommand",
    "commandVault.editCommand",
    "commandVault.runCommand",
    "commandVault.searchCommands",
    "commandVault.searchCommands.alternateExecution",
    "commandVault.searchCommands.edit",
    "commandVault.searchCommands.paste",
  ];

  for (const commandId of requiredCommands) {
    assert.ok(
      commands.includes(commandId),
      `Expected ${commandId} to be registered.`,
    );
  }
}

async function testCreateEditDeleteFlow() {
  await resetStorage();

  await withMethodOverride(
    vscode.window,
    "showInputBox",
    createQueuedAsyncMethod([
      "Build",
      "npm run build",
      "Compile the project",
      "Build watch",
      "npm run build -- --watch",
      "Live compile",
    ], "showInputBox"),
    async () => {
      await vscode.commands.executeCommand(
        "commandVault.createCommand",
        "global",
      );

      const createdCommands = await readStoredCommands(GLOBAL_STORAGE_FILE);

      assert.equal(createdCommands.length, 1);
      assert.equal(createdCommands[0].name, "Build");
      assert.equal(createdCommands[0].command, "npm run build");
      assert.equal(createdCommands[0].description, "Compile the project");

      const createdCommand = createdCommands[0];

      await vscode.commands.executeCommand("commandVault.editCommand", {
        id: createdCommand.id,
        scope: "global",
      });

      const updatedCommands = await readStoredCommands(GLOBAL_STORAGE_FILE);

      assert.equal(updatedCommands.length, 1);
      assert.equal(updatedCommands[0].id, createdCommand.id);
      assert.equal(updatedCommands[0].createdAt, createdCommand.createdAt);
      assert.notEqual(updatedCommands[0].updatedAt, createdCommand.updatedAt);
      assert.equal(updatedCommands[0].name, "Build watch");
      assert.equal(updatedCommands[0].command, "npm run build -- --watch");
      assert.equal(updatedCommands[0].description, "Live compile");

      await withMethodOverride(
        vscode.window,
        "showQuickPick",
        async (items) =>
          items.find((item) => item.label === "Delete"),
        async () => {
          await vscode.commands.executeCommand("commandVault.deleteCommand", {
            id: createdCommand.id,
            scope: "global",
          });
        },
      );
    },
  );

  const deletedCommands = await readStoredCommands(GLOBAL_STORAGE_FILE);
  assert.deepEqual(deletedCommands, []);
}

async function testRunCommandDispatch() {
  await resetStorage();
  await writeStoredCommands(GLOBAL_STORAGE_FILE, [
    createCommand("global", "global-run", {
      command: "npm test",
      name: "Run tests",
    }),
  ]);

  const terminalEvents = [];

  await disposeAllTerminals();
  await withMethodOverride(
    vscode.window,
    "createTerminal",
    (name) => ({
      sendText(text, addNewLine) {
        terminalEvents.push({ type: "sendText", text, addNewLine });
      },
      show(preserveFocus) {
        terminalEvents.push({ type: "show", preserveFocus, name });
      },
    }),
    async () => {
      await vscode.commands.executeCommand("commandVault.runCommand", {
        id: "global-run",
        scope: "global",
      });
    },
  );

  assert.deepEqual(terminalEvents, [
    {
      type: "show",
      preserveFocus: false,
      name: "Command Vault",
    },
    {
      type: "sendText",
      text: "npm test",
      addNewLine: true,
    },
  ]);
}

async function testSearchFlowAcrossScopes() {
  await resetStorage();

  const workspaceCommand = createCommand("workspace", "workspace-1", {
    command: "pnpm lint",
    name: "Workspace lint",
  });
  const globalCommand = createCommand("global", "global-1", {
    command: "npm run preview",
    name: "Global preview",
  });
  const workspaceStorageFile = join(
    STORAGE_DIR,
    "workspaces",
    `${createWorkspaceId(WORKSPACE_DIR)}.json`,
  );
  const quickPickLabels = [];
  const terminalEvents = [];

  await writeStoredCommands(GLOBAL_STORAGE_FILE, [globalCommand]);
  await writeStoredCommands(workspaceStorageFile, [workspaceCommand]);
  await disposeAllTerminals();

  await withMethodOverride(
    vscode.window,
    "createTerminal",
    (name) => ({
      sendText(text, addNewLine) {
        terminalEvents.push({ type: "sendText", text, addNewLine });
      },
      show(preserveFocus) {
        terminalEvents.push({ type: "show", preserveFocus, name });
      },
    }),
    async () => {
      await withMethodOverride(
        vscode.window,
        "createQuickPick",
        () => createQuickPickHarness({
          afterShow() {
            return vscode.commands.executeCommand(
              "commandVault.searchCommands.alternateExecution",
            );
          },
          onItemsSet(items) {
            quickPickLabels.splice(
              0,
              quickPickLabels.length,
              ...items.map((item) => item.label),
            );
          },
          selectItem(items) {
            return items.find((item) => item.label === "Workspace lint");
          },
        }),
        async () => {
          await vscode.commands.executeCommand("commandVault.searchCommands");
        },
      );
    },
  );

  assert.deepEqual(quickPickLabels, ["Workspace lint", "Global preview"]);
  assert.deepEqual(terminalEvents, [
    {
      type: "show",
      preserveFocus: false,
      name: "Command Vault",
    },
    {
      type: "sendText",
      text: "pnpm lint",
      addNewLine: false,
    },
  ]);
}

function createQuickPickHarness(options) {
  let acceptListener;
  let hideListener;
  let items = [];

  const quickPick = {
    activeItems: [],
    get items() {
      return items;
    },
    set items(nextItems) {
      items = [...nextItems];
      options.onItemsSet?.(items);
    },
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
      return {
        dispose() {},
      };
    },
    onDidHide(listener) {
      hideListener = listener;
      return {
        dispose() {},
      };
    },
    show() {
      const selectedItem = options.selectItem(items) ?? items[0];
      quickPick.activeItems = selectedItem ? [selectedItem] : [];
      queueMicrotask(() => {
        if (options.afterShow) {
          void options.afterShow();
          return;
        }

        void acceptListener?.();
      });
    },
  };

  return quickPick;
}

function createQueuedAsyncMethod(values, methodName) {
  const queue = [...values];

  return async () => {
    if (queue.length === 0) {
      throw new Error(`No queued values left for ${methodName}.`);
    }

    return queue.shift();
  };
}

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

function createWorkspaceId(workspaceFolderPath) {
  return createHash("sha256").update(workspaceFolderPath).digest("hex");
}

async function disposeAllTerminals() {
  for (const terminal of vscode.window.terminals) {
    terminal.dispose();
  }

  await waitFor(() => vscode.window.terminals.length === 0);
}

async function resetStorage() {
  await writeStoredCommands(GLOBAL_STORAGE_FILE, []);
  await mkdir(join(STORAGE_DIR, "workspaces"), { recursive: true });
  await writeStoredCommands(
    join(STORAGE_DIR, "workspaces", `${createWorkspaceId(WORKSPACE_DIR)}.json`),
    [],
  );
}

async function writeStoredCommands(filePath, commands) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(commands, null, 2)}\n`, {
    encoding: "utf8",
  });
}

async function readStoredCommands(filePath) {
  await waitFor(async () => {
    const contents = await readFile(filePath, { encoding: "utf8" });
    const parsed = JSON.parse(contents);
    return Array.isArray(parsed);
  });

  const contents = await readFile(filePath, { encoding: "utf8" });
  return JSON.parse(contents);
}

async function waitFor(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const result = await predicate();

      if (result) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for integration test condition.");
}

async function withMethodOverride(target, methodName, replacement, callback) {
  const original = target[methodName];
  target[methodName] = replacement;

  try {
    return await callback();
  } finally {
    target[methodName] = original;
  }
}
