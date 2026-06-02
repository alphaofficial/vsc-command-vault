import type { CommandVaultScope } from "./command-vault/model.ts";
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
  COMMAND_VAULT_SEARCH_EDIT_COMMAND_ID,
  COMMAND_VAULT_SEARCH_PASTE_COMMAND_ID,
  createCommandVaultSearchService,
} from "./command-vault/search-command.ts";
import { createCommandVaultSidebarProvider } from "./command-vault/sidebar.ts";

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
    executeCommand?(
      command: string,
      ...args: unknown[]
    ): unknown;
    registerCommand(
      command: string,
      callback: (...args: unknown[]) => unknown,
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
    showWarningMessage(message: string): void | Promise<void>;
  };
  workspace: {
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
  const repository = createCommandVaultRepository(context.globalStorageUri, {
    onWarning(message) {
      return resolvedHost.window.showWarningMessage(message);
    },
  });
  const createCommand = createCommandVaultCreateService({
    repository,
    window: resolvedHost.window,
    workspace: resolvedHost.workspace,
  });
  const editDeleteCommand = createCommandVaultEditDeleteService({
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
    onDidReceiveMessage: async (message) => {
      switch (message.action) {
        case "copy":
          await handleCopyCommand(message.target);
          return;
        case "delete":
          await handleDeleteCommand(message.target);
          return;
        case "edit":
          await handleEditCommand(message.target);
          return;
        case "run":
          await handleRunCommand(message.target);
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
  const handleCopyCommand = async (target?: {
    id: string;
    scope: CommandVaultScope;
  }) => {
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
        await execution.pasteCommand(selection.command);
        return;
      case "run":
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

  context.subscriptions.push(
    createCommandDisposable,
    editCommandDisposable,
    deleteCommandDisposable,
    runCommandDisposable,
    copyCommandDisposable,
    searchCommandDisposable,
    searchPasteCommandDisposable,
    searchEditCommandDisposable,
    sidebarDisposable,
  );
}

export function deactivate(): void {
  // VS Code calls this during extension shutdown.
}

function loadDefaultExtensionHost(): CommandVaultExtensionHost {
  const vscode = require("vscode") as CommandVaultExtensionHost;
  return vscode;
}
