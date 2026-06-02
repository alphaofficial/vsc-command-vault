import type { CommandVaultScope } from "./command-vault/model.ts";
import {
  COMMAND_VAULT_CREATE_COMMAND_ID,
  createCommandVaultCreateService,
} from "./command-vault/create-command.ts";
import { createCommandVaultRepository } from "./command-vault/repository.ts";

export { COMMAND_VAULT_CREATE_COMMAND_ID };

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
  window: {
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
  const createCommandDisposable = resolvedHost.commands.registerCommand(
    COMMAND_VAULT_CREATE_COMMAND_ID,
    async (requestedScope?: CommandVaultScope) => {
      await createCommand.createCommand(requestedScope);
    },
  );

  context.subscriptions.push(createCommandDisposable);
}

export function deactivate(): void {
  // VS Code calls this during extension shutdown.
}

function loadDefaultExtensionHost(): CommandVaultExtensionHost {
  const vscode = require("vscode") as CommandVaultExtensionHost;
  return vscode;
}
