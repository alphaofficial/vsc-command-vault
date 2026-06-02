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
import { createCommandVaultSidebarProvider } from "./command-vault/sidebar.ts";

export {
  COMMAND_VAULT_COPY_COMMAND_ID,
  COMMAND_VAULT_CREATE_COMMAND_ID,
  COMMAND_VAULT_DELETE_COMMAND_ID,
  COMMAND_VAULT_EDIT_COMMAND_ID,
  COMMAND_VAULT_RUN_COMMAND_ID,
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
  const handleCreateCommand = async (requestedScope?: CommandVaultScope) => {
    await createCommand.createCommand(requestedScope);
  };
  const handleEditCommand = async (target?: {
    id: string;
    scope: CommandVaultScope;
  }) => {
    await editDeleteCommand.editCommand(target);
  };
  const handleDeleteCommand = async (target?: {
    id: string;
    scope: CommandVaultScope;
  }) => {
    await editDeleteCommand.deleteCommand(target);
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
