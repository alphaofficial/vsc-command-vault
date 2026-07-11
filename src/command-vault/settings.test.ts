import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  COMMAND_VAULT_CONFIGURATION_SECTION,
  readCommandVaultSettings,
} from "./settings.ts";

describe("command vault settings", () => {
  it("uses the MVP defaults when the workspace configuration is unavailable", () => {
    assert.deepEqual(readCommandVaultSettings(), {
      defaultExecutionBehavior: "run",
      terminalExecutionMode: "current",
    });
  });

  it("reads supported settings from the commandVault configuration section", () => {
    const requestedSections: string[] = [];
    const settings = readCommandVaultSettings({
      getConfiguration(section) {
        requestedSections.push(section);
        return {
          get<T>(key: string, defaultValue: T): T {
            switch (key) {
              case "defaultExecutionBehavior":
                return "paste" as T;
              case "terminalExecutionMode":
                return "dedicated" as T;
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
      terminalExecutionMode: "dedicated",
    });
  });

  it("falls back to defaults when setting values are invalid", () => {
    const settings = readCommandVaultSettings({
      getConfiguration() {
        return {
          get<T>(key: string, defaultValue: T): T {
            switch (key) {
              case "defaultExecutionBehavior":
                return "launch" as T;
              case "terminalExecutionMode":
                return "spawn" as T;
              default:
                return defaultValue;
            }
          },
        };
      },
    });

    assert.deepEqual(settings, {
      defaultExecutionBehavior: "run",
      terminalExecutionMode: "current",
    });
  });
});
