const assert = require("node:assert/strict");
const { mkdtemp, mkdir, readFile, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const test = require("node:test");

const {
  activate,
  COMMAND_VAULT_COPY_COMMAND_ID,
  COMMAND_VAULT_CREATE_COMMAND_ID,
  COMMAND_VAULT_DELETE_COMMAND_ID,
  COMMAND_VAULT_EDIT_COMMAND_ID,
  COMMAND_VAULT_EXTENSION_NAME,
  COMMAND_VAULT_RUN_COMMAND_ID,
  COMMAND_VAULT_SEARCH_COMMAND_ID,
  COMMAND_VAULT_VIEW_CONTAINER_ID,
  COMMAND_VAULT_VIEW_ID,
  deactivate,
} = require("../out/extension.js");

test("compiled extension exports the scaffold identifiers", () => {
  assert.equal(COMMAND_VAULT_EXTENSION_NAME, "Command Vault");
  assert.equal(COMMAND_VAULT_VIEW_CONTAINER_ID, "commandVault");
  assert.equal(COMMAND_VAULT_VIEW_ID, "commandVault.commands");
  assert.equal(COMMAND_VAULT_COPY_COMMAND_ID, "commandVault.copyCommand");
  assert.equal(COMMAND_VAULT_CREATE_COMMAND_ID, "commandVault.createCommand");
  assert.equal(COMMAND_VAULT_EDIT_COMMAND_ID, "commandVault.editCommand");
  assert.equal(COMMAND_VAULT_DELETE_COMMAND_ID, "commandVault.deleteCommand");
  assert.equal(COMMAND_VAULT_RUN_COMMAND_ID, "commandVault.runCommand");
  assert.equal(COMMAND_VAULT_SEARCH_COMMAND_ID, "commandVault.searchCommands");
});

test("compiled activation hooks are callable", () => {
  assert.doesNotThrow(() => activate());
  assert.doesNotThrow(() => deactivate());
});

test("compiled activation routes sidebar actions to execution handlers", async () => {
  const storagePath = await mkdtemp(join(tmpdir(), "command-vault-extension-"));
  const subscriptions = [];
  const registrations = [];
  const clipboardWrites = [];
  const sendTextCalls = [];
  const showCalls = [];
  const warningMessages = [];
  let registeredProvider;
  let receiveMessage;

  await mkdir(join(storagePath, "workspaces"), { recursive: true });
  await writeFile(
    join(storagePath, "global.json"),
    `${JSON.stringify([createStoredCommand()], null, 2)}\n`,
    { encoding: "utf8" },
  );

  activate(
    {
      globalStorageUri: {
        fsPath: storagePath,
      },
      subscriptions: {
        push(...items) {
          subscriptions.push(...items);
          return subscriptions.length;
        },
      },
    },
    {
      commands: {
        registerCommand(command) {
          registrations.push(command);
          return {
            dispose() {},
          };
        },
      },
      env: {
        clipboard: {
          async writeText(text) {
            clipboardWrites.push(text);
          },
        },
      },
      window: {
        activeTerminal: {
          sendText(text, addNewLine) {
            sendTextCalls.push({ text, addNewLine });
          },
          show(preserveFocus) {
            showCalls.push(preserveFocus);
          },
        },
        createTerminal() {
          throw new Error("active terminal should be reused");
        },
        registerWebviewViewProvider(viewId, provider) {
          assert.equal(viewId, COMMAND_VAULT_VIEW_ID);
          registeredProvider = provider;
          return {
            dispose() {},
          };
        },
        createQuickPick() {
          return {
            activeItems: [],
            items: [],
            matchOnDescription: false,
            matchOnDetail: false,
            placeholder: "",
            title: "",
            dispose() {},
            hide() {},
            onDidAccept() {
              return { dispose() {} };
            },
            onDidHide() {
              return { dispose() {} };
            },
            show() {},
          };
        },
        async showInputBox() {
          return undefined;
        },
        async showQuickPick(items) {
          return items[0];
        },
        showWarningMessage(message) {
          warningMessages.push(message);
          return undefined;
        },
      },
      workspace: {
        workspaceFolders: undefined,
      },
    },
  );

  const webview = {
    html: "",
    onDidReceiveMessage(listener) {
      receiveMessage = listener;
    },
    options: {},
  };

  await registeredProvider.resolveWebviewView({ webview });
  await receiveMessage({
    type: "commandVault.action",
    action: "copy",
    target: {
      id: "global-1",
      scope: "global",
    },
  });
  await receiveMessage({
    type: "commandVault.action",
    action: "run",
    target: {
      id: "global-1",
      scope: "global",
    },
  });

  assert.deepEqual(registrations, [
    COMMAND_VAULT_CREATE_COMMAND_ID,
    COMMAND_VAULT_EDIT_COMMAND_ID,
    COMMAND_VAULT_DELETE_COMMAND_ID,
    COMMAND_VAULT_RUN_COMMAND_ID,
    COMMAND_VAULT_COPY_COMMAND_ID,
    COMMAND_VAULT_SEARCH_COMMAND_ID,
    "commandVault.searchCommands.paste",
    "commandVault.searchCommands.alternateExecution",
    "commandVault.searchCommands.edit",
  ]);
  assert.equal(webview.options.enableScripts, true);
  assert.match(webview.html, /data-command-vault-action="run"/);
  assert.deepEqual(clipboardWrites, ["npm run dev"]);
  assert.deepEqual(showCalls, [false]);
  assert.deepEqual(sendTextCalls, [
    {
      text: "npm run dev",
      addNewLine: true,
    },
  ]);
  assert.deepEqual(warningMessages, []);
  assert.equal(subscriptions.length, 10);
});

test("compiled activation routes quick-pick search actions", async () => {
  const storagePath = await mkdtemp(join(tmpdir(), "command-vault-search-"));
  const commandCallbacks = new Map();
  const sendTextCalls = [];
  const warningMessages = [];
  const inputBoxValues = [
    "Preview app",
    "npm run preview",
    "Start the preview server",
  ];
  const quickPick = createQuickPickHarness();
  let registeredProvider;

  await mkdir(join(storagePath, "workspaces"), { recursive: true });
  await writeFile(
    join(storagePath, "global.json"),
    `${JSON.stringify([createStoredCommand()], null, 2)}\n`,
    { encoding: "utf8" },
  );

  activate(
    {
      globalStorageUri: {
        fsPath: storagePath,
      },
      subscriptions: {
        push(...items) {
          return items.length;
        },
      },
    },
    {
      commands: {
        executeCommand() {
          return undefined;
        },
        registerCommand(command, callback) {
          commandCallbacks.set(command, callback);
          return {
            dispose() {},
          };
        },
      },
      env: {
        clipboard: {
          async writeText() {},
        },
      },
      window: {
        activeTerminal: {
          sendText(text, addNewLine) {
            sendTextCalls.push({ text, addNewLine });
          },
          show() {},
        },
        createTerminal() {
          throw new Error("active terminal should be reused");
        },
        registerWebviewViewProvider(_viewId, provider) {
          registeredProvider = provider;
          return {
            dispose() {},
          };
        },
        createQuickPick() {
          return quickPick.instance;
        },
        async showInputBox() {
          return inputBoxValues.shift();
        },
        async showQuickPick(items) {
          return items[0];
        },
        showWarningMessage(message) {
          warningMessages.push(message);
          return undefined;
        },
      },
      workspace: {
        getConfiguration() {
          return {
            get(key, defaultValue) {
              return key === "defaultExecutionBehavior"
                ? "paste"
                : defaultValue;
            },
          };
        },
        workspaceFolders: undefined,
      },
    },
  );

  const webview = {
    html: "",
    onDidReceiveMessage() {},
    options: {},
  };

  await registeredProvider.resolveWebviewView({ webview });

  const runSearchPromise = commandCallbacks.get(COMMAND_VAULT_SEARCH_COMMAND_ID)();
  await waitForQuickPickShow(quickPick, 1);
  await quickPick.accept();
  await runSearchPromise;

  const pasteSearchPromise = commandCallbacks.get(COMMAND_VAULT_SEARCH_COMMAND_ID)();
  await waitForQuickPickShow(quickPick, 2);
  await commandCallbacks.get("commandVault.searchCommands.alternateExecution")();
  await pasteSearchPromise;

  const editSearchPromise = commandCallbacks.get(COMMAND_VAULT_SEARCH_COMMAND_ID)();
  await waitForQuickPickShow(quickPick, 3);
  await commandCallbacks.get("commandVault.searchCommands.edit")();
  await editSearchPromise;

  const persistedCommands = JSON.parse(
    await readFile(join(storagePath, "global.json"), { encoding: "utf8" }),
  );

  assert.deepEqual(sendTextCalls, [
    {
      text: "npm run dev",
      addNewLine: false,
    },
    {
      text: "npm run dev",
      addNewLine: true,
    },
  ]);
  assert.match(webview.html, />Preview app</);
  assert.match(webview.html, /npm run preview/);
  assert.doesNotMatch(webview.html, />Start app</);
  assert.deepEqual(persistedCommands, [
    {
      name: "Preview app",
      command: "npm run preview",
      description: "Start the preview server",
      id: "global-1",
      scope: "global",
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: persistedCommands[0]?.updatedAt,
    },
  ]);
  assert.notEqual(
    persistedCommands[0]?.updatedAt,
    "2026-06-02T00:00:00.000Z",
  );
  assert.deepEqual(warningMessages, []);
  assert.equal(quickPick.showCalls, 3);
});

test("compiled activation refreshes the sidebar when settings change", async () => {
  const storagePath = await mkdtemp(join(tmpdir(), "command-vault-settings-"));
  const configurationState = {
    defaultExecutionBehavior: "run",
    enableGlobalScope: true,
    enableWorkspaceScope: true,
  };
  let registeredProvider;
  let changeConfigurationListener;

  await mkdir(join(storagePath, "workspaces"), { recursive: true });
  await writeFile(
    join(storagePath, "global.json"),
    `${JSON.stringify([createStoredCommand()], null, 2)}\n`,
    { encoding: "utf8" },
  );

  activate(
    {
      globalStorageUri: {
        fsPath: storagePath,
      },
      subscriptions: {
        push(...items) {
          return items.length;
        },
      },
    },
    {
      commands: {
        registerCommand() {
          return {
            dispose() {},
          };
        },
      },
      env: {
        clipboard: {
          async writeText() {},
        },
      },
      window: {
        activeTerminal: undefined,
        createTerminal() {
          throw new Error("createTerminal should not be used");
        },
        registerWebviewViewProvider(_viewId, provider) {
          registeredProvider = provider;
          return {
            dispose() {},
          };
        },
        createQuickPick() {
          throw new Error("search should not be used");
        },
        async showInputBox() {
          return undefined;
        },
        async showQuickPick() {
          return undefined;
        },
        showWarningMessage() {
          return undefined;
        },
      },
      workspace: {
        getConfiguration() {
          return {
            get(key, defaultValue) {
              switch (key) {
                case "defaultExecutionBehavior":
                  return configurationState.defaultExecutionBehavior;
                case "enableGlobalScope":
                  return configurationState.enableGlobalScope;
                case "enableWorkspaceScope":
                  return configurationState.enableWorkspaceScope;
                default:
                  return defaultValue;
              }
            },
          };
        },
        onDidChangeConfiguration(listener) {
          changeConfigurationListener = listener;
          return {
            dispose() {},
          };
        },
        workspaceFolders: undefined,
      },
    },
  );

  const webview = {
    html: "",
    onDidReceiveMessage() {},
    options: {},
  };

  await registeredProvider.resolveWebviewView({ webview });
  assert.match(webview.html, />Start app</);
  assert.doesNotMatch(webview.html, /Global commands disabled/);

  configurationState.enableGlobalScope = false;
  await changeConfigurationListener({
    affectsConfiguration(section) {
      return section === "commandVault";
    },
  });

  assert.doesNotMatch(webview.html, />Start app</);
  assert.match(webview.html, /Global commands disabled/);
});

test("compiled activation blocks quick-pick execution when a scope becomes disabled", async () => {
  const storagePath = await mkdtemp(join(tmpdir(), "command-vault-search-disabled-"));
  const commandCallbacks = new Map();
  const configurationState = {
    defaultExecutionBehavior: "paste",
    enableGlobalScope: true,
    enableWorkspaceScope: true,
  };
  const sendTextCalls = [];
  const warningMessages = [];
  const quickPick = createQuickPickHarness();
  let registeredProvider;

  await mkdir(join(storagePath, "workspaces"), { recursive: true });
  await writeFile(
    join(storagePath, "global.json"),
    `${JSON.stringify([createStoredCommand()], null, 2)}\n`,
    { encoding: "utf8" },
  );

  activate(
    {
      globalStorageUri: {
        fsPath: storagePath,
      },
      subscriptions: {
        push(...items) {
          return items.length;
        },
      },
    },
    {
      commands: {
        executeCommand() {
          return undefined;
        },
        registerCommand(command, callback) {
          commandCallbacks.set(command, callback);
          return {
            dispose() {},
          };
        },
      },
      env: {
        clipboard: {
          async writeText() {},
        },
      },
      window: {
        activeTerminal: {
          sendText(text, addNewLine) {
            sendTextCalls.push({ text, addNewLine });
          },
          show() {},
        },
        createTerminal() {
          throw new Error("active terminal should be reused");
        },
        registerWebviewViewProvider(_viewId, provider) {
          registeredProvider = provider;
          return {
            dispose() {},
          };
        },
        createQuickPick() {
          return quickPick.instance;
        },
        async showInputBox() {
          return undefined;
        },
        async showQuickPick(items) {
          return items[0];
        },
        showWarningMessage(message) {
          warningMessages.push(message);
          return undefined;
        },
      },
      workspace: {
        getConfiguration() {
          return {
            get(key, defaultValue) {
              switch (key) {
                case "defaultExecutionBehavior":
                  return configurationState.defaultExecutionBehavior;
                case "enableGlobalScope":
                  return configurationState.enableGlobalScope;
                case "enableWorkspaceScope":
                  return configurationState.enableWorkspaceScope;
                default:
                  return defaultValue;
              }
            },
          };
        },
        workspaceFolders: undefined,
      },
    },
  );

  const webview = {
    html: "",
    onDidReceiveMessage() {},
    options: {},
  };

  await registeredProvider.resolveWebviewView({ webview });

  const pasteSearchPromise = commandCallbacks.get(COMMAND_VAULT_SEARCH_COMMAND_ID)();
  await waitForQuickPickShow(quickPick, 1);
  configurationState.enableGlobalScope = false;
  await quickPick.accept();
  await pasteSearchPromise;

  configurationState.enableGlobalScope = true;
  const runSearchPromise = commandCallbacks.get(COMMAND_VAULT_SEARCH_COMMAND_ID)();
  await waitForQuickPickShow(quickPick, 2);
  configurationState.enableGlobalScope = false;
  await commandCallbacks.get("commandVault.searchCommands.alternateExecution")();
  await runSearchPromise;

  assert.deepEqual(sendTextCalls, []);
  assert.deepEqual(warningMessages, [
    "Command Vault global commands are disabled in settings.",
    "Command Vault global commands are disabled in settings.",
  ]);
});

function createStoredCommand() {
  return {
    id: "global-1",
    scope: "global",
    name: "Start app",
    command: "npm run dev",
    description: "Run the dev server",
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
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

async function waitForQuickPickShow(quickPick, expectedShowCalls) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (quickPick.showCalls >= expectedShowCalls) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error(`quick pick was not shown ${expectedShowCalls} time(s)`);
}
