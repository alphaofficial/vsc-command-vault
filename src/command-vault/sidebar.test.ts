import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { CommandVaultCommand } from "./model.ts";
import {
  createCommandVaultSidebarProvider,
  loadCommandVaultSidebarState,
  renderCommandVaultSidebarHtml,
  type CommandVaultSidebarMessage,
  type CommandVaultWebview,
} from "./sidebar.ts";

describe("command vault sidebar", () => {
  it("renders a workspace-only empty state when no workspace is open", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder(),
      undefined,
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.match(html, />Workspace</);
    assert.match(html, /No workspace open/);
    assert.match(html, /Open a workspace folder to save workspace commands\./);
    assert.doesNotMatch(html, /name="commandScope"/);
  });

  it("loads and renders workspace command cards", async () => {
    const command = createCommand("command-1", {
      name: "Run tests",
      command: "npm test",
      description: "Runs tests",
    });
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({ commands: [command] }),
      [{ uri: { fsPath: "/tmp/project-alpha" } }],
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.match(html, /Run tests/);
    assert.match(html, /npm test/);
    assert.match(html, /Runs tests/);
    assert.match(html, /data-command-vault-action="run"/);
    assert.match(html, /data-command-id="command-1"/);
    assert.doesNotMatch(html, /data-command-visibility/);
    assert.doesNotMatch(html, /name="commandScope"/);
  });

  it("renders create and edit forms without visibility fields", async () => {
    const command = createCommand("command-1", {
      name: "Preview",
      command: "npm run preview",
    });
    const html = renderCommandVaultSidebarHtml({
      hasWorkspace: true,
      workspaceCommands: [command],
    });

    assert.match(html, /<form class="create-command-form" aria-label="Create command" hidden>/);
    assert.match(html, /<form class="create-command-form edit-command-form"/);
    assert.doesNotMatch(html, /name="commandScope"/);
    assert.doesNotMatch(html, /data-command-visibility/);
  });

  it("forwards only valid workspace-only webview messages", async () => {
    const receivedMessages: CommandVaultSidebarMessage[] = [];
    const provider = createCommandVaultSidebarProvider({
      repository: createRepositoryRecorder(),
      workspace: {
        workspaceFolders: [{ uri: { fsPath: "/tmp/project-alpha" } }],
      },
      onDidReceiveMessage(message) {
        receivedMessages.push(message);
      },
    });
    const webview = createWebviewHarness();

    await provider.resolveWebviewView({ webview });
    await webview.emitMessage({
      type: "commandVault.action",
      action: "paste",
      target: { id: "command-1" },
    });
    await webview.emitMessage({
      type: "commandVault.createCommand",
      input: {
        name: "Lint",
        command: "npm run lint",
        description: "Run lint checks",
      },
    });
    await webview.emitMessage({
      type: "commandVault.updateCommand",
      target: { id: "command-1" },
      input: {
        name: "Test",
        command: "npm test",
        description: "",
      },
    });
    await webview.emitMessage({
      type: "commandVault.action",
      action: "run",
      target: {},
    });

    assert.deepEqual(receivedMessages, [
      {
        type: "commandVault.action",
        action: "paste",
        target: { id: "command-1" },
      },
      {
        type: "commandVault.createCommand",
        input: {
          name: "Lint",
          command: "npm run lint",
          description: "Run lint checks",
        },
      },
      {
        type: "commandVault.updateCommand",
        target: { id: "command-1" },
        input: {
          name: "Test",
          command: "npm test",
          description: "",
        },
      },
    ]);
  });

  it("refreshes the active webview with updated commands", async () => {
    const repository = createRepositoryRecorder({
      commands: [createCommand("command-1", { name: "Test" })],
    });
    const provider = createCommandVaultSidebarProvider({
      repository,
      workspace: {
        workspaceFolders: [{ uri: { fsPath: "/tmp/project-alpha" } }],
      },
    });
    const webview = createWebviewHarness();

    await provider.resolveWebviewView({ webview });
    assert.match(webview.html, /Test/);

    repository.setCommands([
      createCommand("command-2", { name: "Preview" }),
    ]);
    await provider.refresh();

    assert.doesNotMatch(webview.html, /Test/);
    assert.match(webview.html, /Preview/);
  });
});

function createRepositoryRecorder({
  commands = [],
}: {
  commands?: CommandVaultCommand[];
} = {}): {
  readCommandsCalls: Array<string | null>;
  setCommands(nextCommands: CommandVaultCommand[]): void;
  readCommands(workspaceId: string | null): Promise<CommandVaultCommand[]>;
  writeCommands(
    workspaceId: string,
    commands: readonly CommandVaultCommand[],
  ): Promise<void>;
} {
  let currentCommands = [...commands];
  const readCommandsCalls: Array<string | null> = [];

  return {
    readCommandsCalls,
    setCommands(nextCommands) {
      currentCommands = [...nextCommands];
    },
    async readCommands(workspaceId) {
      readCommandsCalls.push(workspaceId);
      return [...currentCommands];
    },
    async writeCommands(workspaceId, nextCommands) {
      void workspaceId;
      currentCommands = [...nextCommands];
    },
  };
}

function createCommand(
  id: string,
  overrides: Partial<CommandVaultCommand> = {},
): CommandVaultCommand {
  return {
    id,
    name: overrides.name ?? `Command ${id}`,
    command: overrides.command ?? "echo test",
    description:
      overrides.description === undefined ? null : overrides.description,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
  };
}

function createWebviewHarness(): CommandVaultWebview & {
  emitMessage(message: unknown): Promise<void>;
} {
  let listener: ((message: unknown) => void | Promise<void>) | undefined;

  return {
    html: "",
    options: {},
    onDidReceiveMessage(nextListener) {
      listener = nextListener;
      return { dispose() {} };
    },
    async emitMessage(message) {
      await listener?.(message);
    },
  };
}
