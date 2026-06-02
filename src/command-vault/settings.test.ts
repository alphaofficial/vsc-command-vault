import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMMAND_VAULT_CONFIGURATION_SECTION,
  readCommandVaultSettings,
} from "./settings.ts";

describe("command vault settings", () => {
  it("uses the MVP defaults when the workspace configuration is unavailable", () => {
    assert.deepEqual(readCommandVaultSettings(), {
      defaultExecutionBehavior: "run",
      enableGlobalScope: true,
      enableWorkspaceScope: true,
    });
  });

  it("reads supported settings from the commandVault configuration section", () => {
    const requestedSections: string[] = [];
    const settings = readCommandVaultSettings({
      getConfiguration(section) {
        requestedSections.push(section);
        return {
          get(key, defaultValue) {
            switch (key) {
              case "defaultExecutionBehavior":
                return "paste";
              case "enableGlobalScope":
                return false;
              case "enableWorkspaceScope":
                return true;
              default:
                return defaultValue;
            }
          },
        };
      },
    });

    assert.deepEqual(requestedSections, [COMMAND_VAULT_CONFIGURATION_SECTION]);
    assert.deepEqual(settings, {
      defaultExecutionBehavior: "paste",
      enableGlobalScope: false,
      enableWorkspaceScope: true,
    });
  });

  it("falls back to defaults when setting values are invalid", () => {
    const settings = readCommandVaultSettings({
      getConfiguration() {
        return {
          get(key, defaultValue) {
            switch (key) {
              case "defaultExecutionBehavior":
                return "launch";
              case "enableGlobalScope":
                return "nope";
              case "enableWorkspaceScope":
                return 0;
              default:
                return defaultValue;
            }
          },
        };
      },
    });

    assert.deepEqual(settings, {
      defaultExecutionBehavior: "run",
      enableGlobalScope: true,
      enableWorkspaceScope: true,
    });
  });
});
