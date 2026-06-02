const assert = require("node:assert/strict");
const test = require("node:test");

const {
  activate,
  COMMAND_VAULT_CREATE_COMMAND_ID,
  COMMAND_VAULT_DELETE_COMMAND_ID,
  COMMAND_VAULT_EDIT_COMMAND_ID,
  COMMAND_VAULT_EXTENSION_NAME,
  COMMAND_VAULT_VIEW_ID,
  deactivate,
} = require("../out/extension.js");

test("compiled extension exports the scaffold identifiers", () => {
  assert.equal(COMMAND_VAULT_EXTENSION_NAME, "Command Vault");
  assert.equal(COMMAND_VAULT_VIEW_ID, "commandVault.commands");
  assert.equal(COMMAND_VAULT_CREATE_COMMAND_ID, "commandVault.createCommand");
  assert.equal(COMMAND_VAULT_EDIT_COMMAND_ID, "commandVault.editCommand");
  assert.equal(COMMAND_VAULT_DELETE_COMMAND_ID, "commandVault.deleteCommand");
});

test("compiled activation hooks are callable", () => {
  assert.doesNotThrow(() => activate());
  assert.doesNotThrow(() => deactivate());
});

test("compiled activation registers the create, edit, and delete commands", () => {
  const subscriptions = [];
  const registrations = [];

  activate(
    {
      globalStorageUri: {
        fsPath: "/tmp/command-vault-storage",
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
            dispose() {
              registrations.push("disposed");
            },
          };
        },
      },
      window: {
        async showInputBox() {
          return undefined;
        },
        async showQuickPick(items) {
          return items[0];
        },
        showWarningMessage() {
          return undefined;
        },
      },
      workspace: {
        workspaceFolders: undefined,
      },
    },
  );

  assert.deepEqual(registrations, [
    COMMAND_VAULT_CREATE_COMMAND_ID,
    COMMAND_VAULT_EDIT_COMMAND_ID,
    COMMAND_VAULT_DELETE_COMMAND_ID,
  ]);
  assert.equal(subscriptions.length, 3);
});
