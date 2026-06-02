import type { CommandVaultCommand } from "./model.ts";
import { createWorkspaceId } from "./model.ts";
import type { CommandVaultRepository } from "./repository.ts";
import {
  DEFAULT_COMMAND_VAULT_SETTINGS,
  isCommandVaultScopeEnabled,
  type CommandVaultSettings,
} from "./settings.ts";

export const COMMAND_VAULT_SEARCH_COMMAND_ID = "commandVault.searchCommands";
export const COMMAND_VAULT_SEARCH_ALTERNATE_EXECUTION_COMMAND_ID =
  "commandVault.searchCommands.alternateExecution";
export const COMMAND_VAULT_SEARCH_EDIT_COMMAND_ID =
  "commandVault.searchCommands.edit";
export const COMMAND_VAULT_SEARCH_PASTE_COMMAND_ID =
  "commandVault.searchCommands.paste";

const COMMAND_VAULT_SEARCH_CONTEXT_KEY = "commandVault.searchCommandsVisible";

export type CommandVaultSearchAction = "edit" | "paste" | "run";

export interface CommandVaultSearchSelection {
  action: CommandVaultSearchAction;
  command: CommandVaultCommand;
}

export interface CommandVaultSearchDisposable {
  dispose(): unknown;
}

export interface CommandVaultSearchQuickPickItem {
  command: CommandVaultCommand;
  description?: string;
  detail?: string;
  label: string;
}

export interface CommandVaultSearchQuickPick<
  Item extends CommandVaultSearchQuickPickItem,
> {
  activeItems: readonly Item[];
  items: readonly Item[];
  matchOnDescription: boolean;
  matchOnDetail: boolean;
  placeholder: string;
  title: string;
  dispose(): void;
  hide(): void;
  onDidAccept(
    listener: () => void | Promise<void>,
  ): CommandVaultSearchDisposable;
  onDidHide(
    listener: () => void | Promise<void>,
  ): CommandVaultSearchDisposable;
  show(): void;
}

export interface CommandVaultSearchWindow {
  createQuickPick<Item extends CommandVaultSearchQuickPickItem>(): CommandVaultSearchQuickPick<Item>;
  showWarningMessage(message: string): void | Promise<void>;
}

export interface CommandVaultSearchCommands {
  executeCommand?(command: string, ...args: unknown[]): void | Promise<void>;
}

export interface CommandVaultSearchWorkspaceFolder {
  uri: {
    fsPath: string;
  };
}

export interface CommandVaultSearchWorkspace {
  workspaceFolders:
    | readonly CommandVaultSearchWorkspaceFolder[]
    | undefined;
}

export interface CreateCommandVaultSearchServiceOptions {
  commands?: CommandVaultSearchCommands;
  getSettings?: () => CommandVaultSettings;
  repository: CommandVaultRepository;
  window: CommandVaultSearchWindow;
  workspace: CommandVaultSearchWorkspace;
}

export interface CommandVaultSearchService {
  searchCommands(): Promise<CommandVaultSearchSelection | undefined>;
  triggerAlternateAction(): Promise<boolean>;
  triggerActiveAction(
    action: Exclude<CommandVaultSearchAction, "run">,
  ): Promise<boolean>;
}

interface ActiveSearchSession {
  cancel(): Promise<boolean>;
  selectAlternate(): Promise<boolean>;
  select(
    action: CommandVaultSearchAction,
  ): Promise<boolean>;
}

