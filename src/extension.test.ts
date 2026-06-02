import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import {
  activate,
  COMMAND_VAULT_COPY_COMMAND_ID,
  COMMAND_VAULT_CREATE_COMMAND_ID,
  COMMAND_VAULT_DELETE_COMMAND_ID,
  COMMAND_VAULT_EDIT_COMMAND_ID,
  COMMAND_VAULT_EXTENSION_NAME,
  COMMAND_VAULT_RUN_COMMAND_ID,
  COMMAND_VAULT_SEARCH_COMMAND_ID,
  COMMAND_VAULT_VIEW_CONTAINER_ID,
  COMMAND_VAULT_VIEW_ID,
  deactivate,
} from "./extension.ts";

describe("extension scaffold", () => {
  it("exports stable baseline identifiers", () => {
    assert.equal(COMMAND_VAULT_EXTENSION_NAME, "Command Vault");
    assert.equal(COMMAND_VAULT_VIEW_CONTAINER_ID, "commandVault");
    assert.equal(COMMAND_VAULT_VIEW_ID, "commandVault.commands");
    assert.equal(COMMAND_VAULT_COPY_COMMAND_ID, "commandVault.copyCommand");
    assert.equal(COMMAND_VAULT_CREATE_COMMAND_ID, "commandVault.createCommand");
    assert.equal(COMMAND_VAULT_EDIT_COMMAND_ID, "commandVault.editCommand");
    assert.equal(
      COMMAND_VAULT_DELETE_COMMAND_ID,
      "commandVault.deleteCommand",
    );
    assert.equal(COMMAND_VAULT_RUN_COMMAND_ID, "commandVault.runCommand");
    assert.equal(
      COMMAND_VAULT_SEARCH_COMMAND_ID,
      "commandVault.searchCommands",
    );
  });

  it("keeps activation hooks callable", () => {
    assert.doesNotThrow(() => activate());
    assert.doesNotThrow(() => deactivate());
  });

  it("registers the sidebar provider and routes sidebar actions to execution handlers", async () => {
    const storagePath = await mkdtemp(join(tmpdir(), "command-vault-extension-"));
    const subscriptions: Array<{ dispose(): void }> = [];
    const registrations: string[] = [];
    const commandCallbacks = new Map<string, (...args: unknown[]) => unknown>();
    const clipboardWrites: string[] = [];
    const sendTextCalls: Array<{ addNewLine: boolean | undefined; text: string }> =
      [];
    const showCalls: Array<boolean | undefined> = [];
    const warningMessages: string[] = [];
    const inputBoxValues = ["Build", "npm run build", "Compile the project"];
    let registeredProvider:
      | {
          resolveWebviewView(webviewView: {
            webview: {
              html: string;
              onDidReceiveMessage?(
                listener: (message: unknown) => void | Promise<void>,
              ): void;
              options?: {
                enableScripts?: boolean;
              };
            };
          }): void | Promise<void>;
        }
      | undefined;
    let receiveMessage:
      | ((message: unknown) => void | Promise<void>)
      | undefined;

    await mkdir(join(storagePath, "workspaces"), { recursive: true });
    await writeFile(
      join(storagePath, "global.json"),
      `${JSON.stringify([createStoredCommand()], null, 2)}\n`,
      { encoding: "utf8" },
    );

    activate(
      {
        globalStorageUri: {
          fsPath: storagePath,
        },
        subscriptions: {
          push(...items) {
            subscriptions.push(...items);
            return subscriptions.length;
          },
        },
      },
      {
        commands: {
          registerCommand(command, callback) {
            registrations.push(command);
            commandCallbacks.set(command, callback);
            return {
              dispose() {
                registrations.push("disposed");
              },
            };
          },
        },
        env: {
          clipboard: {
            async writeText(text) {
              clipboardWrites.push(text);
            },
          },
        },
        window: {
          activeTerminal: {
            sendText(text, addNewLine) {
              sendTextCalls.push({ text, addNewLine });
            },
            show(preserveFocus) {
              showCalls.push(preserveFocus);
            },
          },
          createTerminal() {
            throw new Error("active terminal should be reused");
          },
          registerWebviewViewProvider(viewId, provider) {
            assert.equal(viewId, COMMAND_VAULT_VIEW_ID);
            registeredProvider = provider;
            return {
              dispose() {},
            };
          },
          createQuickPick() {
            return {
              activeItems: [],
              items: [],
              matchOnDescription: false,
              matchOnDetail: false,
              placeholder: "",
              title: "",
              dispose() {},
              hide() {},
              onDidAccept() {
                return {
                  dispose() {},
                };
              },
              onDidHide() {
                return {
                  dispose() {},
                };
              },
              show() {},
            };
          },
          async showInputBox() {
            return inputBoxValues.shift();
          },
          async showQuickPick(items) {
            return items[0];
          },
          showWarningMessage(message) {
            warningMessages.push(message);
            return undefined;
          },
        },
        workspace: {
          workspaceFolders: undefined,
        },
      },
    );

    const webview = {
      html: "",
      onDidReceiveMessage(listener: (message: unknown) => void | Promise<void>) {
        receiveMessage = listener;
      },
      options: {},
    };

    await registeredProvider?.resolveWebviewView({ webview });
    assert.match(webview.html, />Start app</);
    await receiveMessage?.({
      type: "commandVault.action",
      action: "copy",
      target: {
        id: "global-1",
        scope: "global",
      },
    });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "run",
      target: {
        id: "global-1",
        scope: "global",
      },
    });
    await commandCallbacks.get(COMMAND_VAULT_CREATE_COMMAND_ID)?.("global");
    assert.match(webview.html, />Build</);
    assert.match(webview.html, /npm run build/);
    await commandCallbacks.get(COMMAND_VAULT_DELETE_COMMAND_ID)?.();

    assert.deepEqual(registrations, [
      COMMAND_VAULT_CREATE_COMMAND_ID,
      COMMAND_VAULT_EDIT_COMMAND_ID,
      COMMAND_VAULT_DELETE_COMMAND_ID,
      COMMAND_VAULT_RUN_COMMAND_ID,
      COMMAND_VAULT_COPY_COMMAND_ID,
      COMMAND_VAULT_SEARCH_COMMAND_ID,
      "commandVault.searchCommands.paste",
      "commandVault.searchCommands.alternateExecution",
      "commandVault.searchCommands.edit",
    ]);
    assert.equal(webview.options.enableScripts, true);
    assert.match(webview.html, /data-command-vault-action="run"/);
    assert.doesNotMatch(webview.html, />Start app</);
    assert.match(webview.html, />Build</);
    assert.deepEqual(clipboardWrites, ["npm run dev"]);
    assert.deepEqual(showCalls, [false]);
    assert.deepEqual(sendTextCalls, [
      {
        text: "npm run dev",
        addNewLine: true,
      },
    ]);
    assert.deepEqual(warningMessages, []);
    assert.equal(subscriptions.length, 10);
  });

  it("routes quick-pick search run, paste, and edit actions", async () => {
    const storagePath = await mkdtemp(join(tmpdir(), "command-vault-search-"));
    const commandCallbacks = new Map<string, (...args: unknown[]) => unknown>();
    const sendTextCalls: Array<{ addNewLine: boolean | undefined; text: string }> =
      [];
    const warningMessages: string[] = [];
    const inputBoxValues = [
      "Preview app",
      "npm run preview",
      "Start the preview server",
    ];
    const quickPick = createQuickPickHarness();
    let registeredProvider:
      | {
          resolveWebviewView(webviewView: {
            webview: {
              html: string;
              onDidReceiveMessage?(
                listener: (message: unknown) => void | Promise<void>,
              ): void;
              options?: {
                enableScripts?: boolean;
              };
            };
          }): void | Promise<void>;
        }
      | undefined;

    await mkdir(join(storagePath, "workspaces"), { recursive: true });
    await writeFile(
      join(storagePath, "global.json"),
      `${JSON.stringify([createStoredCommand()], null, 2)}\n`,
      { encoding: "utf8" },
    );

    activate(
      {
        globalStorageUri: {
          fsPath: storagePath,
        },
        subscriptions: {
          push(...items) {
            return items.length;
          },
        },
      },
      {
        commands: {
          executeCommand() {
            return undefined;
          },
          registerCommand(command, callback) {
            commandCallbacks.set(command, callback);
            return {
              dispose() {},
            };
          },
        },
        env: {
          clipboard: {
            async writeText() {},
          },
        },
        window: {
          activeTerminal: {
            sendText(text, addNewLine) {
              sendTextCalls.push({ text, addNewLine });
            },
            show() {},
          },
          createTerminal() {
            throw new Error("active terminal should be reused");
          },
          registerWebviewViewProvider(_viewId, provider) {
            registeredProvider = provider;
            return {
              dispose() {},
            };
          },
          createQuickPick() {
            return quickPick.instance;
          },
          async showInputBox() {
            return inputBoxValues.shift();
          },
          async showQuickPick(items) {
            return items[0];
          },
          showWarningMessage(message) {
            warningMessages.push(message);
            return undefined;
          },
        },
        workspace: {
          getConfiguration() {
            return {
              get(key, defaultValue) {
                return key === "defaultExecutionBehavior"
                  ? "paste"
                  : defaultValue;
              },
            };
          },
          workspaceFolders: undefined,
        },
      },
    );

    const webview = {
      html: "",
      onDidReceiveMessage() {},
      options: {},
    };

    await registeredProvider?.resolveWebviewView({ webview });

    const runSearchPromise = commandCallbacks.get(
      COMMAND_VAULT_SEARCH_COMMAND_ID,
    )?.();
    await waitForQuickPickShow(quickPick, 1);
    await quickPick.accept();
    await runSearchPromise;

    const alternateSearchPromise = commandCallbacks.get(
      COMMAND_VAULT_SEARCH_COMMAND_ID,
    )?.();
    await waitForQuickPickShow(quickPick, 2);
    await commandCallbacks.get(
      "commandVault.searchCommands.alternateExecution",
    )?.();
    await alternateSearchPromise;

    const editSearchPromise = commandCallbacks.get(
      COMMAND_VAULT_SEARCH_COMMAND_ID,
    )?.();
    await waitForQuickPickShow(quickPick, 3);
    await commandCallbacks.get("commandVault.searchCommands.edit")?.();
    await editSearchPromise;

    const persistedCommands = JSON.parse(
      await readFile(join(storagePath, "global.json"), { encoding: "utf8" }),
    ) as Array<{ command: string; description: string | null; name: string }>;

    assert.deepEqual(sendTextCalls, [
      {
        text: "npm run dev",
        addNewLine: false,
      },
      {
        text: "npm run dev",
        addNewLine: true,
      },
    ]);
    assert.match(webview.html, />Preview app</);
    assert.match(webview.html, /npm run preview/);
    assert.doesNotMatch(webview.html, />Start app</);
    assert.deepEqual(persistedCommands, [
      {
        name: "Preview app",
        command: "npm run preview",
        description: "Start the preview server",
        id: "global-1",
        scope: "global",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: persistedCommands[0]?.updatedAt,
      },
    ]);
    assert.notEqual(
      persistedCommands[0]?.updatedAt,
      "2026-06-02T00:00:00.000Z",
    );
    assert.deepEqual(warningMessages, []);
    assert.equal(quickPick.showCalls, 3);
  });
});

