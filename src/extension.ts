import { readFile, writeFile } from "node:fs/promises";

import { createWorkspaceId, validatePersistedCommandRecords, type CommandVaultCommand, type CommandVaultScope } from "./command-vault/model.ts";
import {
  COMMAND_VAULT_CREATE_COMMAND_ID,
  createCommandVaultCreateService,
} from "./command-vault/create-command.ts";
import {
  COMMAND_VAULT_DELETE_COMMAND_ID,
  COMMAND_VAULT_EDIT_COMMAND_ID,
  createCommandVaultEditDeleteService,
} from "./command-vault/edit-delete-command.ts";
import {
  COMMAND_VAULT_COPY_COMMAND_ID,
  COMMAND_VAULT_RUN_COMMAND_ID,
  createCommandVaultExecutionService,
  resolveStoredCommandForAction,
} from "./command-vault/execution.ts";
import { createCommandVaultRepository } from "./command-vault/repository.ts";
import {
  COMMAND_VAULT_SEARCH_COMMAND_ID,
  COMMAND_VAULT_SEARCH_ALTERNATE_EXECUTION_COMMAND_ID,
  COMMAND_VAULT_SEARCH_EDIT_COMMAND_ID,
  COMMAND_VAULT_SEARCH_PASTE_COMMAND_ID,
  createCommandVaultSearchService,
} from "./command-vault/search-command.ts";
import {
  COMMAND_VAULT_CONFIGURATION_SECTION,
  isCommandVaultScopeEnabled,
  readCommandVaultSettings,
} from "./command-vault/settings.ts";
import { createCommandVaultSidebarProvider, type CommandVaultSidebarCreateCommandMessage, type CommandVaultSidebarUpdateCommandMessage } from "./command-vault/sidebar.ts";

export {
  COMMAND_VAULT_COPY_COMMAND_ID,
  COMMAND_VAULT_CREATE_COMMAND_ID,
  COMMAND_VAULT_DELETE_COMMAND_ID,
  COMMAND_VAULT_EDIT_COMMAND_ID,
  COMMAND_VAULT_RUN_COMMAND_ID,
  COMMAND_VAULT_SEARCH_COMMAND_ID,
};

export const COMMAND_VAULT_VIEW_CONTAINER_ID = "commandVault";
export const COMMAND_VAULT_VIEW_ID = "commandVault.commands";
export const COMMAND_VAULT_EXTENSION_NAME = "Command Vault";

export interface CommandVaultExtensionDisposable {
  dispose(): unknown;
}

export interface CommandVaultExtensionContext {
  globalStorageUri: {
    fsPath: string;
  };
  subscriptions: {
    push(...items: CommandVaultExtensionDisposable[]): number;
  };
}

export interface CommandVaultExtensionHost {
  commands: {
    executeCommand?<Args extends unknown[]>(
      command: string,
      ...args: Args
    ): unknown;
    registerCommand<Args extends unknown[]>(
      command: string,
      callback: (...args: Args) => unknown,
    ): CommandVaultExtensionDisposable;
  };
  env: {
    clipboard: {
      writeText(text: string): void | Promise<void>;
    };
  };
  window: {
    activeTerminal:
      | {
          sendText(text: string, addNewLine?: boolean): void;
          show(preserveFocus?: boolean): void;
        }
      | undefined;
    createTerminal(name: string): {
      sendText(text: string, addNewLine?: boolean): void;
      show(preserveFocus?: boolean): void;
    };
    registerWebviewViewProvider(
      viewId: string,
      provider: {
        resolveWebviewView(webviewView: {
          webview: {
            html: string;
            onDidReceiveMessage?(
              listener: (message: unknown) => void | Promise<void>,
            ): CommandVaultExtensionDisposable | void;
            options?: {
              enableScripts?: boolean;
            };
          };
        }): void | Promise<void>;
      },
    ): CommandVaultExtensionDisposable;
    createQuickPick?<Item extends { label: string }>() : {
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
      ): CommandVaultExtensionDisposable;
      onDidHide(
        listener: () => void | Promise<void>,
      ): CommandVaultExtensionDisposable;
      show(): void;
    };
    showInputBox(options: {
      placeHolder?: string;
      prompt?: string;
      title?: string;
      value?: string;
    }): Promise<string | undefined>;
    showQuickPick<Item extends { label: string }>(
      items: readonly Item[],
      options?: {
        placeHolder?: string;
        title?: string;
      },
    ): Promise<Item | undefined>;
    showOpenDialog?(options: {
      canSelectFiles?: boolean;
      canSelectFolders?: boolean;
      canSelectMany?: boolean;
      filters?: Record<string, string[]>;
      openLabel?: string;
      title?: string;
    }): Promise<Array<{ fsPath: string }> | undefined>;
    showSaveDialog?(options: {
      defaultUri?: { fsPath: string };
      filters?: Record<string, string[]>;
      saveLabel?: string;
      title?: string;
    }): Promise<{ fsPath: string } | undefined>;
    showInformationMessage?(message: string): void | Promise<void>;
    showWarningMessage(message: string): void | Promise<void>;
  };
  workspace: {
    getConfiguration?(section: string): {
      get<T>(section: string, defaultValue: T): T;
    };
    onDidChangeConfiguration?(
      listener: (event: {
        affectsConfiguration(section: string): boolean;
      }) => void | Promise<void>,
    ): CommandVaultExtensionDisposable;
    workspaceFolders:
      | ReadonlyArray<{
          uri: {
            fsPath: string;
          };
        }>
      | undefined;
  };
}

