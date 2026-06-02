import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CommandVaultCommand } from "./model.ts";
import {
  COMMAND_VAULT_TERMINAL_NAME,
  createCommandVaultExecutionService,
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