function createStoredCommand() {
  return {
    id: "global-1",
    scope: "global",
    name: "Start app",
    command: "npm run dev",
    description: "Run the dev server",
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
  };
}

function createQuickPickHarness(): {
  accept(): Promise<void>;
  instance: {
    activeItems: readonly Array<{ label: string }>;
    items: readonly Array<{ label: string }>;
    matchOnDescription: boolean;
    matchOnDetail: boolean;
    placeholder: string;
    title: string;
    dispose(): void;
    hide(): void;
    onDidAccept(listener: () => void | Promise<void>): { dispose(): void };
    onDidHide(listener: () => void | Promise<void>): { dispose(): void };
    show(): void;
  };
  showCalls: number;
} {
  let acceptListener: (() => void | Promise<void>) | undefined;
  let hideListener: (() => void | Promise<void>) | undefined;
  let showCalls = 0;
  const instance = {
    activeItems: [] as Array<{ label: string }>,
    items: [] as Array<{ label: string }>,
    matchOnDescription: false,
    matchOnDetail: false,
    placeholder: "",
    title: "",
    dispose() {},
    hide() {
      void hideListener?.();
    },
    onDidAccept(listener: () => void | Promise<void>) {
      acceptListener = listener;
      return { dispose() {} };
    },
    onDidHide(listener: () => void | Promise<void>) {
      hideListener = listener;
      return { dispose() {} };
    },
    show() {
      showCalls += 1;

      if (instance.items[0]) {
        instance.activeItems = [instance.items[0]];
      }
    },
  };

  return {
    get showCalls() {
      return showCalls;
    },
    instance,
    async accept() {
      await acceptListener?.();
    },
  };
}

async function waitForQuickPickShow(
  quickPick: { showCalls: number },
  expectedShowCalls: number,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (quickPick.showCalls >= expectedShowCalls) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error(`quick pick was not shown ${expectedShowCalls} time(s)`);
}
