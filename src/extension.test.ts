import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "vitest";

import {
  activate,
  type CommandVaultExtensionHost,
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
import { createWorkspaceId, type CommandVaultCommand } from "./command-vault/model.ts";

interface PackageJsonContributes {
  viewsContainers?: {
    activitybar?: Array<{ id: string; title: string }>;
  };
  views?: Record<string, Array<{ id: string; name: string }>>;
  commands?: Array<{ command: string; title: string }>;
}

type QuickPickResult<Item extends { label: string }> = {
  activeItems: readonly Item[];
  items: readonly Item[];
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

  it("declares view and command identifiers in package.json that match exported constants", async () => {
    // Parse package.json to validate contributes match the exported constants.
    // This prevents stale extension state where VS Code caches old contribution
    // IDs that no longer match what the extension actually registers.
    const packageJsonPath = join(process.cwd(), "package.json");
    const raw = await readFile(packageJsonPath, { encoding: "utf8" });
    const pkg = JSON.parse(raw) as { contributes?: PackageJsonContributes };

    assert.ok(pkg.contributes, "package.json must have a contributes section");

    // Validate view container
    const activitybarContainers = pkg.contributes.viewsContainers?.activitybar ?? [];
    const containerIds = activitybarContainers.map((c) => c.id);
    assert.ok(
      containerIds.includes(COMMAND_VAULT_VIEW_CONTAINER_ID),
      `view container "${COMMAND_VAULT_VIEW_CONTAINER_ID}" must be declared in package.json contributes.viewsContainers.activitybar`,
    );

    // Validate view ID
    const views = pkg.contributes.views ?? {};
    const containerViews = views[COMMAND_VAULT_VIEW_CONTAINER_ID] ?? [];
    const viewIds = containerViews.map((v) => v.id);
    assert.ok(
      viewIds.includes(COMMAND_VAULT_VIEW_ID),
      `view "${COMMAND_VAULT_VIEW_ID}" must be declared in package.json contributes.views["${COMMAND_VAULT_VIEW_CONTAINER_ID}"]`,
    );

    // Validate command IDs
    const declaredCommands = pkg.contributes.commands ?? [];
    const declaredCommandIds = declaredCommands.map((c) => c.command);
    const expectedCommandIds = [
      COMMAND_VAULT_CREATE_COMMAND_ID,
      COMMAND_VAULT_EDIT_COMMAND_ID,
      COMMAND_VAULT_COPY_COMMAND_ID,
      COMMAND_VAULT_RUN_COMMAND_ID,
      COMMAND_VAULT_DELETE_COMMAND_ID,
      COMMAND_VAULT_SEARCH_COMMAND_ID,
    ];
    for (const id of expectedCommandIds) {
      assert.ok(
        declaredCommandIds.includes(id),
        `command "${id}" must be declared in package.json contributes.commands`,
      );
    }
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

    const workspacePath = "/tmp/command-vault-sidebar-actions";
    const workspaceId = createWorkspaceId(workspacePath);

    await mkdir(join(storagePath, "workspaces"), { recursive: true });
    await writeFile(
      join(storagePath, "workspaces", `${workspaceId}.json`),
      `${JSON.stringify([
        {
          ...createStoredCommand(),
          id: "workspace-1",
          scope: "workspace",
        },
      ], null, 2)}\n`,
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
          createQuickPick<Item extends { label: string }>(): QuickPickResult<Item> {
            return {
              activeItems: [] as unknown as readonly Item[],
              items: [] as unknown as readonly Item[],
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
            } as QuickPickResult<Item>;
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
          workspaceFolders: [{ uri: { fsPath: workspacePath } }],
        },
      },
    );

    const webview = {
      html: "",
      onDidReceiveMessage(listener: (message: unknown) => void | Promise<void>) {
        receiveMessage = listener;
      },
      options: {} as { enableScripts?: boolean },
    };

    await registeredProvider?.resolveWebviewView({ webview });
    assert.match(webview.html, />Start app</);
    await receiveMessage?.({
      type: "commandVault.action",
      action: "copy",
      target: {
        id: "workspace-1",
        scope: "workspace",
      },
    });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "run",
      target: {
        id: "workspace-1",
        scope: "workspace",
      },
    });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "paste",
      target: {
        id: "workspace-1",
        scope: "workspace",
      },
    });
    await commandCallbacks.get(COMMAND_VAULT_CREATE_COMMAND_ID)?.("global");
    assert.doesNotMatch(webview.html, />Build</);
    assert.doesNotMatch(webview.html, /npm run build/);
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
    assert.doesNotMatch(webview.html, /data-command-vault-action="run"/);
    assert.doesNotMatch(webview.html, />Start app</);
    assert.doesNotMatch(webview.html, />Build</);
    assert.deepEqual(clipboardWrites, ["npm run dev"]);
    assert.deepEqual(showCalls, [false, false]);
    assert.deepEqual(sendTextCalls, [
      {
        text: "npm run dev",
        addNewLine: true,
      },
      {
        text: "npm run dev",
        addNewLine: false,
      },
    ]);
    assert.deepEqual(warningMessages, []);
    assert.equal(subscriptions.length, 10);
  });

  it("ignores malformed sidebar command-card actions instead of opening fallback pickers", async () => {
    const storagePath = await mkdtemp(join(tmpdir(), "command-vault-sidebar-strict-"));
    const commandCallbacks = new Map<string, (...args: unknown[]) => unknown>();
    const warningMessages: string[] = [];
    let quickPickOpened = false;
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
          push() {
            return 0;
          },
        },
      },
      {
        commands: {
          registerCommand(command, callback) {
            commandCallbacks.set(command, callback);
            return {
              dispose() {},
            };
          },
        },
        env: {
          clipboard: {
            writeText() {
              throw new Error("clipboard should not be used");
            },
          },
        },
        window: {
          activeTerminal: undefined,
          createTerminal() {
            throw new Error("terminal should not be created");
          },
          registerWebviewViewProvider(_viewId, provider) {
            registeredProvider = provider;
            return {
              dispose() {},
            };
          },
          createQuickPick() {
            quickPickOpened = true;
            throw new Error("malformed sidebar action should not open a picker");
          },
          showInputBox() {
            throw new Error("malformed sidebar action should not prompt");
          },
          showQuickPick() {
            quickPickOpened = true;
            throw new Error("malformed sidebar action should not open quick pick");
          },
          showWarningMessage(message) {
            warningMessages.push(message);
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
      options: {} as { enableScripts?: boolean },
    };

    await registeredProvider?.resolveWebviewView({ webview });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "run",
      target: {
        scope: "global",
      },
    });
    await commandCallbacks.get(COMMAND_VAULT_RUN_COMMAND_ID)?.();

    assert.equal(quickPickOpened, false);
    assert.deepEqual(warningMessages, []);
  });

  it("ignores global commands from sidebar inline submissions", async () => {
    const storagePath = await mkdtemp(join(tmpdir(), "command-vault-inline-global-"));
    let inputBoxCalls = 0;
    let quickPickCalls = 0;
    let registeredProvider: Parameters<CommandVaultExtensionHost["window"]["registerWebviewViewProvider"]>[1] | undefined;
    let receiveMessage: ((message: unknown) => void | Promise<void>) | undefined;

    activate(
      createExtensionContext(storagePath),
      createSidebarInlineHost({
        onRegisterProvider(provider) {
          registeredProvider = provider;
        },
        onShowInputBox() {
          inputBoxCalls += 1;
        },
        onShowQuickPick() {
          quickPickCalls += 1;
        },
        workspaceFolders: undefined,
      }),
    );

    const webview = createWebviewHarness((listener) => {
      receiveMessage = listener;
    });

    await registeredProvider?.resolveWebviewView({ webview });
    await receiveMessage?.({
      type: "commandVault.createCommand",
      target: { scope: "global" },
      input: {
        name: "Lint",
        command: "npm run lint",
        description: "Run lint checks",
      },
    });

    assert.equal(inputBoxCalls, 0);
    assert.equal(quickPickCalls, 0);
    assert.doesNotMatch(webview.html, />Lint</);
    await assert.rejects(
      readFile(join(storagePath, "global.json"), { encoding: "utf8" }),
    );
  });

  it("updates workspace commands from sidebar inline edit submissions without prompts", async () => {
    const storagePath = await mkdtemp(join(tmpdir(), "command-vault-inline-edit-workspace-"));
    const workspacePath = "/tmp/command-vault-inline-edit-workspace";
    const workspaceId = createWorkspaceId(workspacePath);
    let inputBoxCalls = 0;
    let quickPickCalls = 0;
    let registeredProvider: Parameters<CommandVaultExtensionHost["window"]["registerWebviewViewProvider"]>[1] | undefined;
    let receiveMessage: ((message: unknown) => void | Promise<void>) | undefined;

    await mkdir(join(storagePath, "workspaces"), { recursive: true });
    await writeFile(
      join(storagePath, "workspaces", `${workspaceId}.json`),
      `${JSON.stringify([
        {
          ...createStoredCommand(),
          id: "workspace-1",
          scope: "workspace",
        },
      ], null, 2)}\n`,
      { encoding: "utf8" },
    );

    activate(
      createExtensionContext(storagePath),
      createSidebarInlineHost({
        onRegisterProvider(provider) {
          registeredProvider = provider;
        },
        onShowInputBox() {
          inputBoxCalls += 1;
        },
        onShowQuickPick() {
          quickPickCalls += 1;
        },
        workspaceFolders: [{ uri: { fsPath: workspacePath } }],
      }),
    );

    const webview = createWebviewHarness((listener) => {
      receiveMessage = listener;
    });

    await registeredProvider?.resolveWebviewView({ webview });
    await receiveMessage?.({
      type: "commandVault.updateCommand",
      target: { id: "workspace-1", scope: "workspace" },
      input: {
        name: "Preview",
        command: "npm run preview",
        description: "",
      },
    });

    const persistedCommands = JSON.parse(
      await readFile(join(storagePath, "workspaces", `${workspaceId}.json`), {
        encoding: "utf8",
      }),
    ) as Array<{ command: string; description: string | null; name: string }>;

    assert.equal(inputBoxCalls, 0);
    assert.equal(quickPickCalls, 0);
    assert.match(webview.html, />Preview</);
    assert.match(webview.html, /npm run preview/);
    assert.doesNotMatch(webview.html, />Start app</);
    assert.deepEqual(persistedCommands.map(({ name, command, description }) => ({ name, command, description })), [
      { name: "Preview", command: "npm run preview", description: null },
    ]);
  });

  it("creates workspace commands from sidebar inline submissions without prompts", async () => {
    const storagePath = await mkdtemp(join(tmpdir(), "command-vault-inline-workspace-"));
    const workspacePath = "/tmp/command-vault-inline-workspace";
    let inputBoxCalls = 0;
    let quickPickCalls = 0;
    let registeredProvider: Parameters<CommandVaultExtensionHost["window"]["registerWebviewViewProvider"]>[1] | undefined;
    let receiveMessage: ((message: unknown) => void | Promise<void>) | undefined;

    activate(
      createExtensionContext(storagePath),
      createSidebarInlineHost({
        onRegisterProvider(provider) {
          registeredProvider = provider;
        },
        onShowInputBox() {
          inputBoxCalls += 1;
        },
        onShowQuickPick() {
          quickPickCalls += 1;
        },
        workspaceFolders: [{ uri: { fsPath: workspacePath } }],
      }),
    );

    const webview = createWebviewHarness((listener) => {
      receiveMessage = listener;
    });

    await registeredProvider?.resolveWebviewView({ webview });
    await receiveMessage?.({
      type: "commandVault.createCommand",
      target: { scope: "workspace" },
      input: {
        name: "Test",
        command: "npm test",
        description: "",
      },
    });

    const workspaceId = createWorkspaceId(workspacePath);
    const persistedCommands = JSON.parse(
      await readFile(join(storagePath, "workspaces", `${workspaceId}.json`), {
        encoding: "utf8",
      }),
    ) as Array<{ command: string; description: string | null; name: string }>;

    assert.equal(inputBoxCalls, 0);
    assert.equal(quickPickCalls, 0);
    assert.match(webview.html, />Test</);
    assert.match(webview.html, /npm test/);
    assert.deepEqual(persistedCommands.map(({ name, command, description }) => ({ name, command, description })), [
      { name: "Test", command: "npm test", description: null },
    ]);
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
          createQuickPick<Item extends { label: string }>(): QuickPickResult<Item> {
            return quickPick.instance as unknown as QuickPickResult<Item>;
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
              get<T>(key: string, defaultValue: T): T {
                return (key === "defaultExecutionBehavior"
                  ? "paste"
                  : defaultValue) as T;
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
      options: {} as { enableScripts?: boolean },
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
    ) as Array<CommandVaultCommand>;

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
    assert.doesNotMatch(webview.html, />Preview app</);
    assert.doesNotMatch(webview.html, /npm run preview/);
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

  it("refreshes the sidebar when command vault settings change", async () => {
    const storagePath = await mkdtemp(join(tmpdir(), "command-vault-settings-"));
    const configurationState = {
      defaultExecutionBehavior: "run" as const,
      enableGlobalScope: true,
      enableWorkspaceScope: true,
    };
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
    let changeConfigurationListener:
      | ((event: { affectsConfiguration(section: string): boolean }) => void | Promise<void>)
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
          registerCommand() {
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
          activeTerminal: undefined,
          createTerminal() {
            throw new Error("createTerminal should not be used");
          },
          registerWebviewViewProvider(_viewId, provider) {
            registeredProvider = provider;
            return {
              dispose() {},
            };
          },
          createQuickPick() {
            throw new Error("search should not be used");
          },
          async showInputBox() {
            return undefined;
          },
          async showQuickPick() {
            return undefined;
          },
          showWarningMessage() {
            return undefined;
          },
        },
        workspace: {
          getConfiguration() {
            return {
              get<T>(key: string, defaultValue: T): T {
                switch (key) {
                  case "defaultExecutionBehavior":
                    return configurationState.defaultExecutionBehavior as T;
                  case "enableGlobalScope":
                    return configurationState.enableGlobalScope as T;
                  case "enableWorkspaceScope":
                    return configurationState.enableWorkspaceScope as T;
                  default:
                    return defaultValue;
                }
              },
            };
          },
          onDidChangeConfiguration(listener) {
            changeConfigurationListener = listener;
            return {
              dispose() {},
            };
          },
          workspaceFolders: undefined,
        },
      },
    );

    const webview = {
      html: "",
      onDidReceiveMessage() {},
      options: {} as { enableScripts?: boolean },
    };

    await registeredProvider?.resolveWebviewView({ webview });
    assert.doesNotMatch(webview.html, />Start app</);
    assert.doesNotMatch(webview.html, /Global commands disabled/);

    configurationState.enableGlobalScope = false;
    await changeConfigurationListener?.({
      affectsConfiguration(section) {
        return section === "commandVault";
      },
    });

    assert.doesNotMatch(webview.html, />Start app</);
    assert.doesNotMatch(webview.html, /Global commands disabled/);
  });

  it("blocks quick-pick execution when the selected scope becomes disabled", async () => {
    const storagePath = await mkdtemp(join(tmpdir(), "command-vault-search-"));
    const commandCallbacks = new Map<string, (...args: unknown[]) => unknown>();
    const configurationState = {
      defaultExecutionBehavior: "paste" as const,
      enableGlobalScope: true,
      enableWorkspaceScope: true,
    };
    const sendTextCalls: Array<{ addNewLine: boolean | undefined; text: string }> =
      [];
    const warningMessages: string[] = [];
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
          createQuickPick<Item extends { label: string }>(): QuickPickResult<Item> {
            return quickPick.instance as unknown as QuickPickResult<Item>;
          },
          async showInputBox() {
            return undefined;
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
              get<T>(key: string, defaultValue: T): T {
                switch (key) {
                  case "defaultExecutionBehavior":
                    return configurationState.defaultExecutionBehavior as T;
                  case "enableGlobalScope":
                    return configurationState.enableGlobalScope as T;
                  case "enableWorkspaceScope":
                    return configurationState.enableWorkspaceScope as T;
                  default:
                    return defaultValue;
                }
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
      options: {} as { enableScripts?: boolean },
    };

    await registeredProvider?.resolveWebviewView({ webview });

    const pasteSearchPromise = commandCallbacks.get(
      COMMAND_VAULT_SEARCH_COMMAND_ID,
    )?.();
    await waitForQuickPickShow(quickPick, 1);
    configurationState.enableGlobalScope = false;
    await quickPick.accept();
    await pasteSearchPromise;

    configurationState.enableGlobalScope = true;
    const runSearchPromise = commandCallbacks.get(
      COMMAND_VAULT_SEARCH_COMMAND_ID,
    )?.();
    await waitForQuickPickShow(quickPick, 2);
    configurationState.enableGlobalScope = false;
    await commandCallbacks.get(
      "commandVault.searchCommands.alternateExecution",
    )?.();
    await runSearchPromise;

    assert.deepEqual(sendTextCalls, []);
    assert.deepEqual(warningMessages, [
      "Command Vault global commands are disabled in settings.",
      "Command Vault global commands are disabled in settings.",
    ]);
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

function createExtensionContext(storagePath: string): Parameters<typeof activate>[0] {
  return {
    globalStorageUri: {
      fsPath: storagePath,
    },
    subscriptions: {
      push(...items) {
        return items.length;
      },
    },
  };
}

function createWebviewHarness(
  onReceiveMessage: (
    listener: (message: unknown) => void | Promise<void>,
  ) => void,
): {
  html: string;
  onDidReceiveMessage(listener: (message: unknown) => void | Promise<void>): void;
  options: { enableScripts?: boolean };
} {
  return {
    html: "",
    onDidReceiveMessage(listener) {
      onReceiveMessage(listener);
    },
    options: {} as { enableScripts?: boolean },
  };
}

function createSidebarInlineHost(options: {
  onRegisterProvider(
    provider: Parameters<
      CommandVaultExtensionHost["window"]["registerWebviewViewProvider"]
    >[1],
  ): void;
  onShowInputBox(): void;
  onShowQuickPick(): void;
  workspaceFolders: CommandVaultExtensionHost["workspace"]["workspaceFolders"];
}): CommandVaultExtensionHost {
  return {
    commands: {
      registerCommand() {
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
      activeTerminal: undefined,
      createTerminal() {
        throw new Error("terminal should not be created");
      },
      registerWebviewViewProvider(_viewId, provider) {
        options.onRegisterProvider(provider);
        return {
          dispose() {},
        };
      },
      createQuickPick() {
        options.onShowQuickPick();
        throw new Error("inline create should not open quick pick");
      },
      showInputBox() {
        options.onShowInputBox();
        throw new Error("inline create should not open input box");
      },
      showQuickPick() {
        options.onShowQuickPick();
        throw new Error("inline create should not open quick pick");
      },
      showWarningMessage() {
        return undefined;
      },
    },
    workspace: {
      workspaceFolders: options.workspaceFolders,
    },
  };
}

function createQuickPickHarness(): {
  accept(): Promise<void>;
  instance: {
    activeItems: readonly { label: string }[];
    items: readonly { label: string }[];
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
