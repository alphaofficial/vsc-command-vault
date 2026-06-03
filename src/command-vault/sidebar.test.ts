import assert from "node:assert/strict";
import { describe, it } from "node:test";
import vm from "node:vm";

import type { CommandVaultCommand } from "./model.ts";
import {
  createCommandVaultSidebarProvider,
  loadCommandVaultSidebarState,
  renderCommandVaultSidebarHtml,
  type CommandVaultSidebarActionMessage,
  type CommandVaultSidebarMessage,
  type CommandVaultWebview,
} from "./sidebar.ts";

describe("command vault sidebar", () => {
  it("renders only the workspace section with simplified empty state when no commands exist", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder(),
      undefined,
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.match(html, />Workspace</);
    assert.doesNotMatch(html, />Global</);
    assert.match(html, /No workspace open/);
    assert.match(html, /Open a workspace folder to save workspace commands\./);
    assert.doesNotMatch(html, /No global commands yet/);
    assert.doesNotMatch(html, /global/i);
  });

  it("renders larger flat icon-only sidebar actions without button styling", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder(),
      [
        {
          uri: {
            fsPath: "/tmp/project-gamma",
          },
        },
      ],
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.doesNotMatch(html, /<h1>Command Vault<\/h1>/);
    assert.doesNotMatch(html, />Save reusable terminal commands for the current workspace or every workspace\.</);
    assert.match(html, /<header class="sidebar-toolbar" aria-label="Workspace Command Vault">\s*<div class="section-heading">\s*<h2 class="section-title" id="workspace-heading">Workspace<\/h2>\s*<\/div>\s*<div class="sidebar-toolbar-actions">/);
    assert.doesNotMatch(html, /Commands saved only for the open workspace\./);
    assert.match(html, /aria-label="Create command"/);
    assert.match(html, /data-command-vault-action="create"/);
    assert.match(html, /<button class="sidebar-action"\s+type="button"\s+data-command-vault-action="create"\s+aria-label="Create command"\s+title="Create command">\s*<span aria-hidden="true" class="action-icon">\+<\/span>\s*<\/button>/);
    assert.match(html, /<span aria-hidden="true" class="action-icon">\+<\/span>/);
    assert.doesNotMatch(html, /data-command-vault-action="search"/);
    assert.doesNotMatch(html, /title="Search commands"/);
    assert.doesNotMatch(html, /<span aria-hidden="true" class="action-icon">⌕<\/span>/);
    assert.doesNotMatch(html, /class="codicon codicon-add action-icon"><\/span>/);
    assert.doesNotMatch(html, /class="codicon codicon-search action-icon"><\/span>/);
    assert.doesNotMatch(html, />Add workspace command<\/button>/);
    assert.doesNotMatch(html, />Add global command<\/button>/);
    assert.doesNotMatch(html, />Search commands<\/button>/);
    assert.match(html, /appearance:\s*none/);
    assert.match(html, /border-radius:\s*0/);
    assert.match(html, /box-shadow:\s*none/);
    assert.match(html, /min-width:\s*0/);
    assert.match(html, /line-height:\s*1/);
    assert.match(html, /\.sidebar-toolbar\s*\{[^}]*display:\s*grid/s);
    assert.match(html, /\.sidebar-toolbar\s*\{[^}]*grid-template-columns:\s*1fr auto/s);
    assert.match(html, /\.sidebar-toolbar-actions\s*\{[^}]*justify-content:\s*flex-end/s);
    assert.match(html, /body\s*\{[^}]*font-size:\s*var\(--vscode-font-size\)/s);
    assert.match(html, /\.section-title\s*\{[^}]*font-size:\s*var\(--vscode-font-size\)/s);
    assert.match(html, /\.section-copy\s*\{[^}]*font-size:\s*calc\(var\(--vscode-font-size\) \* 0\.85\)/s);
    assert.match(html, /\.action-icon\s*\{[^}]*font-size:\s*24px/s);
    assert.match(html, /\.action-icon\s*\{[^}]*width:\s*24px/s);
    assert.match(html, /\.action-icon\s*\{[^}]*height:\s*24px/s);
    assert.doesNotMatch(html, /background:\s*var\(--vscode-button-background\)/);
    assert.doesNotMatch(html, /background:\s*var\(--vscode-button-secondaryBackground/);
    assert.doesNotMatch(html, /border:\s*1px solid var\(--vscode-button-border/);
    assert.doesNotMatch(html, /padding:\s*6px 10px/);
    assert.doesNotMatch(html, /radial-gradient/);
    assert.match(html, /"commandVault\.createCommand"/);
    assert.match(html, /if \(button\.disabled\) \{/);
  });

  it("shows sidebar search controls by default and filters cards fuzzily without a toolbar search action", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        workspaceCommands: [
          createCommand("workspace", "workspace-1", {
            name: "Start app",
            command: "npm run dev",
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

    assert.match(html, /<div class="sidebar-search">/);
    assert.doesNotMatch(html, /<div class="sidebar-search" hidden>/);
    assert.match(html, /<input class="sidebar-search-input" type="search" autocomplete="off" aria-label="Search commands" placeholder="Search commands" \/>/);
    assert.doesNotMatch(html, /if \(action === "search"\)/);
    assert.match(html, /function fuzzyMatches\(query, text\)/);
    assert.match(html, /const normalizedQuery = query\.trim\(\)\.toLowerCase\(\)/);
    assert.match(html, /if \(normalizedQuery\.length === 0\) \{\s*return true;\s*\}/);
    assert.match(html, /normalizedText\.indexOf\(character, searchIndex\)/);
    assert.doesNotMatch(html, /case "search"/);
  });

  it("renders a hidden-state CSS rule so filtered command cards leave the layout", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        workspaceCommands: [
          createCommand("workspace", "workspace-1"),
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

    assert.match(html, /\.command-card\[hidden\]\s*\{[^}]*display:\s*none/s);
  });

  it("filters command cards by fuzzy name and command matches at runtime", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        workspaceCommands: [
          createCommand("workspace", "workspace-1", {
            name: "Start app",
            command: "npm run dev",
            description: "Deployment helper text",
          }),
          createCommand("workspace", "workspace-2", {
            name: "Build assets",
            command: "npm run build",
            description: "Contains sapp in description only",
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
    const createForm = new FakeFormElement();
    const searchInput = new FakeInputElement();
    const matchingCard = new FakeElement({ searchText: "Start app npm run dev" });
    const descriptionOnlyCard = new FakeElement({ searchText: "Build assets npm run build" });
    const dom = createFakeSidebarDom({
      cards: [matchingCard, descriptionOnlyCard],
      createForm,
      editFormsById: {},
      searchInput,
    });

    runSidebarScript(html, dom);

    searchInput.value = "sapp";
    searchInput.dispatch("input");
    assert.equal(matchingCard.hidden, false);
    assert.equal(descriptionOnlyCard.hidden, true);

    searchInput.value = "   ";
    searchInput.dispatch("input");
    assert.equal(matchingCard.hidden, false);
    assert.equal(descriptionOnlyCard.hidden, false);
  });

  it("filters immediately on input events using only the command name and command text index", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        workspaceCommands: [
          createCommand("workspace", "workspace-1", {
            name: "Start app",
            command: "npm run dev",
            description: "Unique deployment helper text",
          }),
          createCommand("workspace", "workspace-2", {
            name: "Build assets",
            command: "npm run build",
            description: "Another visible helper text",
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
    const createForm = new FakeFormElement();
    const searchInput = new FakeInputElement();
    const nameAndCommandCard = new FakeElement({ searchText: "Start app npm run dev" });
    const descriptionOnlyCard = new FakeElement(
      { searchText: "Build assets npm run build" },
      "Build assets npm run build Unique deployment helper text",
    );
    const dom = createFakeSidebarDom({
      cards: [nameAndCommandCard, descriptionOnlyCard],
      createForm,
      editFormsById: {},
      searchInput,
    });

    runSidebarScript(html, dom);

    searchInput.value = "sta";
    searchInput.dispatch("input");
    assert.equal(nameAndCommandCard.hidden, false);
    assert.equal(descriptionOnlyCard.hidden, true);

    searchInput.value = "unique";
    searchInput.dispatch("input");
    assert.equal(nameAndCommandCard.hidden, true);
    assert.equal(descriptionOnlyCard.hidden, true);
  });

  it("limits fuzzy search indexing to command names and command text", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        workspaceCommands: [
          createCommand("workspace", "workspace-1", {
            name: "Start app",
            command: "npm run dev",
            description: "Unique deployment helper text",
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

    assert.match(html, /<li class="command-card" data-search-text="Start app npm run dev">/);
    assert.match(html, />Unique deployment helper text</);
    assert.doesNotMatch(html, /data-search-text="[^"]*Unique deployment helper text/);
  });

  it("does not forward sidebar-local search messages to the host callback", async () => {
    const receivedMessages: CommandVaultSidebarMessage[] = [];
    let receiveMessage:
      | ((message: unknown) => void | Promise<void>)
      | undefined;
    const provider = createCommandVaultSidebarProvider({
      onDidReceiveMessage(message) {
        receivedMessages.push(message);
      },
      repository: createRepositoryRecorder(),
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
    const webview: CommandVaultWebview = {
      html: "",
      onDidReceiveMessage(listener: (message: unknown) => void | Promise<void>) {
        receiveMessage = listener;
      },
      options: {},
    };

    await provider.resolveWebviewView({ webview });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "search",
    });

    assert.deepEqual(receivedMessages, []);
  });

  it("reveals the single create form without posting a legacy create action", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder(),
      [
        {
          uri: {
            fsPath: "/tmp/project-gamma",
          },
        },
      ],
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.match(html, /if \(action === "create"\) \{[\s\S]*form\.hidden = false;[\s\S]*return;[\s\S]*\}/);
  });

  it("rejects legacy host-level create action messages because create is sidebar-local", async () => {
    const receivedMessages: CommandVaultSidebarMessage[] = [];
    let receiveMessage:
      | ((message: unknown) => void | Promise<void>)
      | undefined;
    const provider = createCommandVaultSidebarProvider({
      onDidReceiveMessage(message) {
        receivedMessages.push(message);
      },
      repository: createRepositoryRecorder(),
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
    const webview: CommandVaultWebview = {
      html: "",
      onDidReceiveMessage(listener: (message: unknown) => void | Promise<void>) {
        receiveMessage = listener;
      },
      options: {},
    };

    await provider.resolveWebviewView({ webview });
    await receiveMessage?.({
      type: "commandVault.action",
      action: "create",
      target: {
        scope: "workspace",
      },
    });

    assert.deepEqual(receivedMessages, []);
  });

  it("renders one workspace-only command form", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder(),
      [
        {
          uri: {
            fsPath: "/tmp/project-gamma",
          },
        },
      ],
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.equal(html.match(/class="create-command-form"/g)?.length, 1);
    assert.match(html, /<form class="create-command-form" aria-label="Create command" hidden>/);
    assert.match(html, /<input name="scope" type="hidden" value="workspace" \/>/);
    assert.doesNotMatch(html, /<select name="scope"/);
    assert.doesNotMatch(html, /<option value="global"/);
    assert.match(html, /\{ scope: "workspace" \}/);
  });

  it("disables workspace-only create when no workspace can receive commands", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder(),
      undefined,
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.match(html, /aria-label="Create command" disabled/);
    assert.doesNotMatch(html, /<option value="workspace"/);
    assert.doesNotMatch(html, /<option value="global"/);
  });

  it("does not expose disabled or unavailable create scopes", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder(),
      [
        {
          uri: {
            fsPath: "/tmp/project-gamma",
          },
        },
      ],
      {
        defaultExecutionBehavior: "run",
        enableGlobalScope: false,
        enableWorkspaceScope: true,
      },
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.match(html, /<input name="scope" type="hidden" value="workspace" \/>/);
    assert.doesNotMatch(html, /<select name="scope"/);
    assert.doesNotMatch(html, /<option value="global"/);
  });

  it("does not render any global section or commands", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        globalCommands: [createCommand("global", "global-1")],
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

    assert.doesNotMatch(html, /global/i);
    assert.doesNotMatch(html, /global-1/);
    assert.doesNotMatch(html, /global-heading/);
    assert.doesNotMatch(html, /global-section/);
  });

  it("keeps the single create form hidden until a create action is chosen", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder(),
      [
        {
          uri: {
            fsPath: "/tmp/project-gamma",
          },
        },
      ],
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.match(html, /<form class="create-command-form"[^>]*hidden/);
    assert.match(html, /data-command-vault-action="create"/);
    assert.match(html, /action === "create"/);
    assert.match(html, /form\.hidden = false/);
    assert.match(html, /name="name"/);
    assert.match(html, /name="command"/);
    assert.match(html, /name="description"/);
    assert.match(html, /name="scope"/);
    assert.match(html, /Save command/);
    assert.match(html, /<span aria-hidden="true" class="action-icon">✓<\/span>/);
    assert.match(html, /document\.addEventListener\("submit"/);
    assert.match(html, /typeof name !== "string"/);
    assert.match(html, /typeof command !== "string"/);
    assert.match(html, /typeof description !== "string"/);
    assert.match(html, /"commandVault\.createCommand"/);
    assert.match(html, /name,/);
    assert.match(html, /command,/);
    assert.match(html, /description,/);
    assert.doesNotMatch(html, /name: formData\.get\("name"\)/);
    assert.doesNotMatch(html, /command: formData\.get\("command"\)/);
    assert.doesNotMatch(html, /description: formData\.get\("description"\)/);
  });

  it("renders cancel buttons that hide create and edit forms", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        workspaceCommands: [createCommand("workspace", "workspace-1")],
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

    assert.match(html, /type="button"[^>]*data-command-vault-action="cancel-form"[^>]*aria-label="Cancel create command"/);
    assert.match(html, /type="button"[^>]*data-command-vault-action="cancel-form"[^>]*aria-label="Cancel editing Command workspace-1 command"/);
    assert.match(html, /aria-label="Cancel create command"[^>]*>\s*<span aria-hidden="true" class="action-icon">×<\/span>/);
    assert.match(html, /aria-label="Cancel editing Command workspace-1 command"[^>]*>\s*<span aria-hidden="true" class="action-icon">×<\/span>/);
    assert.doesNotMatch(html, /codicon codicon-close action-icon/);
    assert.match(html, /if \(action === "cancel-form"\) \{[\s\S]*const form = button\.closest\("form"\);[\s\S]*form\.hidden = true;[\s\S]*return;[\s\S]*\}/);
  });

  it("renders save and cancel form buttons horizontally with smaller icons", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        workspaceCommands: [createCommand("workspace", "workspace-1")],
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

    assert.match(html, /<div class="form-actions">\s*<button class="sidebar-action form-action" type="submit" aria-label="Save command"/);
    assert.match(html, /aria-label="Save command"[^>]*>[\s\S]*?<\/button>\s*<button class="sidebar-action form-action secondary" type="button" data-command-vault-action="cancel-form" aria-label="Cancel create command"/);
    assert.match(html, /<div class="form-actions">\s*<button class="sidebar-action form-action" type="submit" aria-label="Save Command workspace-1 command"/);
    assert.match(html, /\.form-actions\s*\{[^}]*display:\s*flex/s);
    assert.match(html, /\.form-actions\s*\{[^}]*align-items:\s*center/s);
    assert.match(html, /\.form-actions\s*\{[^}]*gap:\s*6px/s);
    assert.match(html, /\.form-action\s+\.action-icon\s*\{[^}]*font-size:\s*16px/s);
    assert.match(html, /\.form-action\s+\.action-icon\s*\{[^}]*width:\s*16px/s);
    assert.match(html, /\.form-action\s+\.action-icon\s*\{[^}]*height:\s*16px/s);
  });

  it("aligns the Workspace heading and add icon on the same horizontal centerline", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder(),
      [
        {
          uri: {
            fsPath: "/tmp/project-gamma",
          },
        },
      ],
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.match(html, /\.sidebar-toolbar\s*\{[^}]*align-items:\s*center/s);
    assert.match(html, /\.sidebar-toolbar-actions\s*\{[^}]*align-items:\s*center/s);
  });

  it("create, edit, and cancel buttons update only sidebar-local forms at runtime", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        workspaceCommands: [createCommand("workspace", "workspace-1")],
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
    const createForm = new FakeFormElement();
    const editForm = new FakeFormElement({ commandId: "workspace-1" });
    const searchInput = new FakeInputElement();
    const messages: unknown[] = [];
    const dom = createFakeSidebarDom({
      cards: [],
      createForm,
      editFormsById: { "workspace-1": editForm },
      messages,
      searchInput,
    });

    runSidebarScript(html, dom);

    dom.click(new FakeButtonElement({ action: "create" }));
    assert.equal(createForm.hidden, false);
    assert.deepEqual(messages, []);

    const createCancel = new FakeButtonElement({ action: "cancel-form", form: createForm });
    dom.click(createCancel);
    assert.equal(createForm.hidden, true);

    dom.click(new FakeButtonElement({ action: "edit", commandId: "workspace-1" }));
    assert.equal(editForm.hidden, false);

    const editCancel = new FakeButtonElement({ action: "cancel-form", form: editForm });
    dom.click(editCancel);
    assert.equal(editForm.hidden, true);
    assert.equal(createForm.hidden, true);
  });

  it("uses the same inline form markup for editing commands", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        workspaceCommands: [createCommand("workspace", "workspace-1")],
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

    assert.match(html, /<form class="create-command-form edit-command-form" aria-label="Edit Command workspace-1 command" hidden data-command-id="workspace-1">/);
    assert.match(html, /<input name="scope" type="hidden" value="workspace" \/>/);
    assert.match(html, /<input name="name" type="text" autocomplete="off" required value="Command workspace-1" \/>/);
    assert.match(html, /<textarea name="command" required>echo test<\/textarea>/);
    assert.match(html, /const isEditForm = form\.classList\.contains\("edit-command-form"\)/);
    assert.match(html, /const commandId = form\.dataset\.commandId/);
    assert.match(html, /if \(isEditForm && typeof commandId !== "string"\)/);
    assert.match(html, /type: isEditForm \? "commandVault\.updateCommand" : "commandVault\.createCommand"/);
    assert.match(html, /id: commandId/);
    assert.match(html, /data-command-vault-action="edit"/);
    assert.match(html, /Save Command workspace-1 command/);
  });

  it("omits workspace and global empty-state helper text", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder(),
      [
        {
          uri: {
            fsPath: "/tmp/project-gamma",
          },
        },
      ],
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.doesNotMatch(html, /No workspace commands yet/);
    assert.doesNotMatch(html, /Add a workspace command from this panel\./);
    assert.doesNotMatch(html, /Add a global command from this panel\./);
    assert.doesNotMatch(html, /global/i);
  });

  it("renders disabled scope states and skips loading disabled storage", async () => {
    const repository = createRepositoryRecorder({
      globalCommands: [createCommand("global", "global-1")],
      workspaceCommands: [createCommand("workspace", "workspace-1")],
    });
    const state = await loadCommandVaultSidebarState(
      repository,
      [
        {
          uri: {
            fsPath: "/tmp/project-gamma",
          },
        },
      ],
      {
        defaultExecutionBehavior: "run",
        enableGlobalScope: false,
        enableWorkspaceScope: false,
      },
    );

    const html = renderCommandVaultSidebarHtml(state);

    assert.match(html, /Workspace commands disabled/);
    assert.doesNotMatch(html, /Global commands disabled/);
    assert.equal(repository.readGlobalCommandsCalls, 0);
    assert.deepEqual(repository.readWorkspaceCommandsCalls, []);
  });

  it("renders workspace command cards with visible actions", async () => {
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
    assert.doesNotMatch(html, /pnpm lint/);
    assert.match(html, /data-command-vault-action="run"/);
    assert.match(html, /data-command-vault-action="copy"/);
    assert.match(html, /data-command-vault-action="edit"/);
    assert.match(html, /data-command-vault-action="delete"/);
    assert.doesNotMatch(html, /saved commands/);
  });

  it("renders command actions inline in the title row with smaller icons", async () => {
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        workspaceCommands: [
          createCommand("workspace", "workspace-1", {
            command: "npm run dev",
            name: "Run server",
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

    assert.match(html, /<div class="command-title-row">\s*<h3 class="command-name">Run server<\/h3>\s*<div class="command-actions" aria-label="Command actions">[\s\S]*data-command-vault-action="run"[\s\S]*<\/div>\s*<\/div>\s*<pre class="command-text" title="npm run dev">npm run dev<\/pre>/);
    assert.match(html, /\.command-title-row\s*\{[^}]*display:\s*flex/s);
    assert.match(html, /\.command-title-row\s*\{[^}]*align-items:\s*center/s);
    assert.match(html, /\.command-actions\s*\{[^}]*justify-content:\s*flex-end/s);
    assert.match(html, /\.command-action\s+\.action-icon\s*\{[^}]*font-size:\s*18px/s);
    assert.match(html, /\.command-action\s+\.action-icon\s*\{[^}]*width:\s*18px/s);
    assert.match(html, /\.command-action\s+\.action-icon\s*\{[^}]*height:\s*18px/s);
    assert.match(html, /\.command-name\s*\{[^}]*font-size:\s*calc\(var\(--vscode-font-size\) \* 0\.92\)/s);
    assert.match(html, /\.command-text\s*\{[^}]*font-size:\s*var\(--vscode-font-size\)/s);
  });

  it("truncates long command strings in command cards", async () => {
    const longCommand = "npm run build -- --configuration production --verbose --stats-json --source-map --aot";
    const state = await loadCommandVaultSidebarState(
      createRepositoryRecorder({
        workspaceCommands: [
          createCommand("workspace", "workspace-1", {
            command: longCommand,
            name: "Long build",
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

    assert.match(html, /<pre class="command-text" title="npm run build -- --configuration production --verbose --stats-json --source-map --aot">npm run build -- --configuration production --verbose …<\/pre>/);
    assert.match(html, /\.command-text\s*\{[^}]*overflow:\s*hidden/s);
    assert.match(html, /\.command-text\s*\{[^}]*text-overflow:\s*ellipsis/s);
    assert.match(html, /\.command-text\s*\{[^}]*white-space:\s*nowrap/s);
  });

  it("forwards only valid webview messages to the host callback", async () => {
    const receivedMessages: CommandVaultSidebarMessage[] = [];
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
    const webview: CommandVaultWebview = {
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
      action: "create",
      target: {
        scope: "workspace",
      },
    });
    await receiveMessage?.({
      type: "commandVault.createCommand",
      target: {
        scope: "global",
      },
      input: {
        name: "Lint",
        command: "npm run lint",
        description: "Run lint checks",
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
    await receiveMessage?.({
      type: "commandVault.action",
      action: "copy",
      target: {
        id: 7,
        scope: "global",
      },
    });
    await receiveMessage?.({
      type: "commandVault.createCommand",
      target: {
        scope: "workspace",
      },
      input: {
        name: "   ",
        command: "npm test",
        description: "",
      },
    });
    await receiveMessage?.({
      type: "commandVault.createCommand",
      target: {
        scope: "workspace",
      },
      input: {
        name: "Test",
        command: "   ",
        description: "",
      },
    });

    assert.equal(webview.options!.enableScripts, true);
    assert.deepEqual(receivedMessages, [
      {
        type: "commandVault.action",
        action: "paste",
        target: {
          id: "workspace-1",
          scope: "workspace",
        },
      },
    ]);
  });

  it("loads only workspace commands into the sidebar provider before rendering", async () => {
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
    const webview: CommandVaultWebview = {
      html: "",
      options: {},
    };

    await provider.resolveWebviewView({ webview });

    assert.match(webview.html, /workspace-1/);
    assert.match(webview.html, /workspace-2/);
    assert.doesNotMatch(webview.html, /global-1/);
    assert.equal(repository.readGlobalCommandsCalls, 0);
    assert.equal(repository.readWorkspaceCommandsCalls.length, 1);
  });

  it("refreshes the active webview with updated workspace commands", async () => {
    const repository = createRepositoryRecorder({
      globalCommands: [createCommand("global", "global-1", { name: "Lint" })],
      workspaceCommands: [
        createCommand("workspace", "workspace-1", { name: "Test" }),
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
    const webview: CommandVaultWebview = {
      html: "",
      options: {},
    };

    await provider.resolveWebviewView({ webview });
    repository.setCommands({
      globalCommands: [createCommand("global", "global-2", { name: "Build" })],
      workspaceCommands: [
        createCommand("workspace", "workspace-2", { name: "Preview" }),
      ],
    });

    await provider.refresh();

    assert.doesNotMatch(webview.html, />Build</);
    assert.match(webview.html, />Preview</);
    assert.doesNotMatch(webview.html, />Lint</);
    assert.doesNotMatch(webview.html, />Test</);
    assert.equal(repository.readGlobalCommandsCalls, 0);
    assert.equal(repository.readWorkspaceCommandsCalls.length, 2);
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
  setCommands(next: {
    globalCommands?: CommandVaultCommand[];
    workspaceCommands?: CommandVaultCommand[];
  }): void;
  readGlobalCommands(): Promise<CommandVaultCommand[]>;
  readWorkspaceCommands(workspaceId: string | null): Promise<CommandVaultCommand[]>;
  writeGlobalCommands(): Promise<void>;
  writeWorkspaceCommands(): Promise<void>;
} {
  let readGlobalCommandsCalls = 0;
  const readWorkspaceCommandsCalls: Array<string | null> = [];
  let currentGlobalCommands = [...globalCommands];
  let currentWorkspaceCommands = [...workspaceCommands];

  return {
    get readGlobalCommandsCalls() {
      return readGlobalCommandsCalls;
    },
    readWorkspaceCommandsCalls,
    setCommands(next) {
      if (next.globalCommands) {
        currentGlobalCommands = [...next.globalCommands];
      }

      if (next.workspaceCommands) {
        currentWorkspaceCommands = [...next.workspaceCommands];
      }
    },
    async readGlobalCommands() {
      readGlobalCommandsCalls += 1;
      return [...currentGlobalCommands];
    },
    async readWorkspaceCommands(workspaceId) {
      readWorkspaceCommandsCalls.push(workspaceId);
      return [...currentWorkspaceCommands];
    },
    async writeGlobalCommands() {},
    async writeWorkspaceCommands() {},
  };
}

class FakeElement {
  hidden = false;
  readonly dataset: Record<string, string>;

  constructor(dataset: Record<string, string> = {}) {
    this.dataset = dataset;
  }
}

class FakeFormElement extends FakeElement {}

class FakeInputElement extends FakeElement {
  value = "";
  private readonly listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}

class FakeButtonElement extends FakeElement {
  disabled = false;
  private readonly form?: FakeFormElement;

  constructor({
    action,
    commandId,
    form,
  }: {
    action: string;
    commandId?: string;
    form?: FakeFormElement;
  }) {
    super({
      commandVaultAction: action,
      ...(commandId ? { commandId } : {}),
    });
    this.form = form;
  }

  closest(selector: string): FakeButtonElement | FakeFormElement | undefined {
    if (selector === "[data-command-vault-action]") {
      return this;
    }

    if (selector === "form") {
      return this.form;
    }

    return undefined;
  }
}

function createFakeSidebarDom({
  cards,
  createForm,
  editFormsById,
  messages = [],
  searchInput,
}: {
  cards: FakeElement[];
  createForm: FakeFormElement;
  editFormsById: Record<string, FakeFormElement>;
  messages?: unknown[];
  searchInput: FakeInputElement;
}): {
  click(button: FakeButtonElement): void;
  context: Record<string, unknown>;
} {
  const listeners = new Map<string, Array<(event: { target: unknown }) => void>>();
  const document = {
    addEventListener(type: string, listener: (event: { target: unknown }) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    querySelector(selector: string) {
      if (selector === ".create-command-form") {
        return createForm;
      }

      if (selector === ".sidebar-search-input") {
        return searchInput;
      }

      const editMatch = selector.match(/^\.edit-command-form\[data-command-id="(.+)"\]$/);
      if (editMatch) {
        return editFormsById[editMatch[1]];
      }

      return undefined;
    },
    querySelectorAll(selector: string) {
      return selector === ".command-card" ? cards : [];
    },
  };

  return {
    click(button) {
      for (const listener of listeners.get("click") ?? []) {
        listener({ target: button });
      }
    },
    context: {
      acquireVsCodeApi: () => ({
        postMessage(message: unknown) {
          messages.push(message);
        },
      }),
      CSS: {
        escape(value: string) {
          return value;
        },
      },
      document,
      Element: FakeElement,
      FormData: class {},
      HTMLButtonElement: FakeButtonElement,
      HTMLElement: FakeElement,
      HTMLFormElement: FakeFormElement,
      HTMLInputElement: FakeInputElement,
    },
  };
}

function runSidebarScript(
  html: string,
  dom: { context: Record<string, unknown> },
): void {
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

  assert.ok(script);
  vm.runInNewContext(script, dom.context);
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
