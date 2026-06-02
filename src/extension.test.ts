import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activate,
  COMMAND_VAULT_CREATE_COMMAND_ID,
  COMMAND_VAULT_EXTENSION_NAME,
  COMMAND_VAULT_VIEW_ID,
  deactivate,
} from "./extension.ts";

describe("extension scaffold", () => {
  it("exports stable baseline identifiers", () => {
    assert.equal(COMMAND_VAULT_EXTENSION_NAME, "Command Vault");
    assert.equal(COMMAND_VAULT_VIEW_ID, "commandVault.commands");
    assert.equal(COMMAND_VAULT_CREATE_COMMAND_ID, "commandVault.createCommand");
  });

  it("keeps activation hooks callable", () => {
    assert.doesNotThrow(() => activate());
    assert.doesNotThrow(() => deactivate());
  });

  it("registers the create command when activated with a host and context", () => {
    const subscriptions: Array<{ dispose(): void }> = [];
    const registrations: string[] = [];

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

    assert.deepEqual(registrations, [COMMAND_VAULT_CREATE_COMMAND_ID]);
    assert.equal(subscriptions.length, 1);
  });
});
