import type { CommandVaultScope } from "./model.ts";

export const COMMAND_VAULT_CONFIGURATION_SECTION = "commandVault";
export const COMMAND_VAULT_DEFAULT_EXECUTION_BEHAVIOR_SETTING =
  "defaultExecutionBehavior";
export const COMMAND_VAULT_ENABLE_GLOBAL_SCOPE_SETTING = "enableGlobalScope";
export const COMMAND_VAULT_ENABLE_WORKSPACE_SCOPE_SETTING =
  "enableWorkspaceScope";

export type CommandVaultDefaultExecutionBehavior = "paste" | "run";

export interface CommandVaultConfiguration {
  get<T>(section: string, defaultValue: T): T;
}

export interface CommandVaultConfigurationHost {
  getConfiguration?(
    section: string,
  ): CommandVaultConfiguration;
}

export interface CommandVaultSettings {
  defaultExecutionBehavior: CommandVaultDefaultExecutionBehavior;
  enableGlobalScope: boolean;
  enableWorkspaceScope: boolean;
}

export const DEFAULT_COMMAND_VAULT_SETTINGS: CommandVaultSettings = {
  defaultExecutionBehavior: "run",
  enableGlobalScope: true,
  enableWorkspaceScope: true,
};

export function readCommandVaultSettings(
  workspace?: CommandVaultConfigurationHost,
): CommandVaultSettings {
  const configuration = workspace?.getConfiguration?.(
    COMMAND_VAULT_CONFIGURATION_SECTION,
  );

  return {
    defaultExecutionBehavior: normalizeDefaultExecutionBehavior(
      configuration?.get(
        COMMAND_VAULT_DEFAULT_EXECUTION_BEHAVIOR_SETTING,
        DEFAULT_COMMAND_VAULT_SETTINGS.defaultExecutionBehavior,
      ),
    ),
    enableGlobalScope: readBooleanSetting(
      configuration,
      COMMAND_VAULT_ENABLE_GLOBAL_SCOPE_SETTING,
      DEFAULT_COMMAND_VAULT_SETTINGS.enableGlobalScope,
    ),
    enableWorkspaceScope: readBooleanSetting(
      configuration,
      COMMAND_VAULT_ENABLE_WORKSPACE_SCOPE_SETTING,
      DEFAULT_COMMAND_VAULT_SETTINGS.enableWorkspaceScope,
    ),
  };
}

export function isCommandVaultScopeEnabled(
  scope: CommandVaultScope,
  settings: CommandVaultSettings,
): boolean {
  return scope === "global"
    ? settings.enableGlobalScope
    : settings.enableWorkspaceScope;
}

function normalizeDefaultExecutionBehavior(
  value: unknown,
): CommandVaultDefaultExecutionBehavior {
  return value === "paste" ? "paste" : "run";
}

function readBooleanSetting(
  configuration: CommandVaultConfiguration | undefined,
  setting: string,
  defaultValue: boolean,
): boolean {
  const value = configuration?.get(setting, defaultValue);
  return typeof value === "boolean" ? value : defaultValue;
}
