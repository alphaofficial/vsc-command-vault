import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CommandVaultCommand } from "./model.ts";
import {
  COMMAND_VAULT_COPY_COMMAND_ID,
  COMMAND_VAULT_RUN_COMMAND_ID,
  COMMAND_VAULT_TERMINAL_NAME,
  createCommandVaultExecutionService,
  resolveStoredCommandForAction,
} from "./execution.ts";

const SAMPLE_COMMAND: CommandVaultCommand = {
  id: "command_workspace_dev",
  scope: "workspace",
  name: "Start app",
  command: "npm run dev",
  description: null,
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
};

describe("command vault execution service", () => {
  it("exports stable execution command identifiers", () => {
    assert.equal(COMMAND_VAULT_COPY_COMMAND_ID, "commandVault.copyCommand");
    assert.equal(COMMAND_VAULT_RUN_COMMAND_ID, "commandVault.runCommand");
  });

  it("reuses the active terminal and runs commands with a trailing newline", async () => {
    const terminalEvents = createTerminalRecorder();
    const execution = createCommandVaultExecutionService({
      clipboard: {
        writeText() {
          throw new Error("clipboard should not be used");
        },
      },
      terminals: {
        activeTerminal: terminalEvents.terminal,
        createTerminal() {
          throw new Error("active terminal should be reused");
        },
      },
    });

    await execution.runCommand(SAMPLE_COMMAND);

    assert.deepEqual(terminalEvents.showCalls, [false]);
    assert.deepEqual(terminalEvents.sendTextCalls, [
      {
        text: "npm run dev",
        addNewLine: true,
      },
    ]);
  });

  it("creates a Command Vault terminal and pastes commands without a newline", async () => {
    const terminalEvents = createTerminalRecorder();
    const createdTerminalNames: string[] = [];
    const execution = createCommandVaultExecutionService({
      clipboard: {
        writeText() {
          throw new Error("clipboard should not be used");
        },
      },
      terminals: {
        activeTerminal: undefined,
        createTerminal(name) {
          createdTerminalNames.push(name);
          return terminalEvents.terminal;
        },
      },
    });

    await execution.pasteCommand(SAMPLE_COMMAND);

    assert.deepEqual(createdTerminalNames, [COMMAND_VAULT_TERMINAL_NAME]);
    assert.deepEqual(terminalEvents.showCalls, [false]);
    assert.deepEqual(terminalEvents.sendTextCalls, [
      {
        text: "npm run dev",
        addNewLine: false,
      },
    ]);
  });

  it("copies the raw command text to the clipboard", async () => {
    const clipboardWrites: string[] = [];
    const execution = createCommandVaultExecutionService({
      clipboard: {
        async writeText(text) {
          clipboardWrites.push(text);
        },
      },
      terminals: {
        activeTerminal: undefined,
        createTerminal() {
          throw new Error("terminal should not be used");
        },
      },
    });

    await execution.copyCommand(SAMPLE_COMMAND);

    assert.deepEqual(clipboardWrites, ["npm run dev"]);
  });

  it("resolves stored commands by scope and warns when a workspace target is unavailable", async () => {
    const warnings: string[] = [];
    const storedGlobalCommand: CommandVaultCommand = {
      ...SAMPLE_COMMAND,
      id: "command_global_dev",
      scope: "global",
    };
    const repository = {
      async readGlobalCommands() {
        return [storedGlobalCommand];
      },
      async readWorkspaceCommands() {
        throw new Error("workspace commands should not be read");
      },
      async writeGlobalCommands() {},
      async writeWorkspaceCommands() {},
    };

    const resolvedGlobalCommand = await resolveStoredCommandForAction(
      "copy",
      {
        id: storedGlobalCommand.id,
        scope: storedGlobalCommand.scope,
      },
      {
        repository,
        window: {
          showWarningMessage(message) {
            warnings.push(message);
          },
        },
        workspace: {
          workspaceFolders: undefined,
        },
      },
    );
    const resolvedWorkspaceCommand = await resolveStoredCommandForAction(
      "run",
      {
        id: "workspace-missing",
        scope: "workspace",
      },
      {
        repository,
        window: {
          showWarningMessage(message) {
            warnings.push(message);
          },
        },
        workspace: {
          workspaceFolders: undefined,
        },
      },
    );

    assert.deepEqual(resolvedGlobalCommand, storedGlobalCommand);
    assert.equal(resolvedWorkspaceCommand, undefined);
    assert.deepEqual(warnings, [
      "Command Vault needs an open workspace to run workspace commands.",
    ]);
  });
});

function createTerminalRecorder(): {
  sendTextCalls: Array<{ addNewLine: boolean | undefined; text: string }>;
  showCalls: Array<boolean | undefined>;
  terminal: {
    sendText(text: string, addNewLine?: boolean): void;
    show(preserveFocus?: boolean): void;
  };
} {
  const showCalls: Array<boolean | undefined> = [];
  const sendTextCalls: Array<{ addNewLine: boolean | undefined; text: string }> = [];

  return {
    showCalls,
    sendTextCalls,
    terminal: {
      show(preserveFocus) {
        showCalls.push(preserveFocus);
      },
      sendText(text, addNewLine) {
        sendTextCalls.push({ text, addNewLine });
      },
    },
  };
}
