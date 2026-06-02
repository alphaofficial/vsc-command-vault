import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activate,
  COMMAND_VAULT_EXTENSION_NAME,
  COMMAND_VAULT_VIEW_ID,
  deactivate,
} from "./extension.ts";

describe("extension scaffold", () => {
  it("exports stable baseline identifiers", () => {
    assert.equal(COMMAND_VAULT_EXTENSION_NAME, "Command Vault");
    assert.equal(COMMAND_VAULT_VIEW_ID, "commandVault.commands");
  });

  it("keeps activation hooks callable", () => {
    assert.doesNotThrow(() => activate());
    assert.doesNotThrow(() => deactivate());
  });
});
