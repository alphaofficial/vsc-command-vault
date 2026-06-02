const assert = require("node:assert/strict");
const test = require("node:test");

const {
  COMMAND_VAULT_TERMINAL_NAME,
  createCommandVaultExecutionService,
} = require("../out/command-vault/execution.js");

const SAMPLE_COMMAND = {
  id: "command_workspace_dev",
  scope: "workspace",
  name: "Start app",
  command: "npm run dev",
  description: null,
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
};

test("compiled execution service reuses the active terminal for run", async () => {
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

test("compiled execution service creates a named terminal for paste", async () => {
  const terminalEvents = createTerminalRecorder();
  const createdTerminalNames = [];
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

test("compiled execution service copies command text to the clipboard", async () => {
  const clipboardWrites = [];
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

function createTerminalRecorder() {
  const showCalls = [];
  const sendTextCalls = [];

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