export function createCommandVaultSearchService(
  options: CreateCommandVaultSearchServiceOptions,
): CommandVaultSearchService {
  let activeSession: ActiveSearchSession | undefined;

  return {
    async searchCommands() {
      if (activeSession) {
        await activeSession.cancel();
      }

      const settings = options.getSettings?.() ?? DEFAULT_COMMAND_VAULT_SETTINGS;
      const commands = await readSearchableCommands(
        options.repository,
        settings,
        options.workspace.workspaceFolders,
      );

      if (commands.length === 0) {
        const warningMessage =
          !settings.enableGlobalScope && !settings.enableWorkspaceScope
            ? "Command Vault search is unavailable because all scopes are disabled in settings."
            : "Command Vault has no commands to search.";
        await options.window.showWarningMessage(warningMessage);
        return undefined;
      }

      const quickPick =
        options.window.createQuickPick<CommandVaultSearchQuickPickItem>();
      const items = commands.map(createSearchItem);
      const defaultExecutionAction = settings.defaultExecutionBehavior;
      const alternateExecutionAction =
        defaultExecutionAction === "run" ? "paste" : "run";
      let settled = false;

      quickPick.items = items;
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;
      quickPick.title = "Search Commands";
      quickPick.placeholder = createQuickPickPlaceholder(
        defaultExecutionAction,
        alternateExecutionAction,
      );

      const selectionPromise = new Promise<
        CommandVaultSearchSelection | undefined
      >(
        (resolve) => {
          const settle = async (
            result: CommandVaultSearchSelection | undefined,
            shouldHide: boolean,
          ) => {
            if (settled) {
              return false;
            }

            settled = true;
            activeSession = undefined;

            if (shouldHide) {
              quickPick.hide();
            }

            await setSearchContext(options.commands, false);
            acceptDisposable.dispose();
            hideDisposable.dispose();
            quickPick.dispose();
            resolve(result);
            return true;
          };

          const acceptDisposable = quickPick.onDidAccept(() =>
            settle(
              resolveSelection(defaultExecutionAction, quickPick, items),
              true,
            ),
          );
          const hideDisposable = quickPick.onDidHide(() =>
            settle(undefined, false),
          );

          activeSession = {
            async cancel() {
              return settle(undefined, true);
            },
            async selectAlternate() {
              return settle(
                resolveSelection(alternateExecutionAction, quickPick, items),
                true,
              );
            },
            async select(action) {
              return settle(resolveSelection(action, quickPick, items), true);
            },
          };
        },
      );

      await setSearchContext(options.commands, true);
      quickPick.show();
      return selectionPromise;
    },

    async triggerActiveAction(action) {
      if (!activeSession) {
        return false;
      }

      return activeSession.select(action);
    },

    async triggerAlternateAction() {
      if (!activeSession) {
        return false;
      }

      return activeSession.selectAlternate();
    },
  };
}

async function readSearchableCommands(
  repository: CommandVaultRepository,
  settings: CommandVaultSettings,
  workspaceFolders: readonly CommandVaultSearchWorkspaceFolder[] | undefined,
): Promise<CommandVaultCommand[]> {
  const workspaceFolderPath = workspaceFolders?.[0]?.uri.fsPath;
  const workspaceCommands =
    settings.enableWorkspaceScope && workspaceFolderPath
      ? await repository.readWorkspaceCommands(createWorkspaceId(workspaceFolderPath))
      : [];
  const globalCommands = isCommandVaultScopeEnabled("global", settings)
    ? await repository.readGlobalCommands()
    : [];

  return [...workspaceCommands, ...globalCommands];
}

function createQuickPickPlaceholder(
  defaultExecutionAction: Exclude<CommandVaultSearchAction, "edit">,
  alternateExecutionAction: Exclude<CommandVaultSearchAction, "edit">,
): string {
  return [
    "Search workspace and global commands.",
    `Enter ${formatExecutionVerb(defaultExecutionAction)},`,
    `Alt/Option+Enter ${formatExecutionVerb(alternateExecutionAction)},`,
    "Cmd/Ctrl+Enter edits.",
  ].join(" ");
}

function createSearchItem(
  command: CommandVaultCommand,
): CommandVaultSearchQuickPickItem {
  return {
    label: command.name,
    description: command.description
      ? `${command.description} · ${command.scope}`
      : command.scope,
    detail: command.command,
    command,
  };
}

function resolveSelection(
  action: CommandVaultSearchAction,
  quickPick: CommandVaultSearchQuickPick<CommandVaultSearchQuickPickItem>,
  items: readonly CommandVaultSearchQuickPickItem[],
): CommandVaultSearchSelection | undefined {
  const selectedItem = quickPick.activeItems[0] ?? items[0];

  if (!selectedItem) {
    return undefined;
  }

  return {
    action,
    command: selectedItem.command,
  };
}

function formatExecutionVerb(
  action: Exclude<CommandVaultSearchAction, "edit">,
): string {
  return action === "run" ? "runs" : "pastes";
}

async function setSearchContext(
  commands: CommandVaultSearchCommands | undefined,
  visible: boolean,
): Promise<void> {
  try {
    await commands?.executeCommand?.(
      "setContext",
      COMMAND_VAULT_SEARCH_CONTEXT_KEY,
      visible,
    );
  } catch {
    // Search still works even if context updates are unavailable.
  }
}
