import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";

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
  type CommandVaultExtensionHost,
} from "./extension.ts";
import { createWorkspaceId, type CommandVaultCommand } from "./command-vault/model.ts";

interface PackageJsonContributes {
  viewsContainers?: {
    activitybar?: Array<{ id: string; title: string }>;
  };
  views?: Record<string, Array<{ id: string; name: string }>>;
  commands?: Array<{ command: string; title: string }>;
}

describe("extension scaffold", () => {
  it("exports stable baseline identifiers", () => {
    assert.equal(COMMAND_VAULT_EXTENSION_NAME, "Command Vault");
    assert.equal(COMMAND_VAULT_VIEW_CONTAINER_ID, "commandVault");
    assert.equal(COMMAND_VAULT_VIEW_ID, "commandVault.commands");
    assert.equal(COMMAND_VAULT_COPY_COMMAND_ID, "commandVault.copyCommand");
    assert.equal(COMMAND_VAULT_CREATE_COMMAND_ID, "commandVault.createCommand");
    assert.equal(COMMAND_VAULT_EDIT_COMMAND_ID, "commandVault.editCommand");
    assert.equal(COMMAND_VAULT_DELETE_COMMAND_ID, "commandVault.deleteCommand");
    assert.equal(COMMAND_VAULT_RUN_COMMAND_ID, "commandVault.runCommand");
    assert.equal(COMMAND_VAULT_SEARCH_COMMAND_ID, "commandVault.searchCommands");
  });

  it("keeps activation hooks callable", () => {
    assert.doesNotThrow(() => activate());
    assert.doesNotThrow(() => deactivate());
  });

  it("declares view and command identifiers in package.json", async () => {
    const raw = await readFile(join(process.cwd(), "package.json"), {
      encoding: "utf8",
    });
    const pkg = JSON.parse(raw) as { contributes?: PackageJsonContributes };

    const activitybarContainers = pkg.contributes?.viewsContainers?.activitybar ?? [];
    assert.deepEqual(activitybarContainers, [
      {
        id: COMMAND_VAULT_VIEW_CONTAINER_ID,
        title: COMMAND_VAULT_EXTENSION_NAME,
        icon: "resources/command-vault.svg",
      },
    ]);
    assert.deepEqual(pkg.contributes?.views?.[COMMAND_VAULT_VIEW_CONTAINER_ID], [
      {
        id: COMMAND_VAULT_VIEW_ID,
        name: "Commands",
        type: "webview",
      },
    ]);
    assert.equal(
      pkg.contributes?.commands?.some(
        (command) => command.command === COMMAND_VAULT_CREATE_COMMAND_ID,
      ),
      true,
    );
  });

  it("creates and updates commands from sidebar inline submissions", async () => {
    const storagePath = await mkdtemp(join(tmpdir(), "command-vault-inline-"));
    const workspacePath = "/tmp/command-vault-inline-workspace";
    const workspaceId = createWorkspaceId(workspacePath);
    let registeredProvider:
      | Parameters<
          CommandVaultExtensionHost["window"]["registerWebviewViewProvider"]
        >[1]
      | undefined;
    let receiveMessage:
      | ((message: unknown) => void | Promise<void>)
      | undefined;
    const host = createHost({
      workspacePath,
      onRegisterProvider(provider) {
        registeredProvider = provider;
      },
    });

    activate(createExtensionContext(storagePath), host);

    const webview = createWebviewHarness((listener) => {
      receiveMessage = listener;
    });
    await registeredProvider?.resolveWebviewView({ webview });
    await receiveMessage?.({
      type: "commandVault.createCommand",
      input: {
        name: "Preview",
        command: "npm run preview",
        description: "",
      },
    });

    const storageFilePath = join(storagePath, "workspaces", `${workspaceId}.json`);
    const createdCommands = JSON.parse(
      await readFile(storageFilePath, { encoding: "utf8" }),
    ) as CommandVaultCommand[];
    assert.deepEqual(
      createdCommands.map(({ name, command, description }) => ({
        name,
        command,
        description,
      })),
      [{ name: "Preview", command: "npm run preview", description: null }],
    );

    await receiveMessage?.({
      type: "commandVault.updateCommand",
      target: { id: createdCommands[0]?.id },
      input: {
        name: "Preview app",
        command: "npm run preview -- --host",
        description: "Starts preview",
      },
    });
    const updatedCommands = JSON.parse(
      await readFile(storageFilePath, { encoding: "utf8" }),
    ) as CommandVaultCommand[];

    assert.deepEqual(
      updatedCommands.map(({ name, command, description }) => ({
        name,
        command,
        description,
      })),
      [
        {
          name: "Preview app",
          command: "npm run preview -- --host",
          description: "Starts preview",
        },
      ],
    );
  });

  it("runs a sidebar command by id", async () => {
    const storagePath = await mkdtemp(join(tmpdir(), "command-vault-run-"));
    const workspacePath = "/tmp/command-vault-run-workspace";
    const workspaceId = createWorkspaceId(workspacePath);
    const command = createStoredCommand("command-1", {
      name: "Dev",
      command: "npm run dev",
    });
    await writeCommands(storagePath, workspaceId, [command]);
    let registeredProvider:
      | Parameters<
          CommandVaultExtensionHost["window"]["registerWebviewViewProvider"]
        >[1]
      | undefined;
    let receiveMessage:
      | ((message: unknown) => void | Promise<void>)
      | undefined;
    const terminalEvents: Array<{ text: string; addNewLine?: boolean }> = [];
    const host = createHost({
      workspacePath,
      terminalEvents,
      onRegisterProvider(provider) {
        registeredProvider = provider;
      },
    });

    activate(createExtensionContext(storagePath), host);

    const webview = createWebviewHarness((listener) => {
      receiveMessage = listener;
    });
    await registeredProvider?.resolveWebviewView({ webview });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "run",
      target: { id: command.id },
    });

    assert.deepEqual(terminalEvents, [
      { text: "npm run dev", addNewLine: true },
    ]);
  });

  it("round-trips commands through sidebar export and import", async () => {
    const storagePath = await mkdtemp(join(tmpdir(), "command-vault-roundtrip-"));
    const workspacePath = "/tmp/command-vault-roundtrip-workspace";
    const workspaceId = createWorkspaceId(workspacePath);
    const exportPath = join(
      await mkdtemp(join(tmpdir(), "command-vault-export-")),
      "commands.json",
    );
    await writeCommands(storagePath, workspaceId, [
      createStoredCommand("command-1", {
        name: "Lint",
        command: "npm run lint",
        description: "Run lint checks",
      }),
    ]);
    let registeredProvider:
      | Parameters<
          CommandVaultExtensionHost["window"]["registerWebviewViewProvider"]
        >[1]
      | undefined;
    let receiveMessage:
      | ((message: unknown) => void | Promise<void>)
      | undefined;
    const host = createHost({
      workspacePath,
      openDialogPath: exportPath,
      saveDialogPath: exportPath,
      onRegisterProvider(provider) {
        registeredProvider = provider;
      },
    });

    activate(createExtensionContext(storagePath), host);

    const webview = createWebviewHarness((listener) => {
      receiveMessage = listener;
    });
    await registeredProvider?.resolveWebviewView({ webview });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "export",
    });

    const exportedPayload = JSON.parse(
      await readFile(exportPath, { encoding: "utf8" }),
    ) as {
      commands: Array<{ command: string; description: string | null; name: string }>;
      version: string;
    };
    assert.equal(exportedPayload.version, "1.0");
    assert.deepEqual(exportedPayload.commands, [
      {
        name: "Lint",
        command: "npm run lint",
        description: "Run lint checks",
      },
    ]);

    await writeCommands(storagePath, workspaceId, []);
    await receiveMessage?.({
      type: "commandVault.action",
      action: "import",
    });

    const restoredCommands = JSON.parse(
      await readFile(join(storagePath, "workspaces", `${workspaceId}.json`), {
        encoding: "utf8",
      }),
    ) as CommandVaultCommand[];
    assert.equal(restoredCommands.length, 1);
    assert.notEqual(restoredCommands[0]?.id, "command-1");
    assert.equal(restoredCommands[0]?.name, "Lint");
    assert.equal(restoredCommands[0]?.command, "npm run lint");
    assert.equal(restoredCommands[0]?.description, "Run lint checks");
  });

  it("routes sidebar export and import actions to the import-export service", async () => {
    const storagePath = await mkdtemp(
      join(tmpdir(), "command-vault-sidebar-export-import-"),
    );
    const saveDialogCalls: Array<{
      defaultUri?: { fsPath: string };
      filters?: Record<string, string[]>;
    }> = [];
    const openDialogCalls: Array<{
      filters?: Record<string, string[]>;
    }> = [];
    const warningMessages: string[] = [];
    let showSaveDialogCalls = 0;
    let showOpenDialogCalls = 0;
    let showInputBoxCalls = 0;
    let showQuickPickCalls = 0;
    let registeredProvider:
      | Parameters<
          CommandVaultExtensionHost["window"]["registerWebviewViewProvider"]
        >[1]
      | undefined;
    let receiveMessage:
      | ((message: unknown) => void | Promise<void>)
      | undefined;

    activate(
      createExtensionContext(storagePath),
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
            throw new Error("search should not be used");
          },
          async showInputBox() {
            showInputBoxCalls += 1;
            throw new Error("input box should not be used");
          },
          async showOpenDialog(options) {
            showOpenDialogCalls += 1;
            openDialogCalls.push({ filters: options.filters });
            return undefined;
          },
          async showSaveDialog(options) {
            showSaveDialogCalls += 1;
            saveDialogCalls.push({
              defaultUri: options.defaultUri,
              filters: options.filters,
            });
            return undefined;
          },
          async showQuickPick() {
            showQuickPickCalls += 1;
            throw new Error("quick pick should not be used");
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

    const webview = createWebviewHarness((listener) => {
      receiveMessage = listener;
    });

    await registeredProvider?.resolveWebviewView({ webview });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "export",
    });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "import",
    });

    assert.equal(showSaveDialogCalls, 1);
    assert.equal(showOpenDialogCalls, 1);
    assert.equal(showInputBoxCalls, 0);
    assert.equal(showQuickPickCalls, 0);
    assert.deepEqual(warningMessages, []);

    const saveCall = saveDialogCalls[0];
    assert.match(
      saveCall?.defaultUri?.fsPath ?? "",
      /^command-vault-export-\d{4}-\d{2}-\d{2}\.json$/,
    );
    assert.deepEqual(saveCall?.filters, { JSON: ["json"] });
    assert.deepEqual(openDialogCalls[0]?.filters, { JSON: ["json"] });
  });

  it("round-trips commands through the export and import sidebar flows", async () => {
    const storagePath = await mkdtemp(
      join(tmpdir(), "command-vault-sidebar-roundtrip-"),
    );
    const workspacePath = "/tmp/command-vault-sidebar-roundtrip-workspace";
    const workspaceId = createWorkspaceId(workspacePath);
    const exportDir = await mkdtemp(
      join(tmpdir(), "command-vault-sidebar-roundtrip-export-"),
    );
    const exportFilePath = join(
      exportDir,
      "command-vault-export-test.json",
    );

    const globalCommands: CommandVaultCommand[] = [
      {
        id: "global-1",
        scope: "global",
        name: "Build",
        command: "npm run build",
        description: "Compile the project",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "global-2",
        scope: "global",
        name: "Test",
        command: "npm test",
        description: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ];
    const workspaceCommands: CommandVaultCommand[] = [
      {
        id: "workspace-1",
        scope: "workspace",
        name: "Lint",
        command: "npm run lint",
        description: "Run lint checks",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ];

    await mkdir(join(storagePath, "workspaces"), { recursive: true });
    await writeFile(
      join(storagePath, "global.json"),
      `${JSON.stringify(globalCommands, null, 2)}\n`,
      { encoding: "utf8" },
    );
    await writeFile(
      join(storagePath, "workspaces", `${workspaceId}.json`),
      `${JSON.stringify(workspaceCommands, null, 2)}\n`,
      { encoding: "utf8" },
    );

    const warningMessages: string[] = [];
    let registeredProvider:
      | Parameters<
          CommandVaultExtensionHost["window"]["registerWebviewViewProvider"]
        >[1]
      | undefined;
    let receiveMessage:
      | ((message: unknown) => void | Promise<void>)
      | undefined;

    activate(
      createExtensionContext(storagePath),
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
            throw new Error("search should not be used");
          },
          async showInputBox() {
            throw new Error("input box should not be used");
          },
          async showOpenDialog() {
            return [{ fsPath: exportFilePath }];
          },
          async showSaveDialog() {
            return { fsPath: exportFilePath };
          },
          async showQuickPick() {
            throw new Error("quick pick should not be used");
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

    const webview = createWebviewHarness((listener) => {
      receiveMessage = listener;
    });

    await registeredProvider?.resolveWebviewView({ webview });

    await receiveMessage?.({
      type: "commandVault.action",
      action: "export",
    });

    const exportedContents = await readFile(exportFilePath, {
      encoding: "utf8",
    });
    const exportedPayload = JSON.parse(exportedContents) as {
      version: string;
      exportedAt: string;
      commands: CommandVaultCommand[];
    };

    assert.equal(exportedPayload.version, "1.0");
    assert.equal(typeof exportedPayload.exportedAt, "string");
    assert.deepEqual(
      exportedPayload.commands.map((command) => command.id),
      ["global-1", "global-2", "workspace-1"],
    );

    await writeFile(join(storagePath, "global.json"), "[]\n", {
      encoding: "utf8",
    });
    await writeFile(
      join(storagePath, "workspaces", `${workspaceId}.json`),
      "[]\n",
      { encoding: "utf8" },
    );

    await receiveMessage?.({
      type: "commandVault.action",
      action: "import",
    });

    const restoredGlobal = JSON.parse(
      await readFile(join(storagePath, "global.json"), { encoding: "utf8" }),
    ) as CommandVaultCommand[];
    const restoredWorkspace = JSON.parse(
      await readFile(
        join(storagePath, "workspaces", `${workspaceId}.json`),
        { encoding: "utf8" },
      ),
    ) as CommandVaultCommand[];

    assert.deepEqual(
      restoredGlobal.map((command) => command.id),
      ["global-1", "global-2"],
    );
    assert.deepEqual(
      restoredWorkspace.map((command) => command.id),
      ["workspace-1"],
    );
    assert.deepEqual(warningMessages, []);
  });
});

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

function createHost({
  onRegisterProvider,
  openDialogPath,
  saveDialogPath,
  terminalEvents = [],
  workspacePath,
}: {
  onRegisterProvider(
    provider: Parameters<
      CommandVaultExtensionHost["window"]["registerWebviewViewProvider"]
    >[1],
  ): void;
  openDialogPath?: string;
  saveDialogPath?: string;
  terminalEvents?: Array<{ text: string; addNewLine?: boolean }>;
  workspacePath: string;
}): CommandVaultExtensionHost {
  return {
    commands: {
      executeCommand() {},
      registerCommand() {
        return { dispose() {} };
      },
    },
    env: {
      clipboard: {
        writeText() {},
      },
    },
    Uri: {
      file(path) {
        return {
          fsPath: path,
          scheme: "file",
        };
      },
    },
    window: {
      activeTerminal: undefined,
      createTerminal() {
        return {
          show() {},
          sendText(text, addNewLine) {
            terminalEvents.push({ text, addNewLine });
          },
        };
      },
      createQuickPick() {
        throw new Error("quick pick should not be used");
      },
      registerWebviewViewProvider(_viewId, provider) {
        onRegisterProvider(provider);
        return { dispose() {} };
      },
      async showInputBox() {
        throw new Error("input box should not be used");
      },
      async showOpenDialog() {
        return openDialogPath ? [{ fsPath: openDialogPath }] : undefined;
      },
      async showQuickPick() {
        throw new Error("quick pick should not be used");
      },
      async showSaveDialog() {
        return saveDialogPath ? { fsPath: saveDialogPath } : undefined;
      },
      showInformationMessage() {},
      showWarningMessage(message) {
        throw new Error(`warning should not be shown: ${message}`);
      },
    },
    workspace: {
      getConfiguration() {
        return {
          get<T>(_section: string, defaultValue: T): T {
            return defaultValue;
          },
        };
      },
      workspaceFolders: [{ uri: { fsPath: workspacePath } }],
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
    options: {},
  };
}

function createStoredCommand(
  id: string,
  overrides: Partial<CommandVaultCommand> = {},
): CommandVaultCommand {
  return {
    id,
    name: overrides.name ?? "Start app",
    command: overrides.command ?? "npm run dev",
    description:
      overrides.description === undefined ? null : overrides.description,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
  };
}

async function writeCommands(
  storagePath: string,
  workspaceId: string,
  commands: readonly CommandVaultCommand[],
): Promise<void> {
  await mkdir(join(storagePath, "workspaces"), { recursive: true });
  await writeFile(
    join(storagePath, "workspaces", `${workspaceId}.json`),
    `${JSON.stringify(commands, null, 2)}\n`,
    { encoding: "utf8" },
  );
}
