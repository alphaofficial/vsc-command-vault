export const COMMAND_VAULT_CONFIGURATION_SECTION = "commandVault";
export const COMMAND_VAULT_DEFAULT_EXECUTION_BEHAVIOR_SETTING =
  "defaultExecutionBehavior";
export const COMMAND_VAULT_TERMINAL_EXECUTION_MODE_SETTING =
  "terminalExecutionMode";

export type CommandVaultDefaultExecutionBehavior = "paste" | "run";
export type CommandVaultTerminalExecutionMode = "current" | "dedicated";

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
  terminalExecutionMode: CommandVaultTerminalExecutionMode;
}

export const DEFAULT_COMMAND_VAULT_SETTINGS: CommandVaultSettings = {
  defaultExecutionBehavior: "run",
  terminalExecutionMode: "current",
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
    terminalExecutionMode: normalizeTerminalExecutionMode(
      configuration?.get(
        COMMAND_VAULT_TERMINAL_EXECUTION_MODE_SETTING,
        DEFAULT_COMMAND_VAULT_SETTINGS.terminalExecutionMode,
      ),
    ),
  };
}

function normalizeDefaultExecutionBehavior(
  value: unknown,
): CommandVaultDefaultExecutionBehavior {
  return value === "paste" ? "paste" : "run";
}

function normalizeTerminalExecutionMode(
  value: unknown,
): CommandVaultTerminalExecutionMode {
  return value === "dedicated" ? "dedicated" : "current";
}
