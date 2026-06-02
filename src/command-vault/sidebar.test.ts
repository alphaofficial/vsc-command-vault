import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CommandVaultCommand } from "./model.ts";
import {
  createCommandVaultSidebarProvider,
  loadCommandVaultSidebarState,
  renderCommandVaultSidebarHtml,
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
    };

    await provider.resolveWebviewView({ webview });

    assert.match(webview.html, /2 saved commands/);
    assert.match(webview.html, /Workspace commands are loaded for this project\./);
    assert.match(webview.html, /1 saved command/);
    assert.match(webview.html, /Global commands are loaded across workspaces\./);
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
): CommandVaultCommand {
  return {
    id,
    scope,
    name: `Command ${id}`,
    command: "echo test",
    description: null,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
  };
}