export function activate(
  context?: CommandVaultExtensionContext,
  host?: CommandVaultExtensionHost,
): void {
  if (!context) {
    return;
  }

  const resolvedHost = host ?? loadDefaultExtensionHost();
  const getSettings = () => readCommandVaultSettings(resolvedHost.workspace);
  const repository = createCommandVaultRepository(context.globalStorageUri, {
    onWarning(message) {
      return resolvedHost.window.showWarningMessage(message);
    },
  });
  const createCommand = createCommandVaultCreateService({
    getSettings,
    repository,
    window: resolvedHost.window,
    workspace: resolvedHost.workspace,
  });
  const editDeleteCommand = createCommandVaultEditDeleteService({
    getSettings,
    repository,
    window: resolvedHost.window,
    workspace: resolvedHost.workspace,
  });
  const execution = createCommandVaultExecutionService({
    clipboard: resolvedHost.env.clipboard,
    terminals: resolvedHost.window,
  });
  const search = createCommandVaultSearchService({
    commands: resolvedHost.commands,
    getSettings,
    repository,
    window: {
      createQuickPick() {
        const quickPickFactory = resolvedHost.window.createQuickPick;

        if (!quickPickFactory) {
          throw new Error("Command Vault search requires quick pick support.");
        }

        return quickPickFactory();
      },
      showWarningMessage: resolvedHost.window.showWarningMessage,
    },
    workspace: resolvedHost.workspace,
  });
  const sidebarProvider = createCommandVaultSidebarProvider({
    getSettings,
    onDidReceiveMessage: async (message) => {
      if (message.type === "commandVault.createCommand") {
        await handleInlineCreateCommand(message);
        return;
      }

      if (message.type === "commandVault.updateCommand") {
        await handleInlineUpdateCommand(message);
        return;
      }

      switch (message.action) {
        case "copy":
          await handleSidebarCopyCommand(message.target);
          return;
        case "create":
          await handleCreateCommand(message.target?.scope);
          return;
        case "delete":
          await handleSidebarDeleteCommand(message.target);
          return;
        case "edit":
          await handleSidebarEditCommand(message.target);
          return;
        case "export":
          await handleExportCommands();
          return;
        case "import":
          await handleImportCommands();
          return;
        case "paste":
          await handleSidebarPasteCommand(message.target);
          return;
        case "run":
          await handleSidebarRunCommand(message.target);
          return;
      }
    },
    repository,
    workspace: resolvedHost.workspace,
  });
  const refreshSidebar = async () => {
    await sidebarProvider.refresh();
  };
  const handleCreateCommand = async (requestedScope?: CommandVaultScope) => {
    const createdCommand = await createCommand.createCommand(requestedScope);

    if (createdCommand) {
      await refreshSidebar();
    }
  };
  const handleInlineCreateCommand = async (
    message: CommandVaultSidebarCreateCommandMessage,
  ) => {
    const scope = message.target.scope;

    if (scope !== "workspace" || !(await validateScopeEnabled(scope))) {
      return;
    }

    const timestamp = new Date().toISOString();
    const commandRecord: CommandVaultCommand = {
      id: `${scope}-${timestamp}`,
      scope,
      name: message.input.name,
      command: message.input.command,
      description:
        message.input.description.length > 0 ? message.input.description : null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const workspaceFolderPath = resolvedHost.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceFolderPath) {
      await resolvedHost.window.showWarningMessage(
        "Command Vault needs an open workspace to create workspace commands.",
      );
      return;
    }

    const workspaceId = createWorkspaceId(workspaceFolderPath);
    const commands = await repository.readWorkspaceCommands(workspaceId);
    await repository.writeWorkspaceCommands(workspaceId, [commandRecord, ...commands]);
    await refreshSidebar();
  };
  const handleExportCommands = async () => {
    const showSaveDialog = resolvedHost.window.showSaveDialog;

    if (!showSaveDialog) {
      await resolvedHost.window.showWarningMessage(
        "Command Vault export requires save dialog support.",
      );
      return;
    }

    const fileUri = await showSaveDialog({
      title: "Export Command Vault Commands",
      saveLabel: "Export",
      filters: { JSON: ["json"] },
    });

    if (!fileUri) {
      return;
    }

    const workspaceFolderPath = resolvedHost.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const workspaceId = workspaceFolderPath ? createWorkspaceId(workspaceFolderPath) : null;
    const [globalCommands, workspaceCommands] = await Promise.all([
      repository.readGlobalCommands(),
      repository.readWorkspaceCommands(workspaceId),
    ]);
    const exportPayload = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      commands: [...globalCommands, ...workspaceCommands],
    };

    await writeFile(fileUri.fsPath, `${JSON.stringify(exportPayload, null, 2)}\n`, {
      encoding: "utf8",
    });
    await resolvedHost.window.showInformationMessage?.(
      `Command Vault exported ${exportPayload.commands.length} command${exportPayload.commands.length === 1 ? "" : "s"}.`,
    );
  };
  const handleImportCommands = async () => {
    const showOpenDialog = resolvedHost.window.showOpenDialog;

    if (!showOpenDialog) {
      await resolvedHost.window.showWarningMessage(
        "Command Vault import requires open dialog support.",
      );
      return;
    }

    const fileUris = await showOpenDialog({
      title: "Import Command Vault Commands",
      openLabel: "Import",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { JSON: ["json"] },
    });
    const fileUri = fileUris?.[0];

    if (!fileUri) {
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(await readFile(fileUri.fsPath, { encoding: "utf8" })) as unknown;
    } catch (error) {
      await resolvedHost.window.showWarningMessage(
        `Command Vault could not import JSON. ${getErrorMessage(error)}`,
      );
      return;
    }

    const importedValue = isPlainObject(parsed) && "commands" in parsed ? parsed.commands : parsed;
    const validation = validatePersistedCommandRecords(importedValue, "import.commands");

    if (validation.issues.length > 0) {
      await resolvedHost.window.showWarningMessage(
        `Command Vault ignored ${validation.issues.length} invalid import issue${validation.issues.length === 1 ? "" : "s"}.`,
      );
    }

    if (validation.valid.length === 0) {
      await resolvedHost.window.showWarningMessage(
        "Command Vault did not find any valid commands to import.",
      );
      return;
    }

    const workspaceFolderPath = resolvedHost.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const workspaceId = workspaceFolderPath ? createWorkspaceId(workspaceFolderPath) : null;
    const globalImports = validation.valid.filter((command) => command.scope === "global");
    const workspaceImports = validation.valid.filter((command) => command.scope === "workspace");
    const importedCount = await mergeImportedCommands(globalImports, workspaceImports, workspaceId);

    await refreshSidebar();
    await resolvedHost.window.showInformationMessage?.(
      `Command Vault imported ${importedCount} command${importedCount === 1 ? "" : "s"}.`,
    );
  };
  const mergeImportedCommands = async (
    globalImports: readonly CommandVaultCommand[],
    workspaceImports: readonly CommandVaultCommand[],
    workspaceId: string | null,
  ): Promise<number> => {
    const globalCommands = await repository.readGlobalCommands();
    const mergedGlobalCommands = mergeCommands(globalImports, globalCommands);
    await repository.writeGlobalCommands(mergedGlobalCommands);

    let importedCount = mergedGlobalCommands.length - globalCommands.length;

    if (workspaceId) {
      const workspaceCommands = await repository.readWorkspaceCommands(workspaceId);
      const mergedWorkspaceCommands = mergeCommands(workspaceImports, workspaceCommands);
      await repository.writeWorkspaceCommands(workspaceId, mergedWorkspaceCommands);
      importedCount += mergedWorkspaceCommands.length - workspaceCommands.length;
    } else if (workspaceImports.length > 0) {
      await resolvedHost.window.showWarningMessage(
        "Command Vault skipped workspace commands because no workspace is open.",
      );
    }

    return importedCount;
  };
  const handleInlineUpdateCommand = async (
    message: CommandVaultSidebarUpdateCommandMessage,
  ) => {
    if (message.target.scope !== "workspace" || !(await validateScopeEnabled(message.target.scope))) {
      return;
    }

    const workspaceFolderPath = resolvedHost.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceFolderPath) {
      await resolvedHost.window.showWarningMessage(
        "Command Vault needs an open workspace to edit workspace commands.",
      );
      return;
    }

    const workspaceId = createWorkspaceId(workspaceFolderPath);
    const commands = await repository.readWorkspaceCommands(workspaceId);
    let updated = false;
    const updatedCommands = commands.map((command) => {
      if (command.id !== message.target.id) {
        return command;
      }

      updated = true;
      return {
        ...command,
        name: message.input.name,
        command: message.input.command,
        description:
          message.input.description.length > 0 ? message.input.description : null,
        updatedAt: new Date().toISOString(),
      };
    });

    if (!updated) {
      return;
    }

    await repository.writeWorkspaceCommands(workspaceId, updatedCommands);
    await refreshSidebar();
  };
  const resolveSidebarCommandTarget = (
    target:
      | {
          id?: string;
          scope: CommandVaultScope;
        }
      | undefined,
  ) => {
    if (!target?.id) {
      return undefined;
    }

    return {
      id: target.id,
      scope: target.scope,
    };
  };
  const handleSidebarEditCommand = async (target?: {
    id?: string;
    scope: CommandVaultScope;
  }) => {
    const commandTarget = resolveSidebarCommandTarget(target);

    if (!commandTarget) {
      return;
    }

    await handleEditCommand(commandTarget);
  };
  const handleSidebarDeleteCommand = async (target?: {
    id?: string;
    scope: CommandVaultScope;
  }) => {
    const commandTarget = resolveSidebarCommandTarget(target);

    if (!commandTarget) {
      return;
    }

    await handleDeleteCommand(commandTarget);
  };
  const handleSidebarRunCommand = async (target?: {
    id?: string;
    scope: CommandVaultScope;
  }) => {
    const commandTarget = resolveSidebarCommandTarget(target);

    if (!commandTarget) {
      return;
    }

    await handleRunCommand(commandTarget);
  };
  const handleSidebarPasteCommand = async (target?: {
    id?: string;
    scope: CommandVaultScope;
  }) => {
    const commandTarget = resolveSidebarCommandTarget(target);

    if (!commandTarget) {
      return;
    }

    await handlePasteCommand(commandTarget);
  };
  const handleSidebarCopyCommand = async (target?: {
    id?: string;
    scope: CommandVaultScope;
  }) => {
    const commandTarget = resolveSidebarCommandTarget(target);

    if (!commandTarget) {
      return;
    }

    await handleCopyCommand(commandTarget);
  };
  const handleEditCommand = async (target?: {
    id: string;
    scope: CommandVaultScope;
  }) => {
    const updatedCommand = await editDeleteCommand.editCommand(target);

    if (updatedCommand) {
      await refreshSidebar();
    }
  };
  const handleDeleteCommand = async (target?: {
    id: string;
    scope: CommandVaultScope;
  }) => {
    const deletedCommand = await editDeleteCommand.deleteCommand(target);

    if (deletedCommand) {
      await refreshSidebar();
    }
  };
  const handleRunCommand = async (target?: {
    id: string;
    scope: CommandVaultScope;
  }) => {
    if (!(await validateScopeEnabled(target?.scope))) {
      return;
    }

    const command = await resolveStoredCommandForAction("run", target, {
      repository,
      window: resolvedHost.window,
      workspace: resolvedHost.workspace,
    });

    if (!command) {
      return;
    }

    await execution.runCommand(command);
  };
  const handlePasteCommand = async (target?: {
    id: string;
    scope: CommandVaultScope;
  }) => {
    if (!(await validateScopeEnabled(target?.scope))) {
      return;
    }

    const command = await resolveStoredCommandForAction("paste", target, {
      repository,
      window: resolvedHost.window,
      workspace: resolvedHost.workspace,
    });

    if (!command) {
      return;
    }

    await execution.pasteCommand(command);
  };
  const handleCopyCommand = async (target?: {
    id: string;
    scope: CommandVaultScope;
  }) => {
    if (!(await validateScopeEnabled(target?.scope))) {
      return;
    }

    const command = await resolveStoredCommandForAction("copy", target, {
      repository,
      window: resolvedHost.window,
      workspace: resolvedHost.workspace,
    });

    if (!command) {
      return;
    }

    await execution.copyCommand(command);
  };
  const validateScopeEnabled = async (
    scope: CommandVaultScope | undefined,
  ): Promise<boolean> => {
    if (!scope || isCommandVaultScopeEnabled(scope, getSettings())) {
      return true;
    }

    await resolvedHost.window.showWarningMessage(
      `Command Vault ${scope} commands are disabled in settings.`,
    );
    return false;
  };
  const dispatchSearchSelection = async (selection: {
    action: "edit" | "paste" | "run";
    command: {
      command: string;
      id: string;
      scope: CommandVaultScope;
    };
  }) => {
    switch (selection.action) {
      case "edit":
        await handleEditCommand({
          id: selection.command.id,
          scope: selection.command.scope,
        });
        return;
      case "paste":
        if (!(await validateScopeEnabled(selection.command.scope))) {
          return;
        }

        await execution.pasteCommand(selection.command);
        return;
      case "run":
        if (!(await validateScopeEnabled(selection.command.scope))) {
          return;
        }

        await execution.runCommand(selection.command);
        return;
    }
  };
  const handleSearchCommand = async () => {
    const selection = await search.searchCommands();

    if (!selection) {
      return;
    }

    await dispatchSearchSelection(selection);
  };
  const createCommandDisposable = resolvedHost.commands.registerCommand(
    COMMAND_VAULT_CREATE_COMMAND_ID,
    handleCreateCommand,
  );
  const editCommandDisposable = resolvedHost.commands.registerCommand(
    COMMAND_VAULT_EDIT_COMMAND_ID,
    handleEditCommand,
  );
  const deleteCommandDisposable = resolvedHost.commands.registerCommand(
    COMMAND_VAULT_DELETE_COMMAND_ID,
    handleDeleteCommand,
  );
  const runCommandDisposable = resolvedHost.commands.registerCommand(
    COMMAND_VAULT_RUN_COMMAND_ID,
    handleRunCommand,
  );
  const copyCommandDisposable = resolvedHost.commands.registerCommand(
    COMMAND_VAULT_COPY_COMMAND_ID,
    handleCopyCommand,
  );
  const searchCommandDisposable = resolvedHost.commands.registerCommand(
    COMMAND_VAULT_SEARCH_COMMAND_ID,
    handleSearchCommand,
  );
  const searchPasteCommandDisposable = resolvedHost.commands.registerCommand(
    COMMAND_VAULT_SEARCH_PASTE_COMMAND_ID,
    async () => {
      await search.triggerActiveAction("paste");
    },
  );
  const searchAlternateExecutionDisposable =
    resolvedHost.commands.registerCommand(
      COMMAND_VAULT_SEARCH_ALTERNATE_EXECUTION_COMMAND_ID,
      async () => {
        await search.triggerAlternateAction();
      },
    );
  const searchEditCommandDisposable = resolvedHost.commands.registerCommand(
    COMMAND_VAULT_SEARCH_EDIT_COMMAND_ID,
    async () => {
      await search.triggerActiveAction("edit");
    },
  );
  const sidebarDisposable = resolvedHost.window.registerWebviewViewProvider(
    COMMAND_VAULT_VIEW_ID,
    sidebarProvider,
  );
  const configurationChangeDisposable =
    resolvedHost.workspace.onDidChangeConfiguration?.(async (event) => {
      if (!event.affectsConfiguration(COMMAND_VAULT_CONFIGURATION_SECTION)) {
        return;
      }

      await refreshSidebar();
    });

  context.subscriptions.push(
    createCommandDisposable,
    editCommandDisposable,
    deleteCommandDisposable,
    runCommandDisposable,
    copyCommandDisposable,
    searchCommandDisposable,
    searchPasteCommandDisposable,
    searchAlternateExecutionDisposable,
    searchEditCommandDisposable,
    sidebarDisposable,
    ...(configurationChangeDisposable ? [configurationChangeDisposable] : []),
  );
}

export function deactivate(): void {
  // VS Code calls this during extension shutdown.
}

function loadDefaultExtensionHost(): CommandVaultExtensionHost {
  const vscode = require("vscode") as CommandVaultExtensionHost;
  return vscode;
}

function mergeCommands(
  importedCommands: readonly CommandVaultCommand[],
  existingCommands: readonly CommandVaultCommand[],
): CommandVaultCommand[] {
  const existingIds = new Set(existingCommands.map((command) => command.id));
  const uniqueImportedCommands = importedCommands.filter(
    (command) => !existingIds.has(command.id),
  );

  return [...uniqueImportedCommands, ...existingCommands];
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown error.";
}
