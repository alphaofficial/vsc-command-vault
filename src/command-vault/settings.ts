export const COMMAND_VAULT_CONFIGURATION_SECTION = "commandVault";
export const COMMAND_VAULT_DEFAULT_EXECUTION_BEHAVIOR_SETTING =
  "defaultExecutionBehavior";

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
}

export const DEFAULT_COMMAND_VAULT_SETTINGS: CommandVaultSettings = {
  defaultExecutionBehavior: "run",
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
  };
}

function normalizeDefaultExecutionBehavior(
  value: unknown,
): CommandVaultDefaultExecutionBehavior {
  return value === "paste" ? "paste" : "run";
}
