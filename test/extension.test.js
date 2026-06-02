const assert = require("node:assert/strict");
const { mkdtemp, mkdir, writeFile } = require("node:fs/promises");
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
  assert.equal(subscriptions.length, 6);
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
