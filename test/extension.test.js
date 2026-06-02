const assert = require("node:assert/strict");
const test = require("node:test");

const {
  activate,
  COMMAND_VAULT_EXTENSION_NAME,
  COMMAND_VAULT_VIEW_ID,
  deactivate,
} = require("../out/extension.js");

test("compiled extension exports the scaffold identifiers", () => {
  assert.equal(COMMAND_VAULT_EXTENSION_NAME, "Command Vault");
  assert.equal(COMMAND_VAULT_VIEW_ID, "commandVault.commands");
});

test("compiled activation hooks are callable", () => {
  assert.doesNotThrow(() => activate());
  assert.doesNotThrow(() => deactivate());
});
