import { describe, expect, it } from "vitest";

import {
  activate,
  COMMAND_VAULT_EXTENSION_NAME,
  COMMAND_VAULT_VIEW_ID,
  deactivate,
} from "./extension";

describe("extension scaffold", () => {
  it("exports stable baseline identifiers", () => {
    expect(COMMAND_VAULT_EXTENSION_NAME).toBe("Command Vault");
    expect(COMMAND_VAULT_VIEW_ID).toBe("commandVault.commands");
  });

  it("keeps activation hooks callable", () => {
    expect(() => activate()).not.toThrow();
    expect(() => deactivate()).not.toThrow();
  });
});
