import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CommandVaultCommand } from "./model.ts";
import {
  createCommandVaultSidebarProvider,
  loadCommandVaultSidebarState,
  renderCommandVaultSidebarHtml,
  type CommandVaultSidebarActionMessage,
} from "./sidebar.ts";

describe("command vault sidebar", () => {
  it("renders both flat sections with empty states when no commands exist", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder(),
      undefined,
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.match(html, />Workspace</);
    assert.match(html, />Global</);
    assert.match(html, /No workspace open/);
    assert.match(html, /Open a workspace folder to save workspace commands\./);
    assert.match(html, /No global commands yet/);
    assert.match(html, /Save reusable personal commands here\./);
  });

  it("renders command cards with visible actions for both scopes", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        globalCommands: [
          createCommand("global", "global-1", {
            command: "pnpm lint",
            description: "Lint the repo",
            name: "Lint",
          }),
        ],
        workspaceCommands: [
          createCommand("workspace", "workspace-1", {
            command: "npm test",
            description: "Run tests",
            name: "Test",
          }),
        ],
      }),
      [
        {
          uri: {
            fsPath: "/tmp/project-gamma",
          },
        },
      ],
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.match(html, /class="command-card"/);
    assert.match(html, />Test</);
    assert.match(html, /Run tests/);
    assert.match(html, /npm test/);
    assert.match(html, /pnpm lint/);
    assert.match(html, /data-command-vault-action="run"/);
    assert.match(html, /data-command-vault-action="copy"/);
    assert.match(html, /data-command-vault-action="edit"/);
    assert.match(html, /data-command-vault-action="delete"/);
    assert.doesNotMatch(html, /saved commands/);
  });

  it("forwards only valid webview action messages to the host callback", async () => {
    const receivedMessages: CommandVaultSidebarActionMessage[] = [];
    let receiveMessage:
      | ((message: unknown) => void | Promise<void>)
      | undefined;
    const provider = createCommandVaultSidebarProvider({
      onDidReceiveMessage(message) {
        receivedMessages.push(message);
      },
      repository: createRepositoryRecorder(),
      workspace: {
        workspaceFolders: undefined,
      },
    });
    const webview = {
      html: "",
      onDidReceiveMessage(listener: (message: unknown) => void | Promise<void>) {
        receiveMessage = listener;
      },
      options: {},
    };

    await provider.resolveWebviewView({ webview });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "run",
      target: {
        id: "global-1",
        scope: "global",
      },
    });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "paste",
      target: {
        id: "global-1",
        scope: "global",
      },
    });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "copy",
      target: {
        id: 7,
        scope: "global",
      },
    });

    assert.equal(webview.options.enableScripts, true);
    assert.deepEqual(receivedMessages, [
      {
        type: "commandVault.action",
        action: "run",
        target: {
          id: "global-1",
          scope: "global",
        },
      },
    ]);
  });

  it("loads both scopes into the sidebar provider before rendering", async () => {
    const repository = createRepositoryRecorder({
      globalCommands: [createCommand("global", "global-1")],
      workspaceCommands: [
        createCommand("workspace", "workspace-1"),
        createCommand("workspace", "workspace-2"),
      ],
    });
    const provider = createCommandVaultSidebarProvider({
      repository,
      workspace: {
        workspaceFolders: [
          {
            uri: {
              fsPath: "/tmp/project-gamma",
            },
          },
        ],
      },
    });
    const webview = {
      html: "",
      options: {},
    };

    await provider.resolveWebviewView({ webview });

    assert.match(webview.html, /workspace-1/);
    assert.match(webview.html, /workspace-2/);
    assert.match(webview.html, /global-1/);
    assert.equal(repository.readGlobalCommandsCalls, 1);
    assert.equal(repository.readWorkspaceCommandsCalls.length, 1);
  });
});

function createRepositoryRecorder({
  globalCommands = [],
  workspaceCommands = [],
}: {
  globalCommands?: CommandVaultCommand[];
  workspaceCommands?: CommandVaultCommand[];
} = {}): {
  readGlobalCommandsCalls: number;
  readWorkspaceCommandsCalls: Array<string | null>;
  readGlobalCommands(): Promise<CommandVaultCommand[]>;
  readWorkspaceCommands(workspaceId: string | null): Promise<CommandVaultCommand[]>;
  writeGlobalCommands(): Promise<void>;
  writeWorkspaceCommands(): Promise<void>;
} {
  let readGlobalCommandsCalls = 0;
  const readWorkspaceCommandsCalls: Array<string | null> = [];

  return {
    get readGlobalCommandsCalls() {
      return readGlobalCommandsCalls;
    },
    readWorkspaceCommandsCalls,
    async readGlobalCommands() {
      readGlobalCommandsCalls += 1;
      return [...globalCommands];
    },
    async readWorkspaceCommands(workspaceId) {
      readWorkspaceCommandsCalls.push(workspaceId);
      return [...workspaceCommands];
    },
    async writeGlobalCommands() {},
    async writeWorkspaceCommands() {},
  };
}

function createCommand(
  scope: "global" | "workspace",
  id: string,
  overrides: Partial<CommandVaultCommand> = {},
): CommandVaultCommand {
  return {
    id,
    scope,
    name: `Command ${id}`,
    command: "echo test",
    description: null,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    ...overrides,
  };
}
