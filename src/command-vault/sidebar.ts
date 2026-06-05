import {
  createWorkspaceId,
  isCommandVaultScope,
  type CommandVaultCommand,
} from "./model.ts";
import type {
  CommandVaultWorkspace,
  CommandVaultWorkspaceFolder,
} from "./create-command.ts";
import type { CommandVaultRepository } from "./repository.ts";
import {
  DEFAULT_COMMAND_VAULT_SETTINGS,
  type CommandVaultSettings,
} from "./settings.ts";

export interface CommandVaultWebview {
  html: string;
  onDidReceiveMessage?(
    listener: (message: unknown) => void | Promise<void>,
  ): { dispose(): unknown } | void;
  options?: {
    enableScripts?: boolean;
  };
}

export interface CommandVaultWebviewView {
  webview: CommandVaultWebview;
}

export interface CommandVaultWebviewViewProvider {
  resolveWebviewView(
    webviewView: CommandVaultWebviewView,
  ): void | Promise<void>;
}

export interface CommandVaultSidebarController
  extends CommandVaultWebviewViewProvider {
  refresh(): Promise<void>;
}

export interface CreateCommandVaultSidebarProviderOptions {
  getSettings?: () => CommandVaultSettings;
  onDidReceiveMessage?: (
    message: CommandVaultSidebarMessage,
  ) => void | Promise<void>;
  repository: CommandVaultRepository;
  workspace: CommandVaultWorkspace;
}

export interface CommandVaultSidebarState {
  enableGlobalScope: boolean;
  enableWorkspaceScope: boolean;
  globalCommands: readonly CommandVaultCommand[];
  hasWorkspace: boolean;
  workspaceCommands: readonly CommandVaultCommand[];
}

export type CommandVaultSidebarAction =
  | "copy"
  | "cancel-form"
  | "create"
  | "delete"
  | "edit"
  | "export"
  | "import"
  | "paste"
  | "run";

export interface CommandVaultSidebarActionMessage {
  action: CommandVaultSidebarAction;
  target?: {
    id?: string;
    scope: CommandVaultCommand["scope"];
  };
  type: "commandVault.action";
}

export interface CommandVaultSidebarCreateCommandMessage {
  input: {
    command: string;
    description: string;
    name: string;
  };
  target: {
    scope: CommandVaultCommand["scope"];
  };
  type: "commandVault.createCommand";
}

export interface CommandVaultSidebarUpdateCommandMessage {
  input: {
    command: string;
    description: string;
    name: string;
  };
  target: {
    id: string;
    scope: CommandVaultCommand["scope"];
  };
  type: "commandVault.updateCommand";
}

export type CommandVaultSidebarMessage =
  | CommandVaultSidebarActionMessage
  | CommandVaultSidebarCreateCommandMessage
  | CommandVaultSidebarUpdateCommandMessage;

export function createCommandVaultSidebarProvider(
  options: CreateCommandVaultSidebarProviderOptions,
): CommandVaultSidebarController {
  let activeWebviewView: CommandVaultWebviewView | undefined;

  const refresh = async () => {
    if (!activeWebviewView) {
      return;
    }

    const settings = options.getSettings?.() ?? DEFAULT_COMMAND_VAULT_SETTINGS;
    const state = await loadCommandVaultSidebarState(
      options.repository,
      options.workspace.workspaceFolders,
      settings,
    );

    activeWebviewView.webview.html = renderCommandVaultSidebarHtml(state);
  };

  return {
    refresh,
    async resolveWebviewView(webviewView) {
      activeWebviewView = webviewView;

      webviewView.webview.options = {
        ...webviewView.webview.options,
        enableScripts: true,
      };
      webviewView.webview.onDidReceiveMessage?.(async (message) => {
        const actionMessage = parseCommandVaultSidebarMessage(message);

        if (!actionMessage || !options.onDidReceiveMessage) {
          return;
        }

        await options.onDidReceiveMessage(actionMessage);
      });
      await refresh();
    },
  };
}

export async function loadCommandVaultSidebarState(
  repository: CommandVaultRepository,
  workspaceFolders: readonly CommandVaultWorkspaceFolder[] | undefined,
  settings: CommandVaultSettings = DEFAULT_COMMAND_VAULT_SETTINGS,
): Promise<CommandVaultSidebarState> {
  const workspaceFolderPath = workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolderPath) {
    return {
      enableGlobalScope: settings.enableGlobalScope,
      enableWorkspaceScope: settings.enableWorkspaceScope,
      hasWorkspace: false,
      workspaceCommands: [],
      globalCommands: [],
    };
  }

  if (!settings.enableWorkspaceScope) {
    return {
      enableGlobalScope: settings.enableGlobalScope,
      enableWorkspaceScope: false,
      hasWorkspace: true,
      workspaceCommands: [],
      globalCommands: [],
    };
  }

  const workspaceId = createWorkspaceId(workspaceFolderPath);
  const workspaceCommands = await repository.readWorkspaceCommands(workspaceId);

  return {
    enableGlobalScope: settings.enableGlobalScope,
    enableWorkspaceScope: settings.enableWorkspaceScope,
    hasWorkspace: true,
    workspaceCommands,
    globalCommands: [],
  };
}

export function renderCommandVaultSidebarHtml(
  state: CommandVaultSidebarState,
): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Command Vault</title>
    <style>
      :root {
        color-scheme: light dark;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 16px;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background: var(--vscode-sideBar-background);
      }

      main {
        display: grid;
        gap: 16px;
      }

      .sidebar-toolbar {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
      }

      .section-title {
        margin: 0;
      }

      .section-copy,
      .section-state {
        margin: 0;
        line-height: 1.45;
      }

      .section {
        display: grid;
        gap: 10px;
      }

      details.section > .section-heading {
        cursor: pointer;
        list-style: none;
      }

      details.section > .section-heading::-webkit-details-marker {
        display: none;
      }

      .section-heading {
        display: grid;
        gap: 4px;
      }

      .section-title {
        font-size: var(--vscode-font-size);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .section-copy {
        color: var(--vscode-descriptionForeground);
        font-size: calc(var(--vscode-font-size) * 0.85);
      }

      .section-state {
        padding: 14px;
        border: 1px dashed var(--vscode-panel-border);
        background: color-mix(in srgb, var(--vscode-editor-background) 65%, transparent);
      }

      .section-state strong {
        display: block;
        margin-bottom: 4px;
        font-size: var(--vscode-font-size);
      }

      .sidebar-toolbar-actions,
      .section-state-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .sidebar-toolbar-actions {
        align-items: center;
        justify-content: flex-end;
      }

      .section-state-actions {
        margin-top: 10px;
      }

      .command-list {
        display: grid;
        gap: 12px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .command-card {
        display: grid;
        gap: 12px;
        padding: 14px;
        border: 1px solid var(--vscode-panel-border);
        background: color-mix(in srgb, var(--vscode-editor-background) 82%, transparent);
      }

      .command-card[hidden] {
        display: none;
      }

      .command-copy-block {
        display: grid;
        gap: 8px;
      }

      .command-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .command-name {
        margin: 0;
        font-size: calc(var(--vscode-font-size) * 0.92);
        font-weight: 700;
      }

      .command-description {
        margin: 0;
        color: var(--vscode-descriptionForeground);
        font-size: calc(var(--vscode-font-size) * 0.9);
        line-height: 1.4;
      }

      .command-text {
        margin: 0;
        padding: 10px 12px;
        overflow-x: auto;
        background: var(--vscode-textCodeBlock-background, color-mix(in srgb, var(--vscode-editor-background) 88%, black));
        color: var(--vscode-textPreformat-foreground, var(--vscode-foreground));
        font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
        font-size: var(--vscode-font-size);
        line-height: 1.45;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .command-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
        margin-left: auto;
      }

      .sidebar-action,
      .command-action {
        appearance: none;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        min-width: 0;
        padding: 0;
        font: inherit;
        font-size: var(--vscode-font-size);
        line-height: 1;
        cursor: pointer;
        color: var(--vscode-icon-foreground, var(--vscode-foreground));
        background: transparent;
      }

      .sidebar-action.secondary,
      .command-action.secondary {
        color: var(--vscode-descriptionForeground, var(--vscode-foreground));
      }

      .sidebar-action:hover,
      .command-action:hover {
        color: var(--vscode-foreground);
      }

      .sidebar-action:disabled {
        cursor: default;
        opacity: 0.45;
      }

      .action-icon {
        display: inline-grid;
        min-width: 24px;
        height: 24px;
        place-items: center;
        font-size: 24px;
      }

      .action-text {
        font-size: calc(var(--vscode-font-size) * 0.85);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .command-action .action-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }

      .create-command-form {
        display: grid;
        gap: 8px;
        margin-top: 10px;
      }

      .create-command-form[hidden] {
        display: none;
      }

      .create-command-form label {
        display: grid;
        gap: 4px;
        color: var(--vscode-descriptionForeground);
        font-size: var(--vscode-font-size);
      }

      .create-command-form input,
      .create-command-form select,
      .create-command-form textarea {
        width: 100%;
        border: 1px solid var(--vscode-input-border, transparent);
        padding: 6px 8px;
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        font: inherit;
      }

      .create-command-form textarea {
        min-height: 64px;
        resize: vertical;
      }

      .form-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        justify-self: start;
      }

      .form-action .action-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }

      .sidebar-search {
        display: grid;
        gap: 8px;
      }

      .sidebar-search[hidden] {
        display: none;
      }

      .sidebar-search-input {
        width: 100%;
        border: 1px solid var(--vscode-input-border, transparent);
        padding: 6px 8px;
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        font: inherit;
      }
    </style>
  </head>
  <body>
    <main>
      <header class="sidebar-toolbar" aria-label="Workspace Command Vault">
        <div class="section-heading">
          <h2 class="section-title" id="workspace-heading">Workspace</h2>
        </div>
        <div class="sidebar-toolbar-actions">
          ${renderSidebarActionButton("Export commands", "export", undefined, false, "secondary")}
          ${renderSidebarActionButton("Import commands", "import", undefined, false, "secondary")}
          ${renderSidebarActionButton("Create command", "create", undefined, !canCreateCommand(state))}
        </div>
      </header>
      <div class="sidebar-search">
        <input class="sidebar-search-input" type="search" autocomplete="off" aria-label="Search commands" placeholder="Search commands" />
      </div>
      ${renderCreateCommandForm(state)}
      <section class="section" aria-labelledby="workspace-heading">
        ${renderWorkspaceSectionContent(state)}
      </section>
    </main>
    <script>
      const vscode = acquireVsCodeApi();

      document.addEventListener("click", (event) => {
        const target = event.target;

        if (!(target instanceof Element)) {
          return;
        }

        const button = target.closest("[data-command-vault-action]");

        if (!(button instanceof HTMLButtonElement)) {
          return;
        }

        if (button.disabled) {
          return;
        }

        const action = button.dataset.commandVaultAction;
        const id = button.dataset.commandId;
        const scope = button.dataset.commandScope;

        if (action === "create") {
          const form = document.querySelector('.create-command-form');

          if (form instanceof HTMLFormElement) {
            form.hidden = false;
          }

          return;
        }

        if (action === "cancel-form") {
          const form = button.closest("form");

          if (form instanceof HTMLFormElement) {
            form.hidden = true;
          }

          return;
        }

        if (action === "edit") {
          const form = id ? document.querySelector('.edit-command-form[data-command-id="' + CSS.escape(id) + '"]') : undefined;

          if (form instanceof HTMLFormElement) {
            form.hidden = false;
          }

          return;
        }

        if (!action) {
          return;
        }

        const message = {
          type: "commandVault.action",
          action,
        };

        if (scope) {
          message.target = { scope };
        }

        if (id && message.target) {
          message.target.id = id;
        }

        vscode.postMessage(message);
      });

      document.addEventListener("submit", (event) => {
        const form = event.target;

        if (!(form instanceof HTMLFormElement) || !form.classList.contains("create-command-form")) {
          return;
        }

        event.preventDefault();

        const formData = new FormData(form);
        const name = formData.get("name");
        const command = formData.get("command");
        const description = formData.get("description");
        const isEditForm = form.classList.contains("edit-command-form");
        const commandId = form.dataset.commandId;

        if (
          typeof name !== "string" ||
          typeof command !== "string" ||
          typeof description !== "string"
        ) {
          return;
        }

        if (isEditForm && typeof commandId !== "string") {
          return;
        }

        vscode.postMessage({
          type: isEditForm ? "commandVault.updateCommand" : "commandVault.createCommand",
          target: isEditForm
            ? { id: commandId, scope: "workspace" }
            : { scope: "workspace" },
          input: {
            name,
            command,
            description,
          },
        });

        form.hidden = true;
      });

      const searchInput = document.querySelector(".sidebar-search-input");

      if (searchInput instanceof HTMLInputElement) {
        searchInput.addEventListener("input", () => {
          const query = searchInput.value;
          const cards = document.querySelectorAll(".command-card");

          cards.forEach((card) => {
            if (!(card instanceof HTMLElement)) {
              return;
            }

            const searchableText = card.dataset.searchText ?? "";
            card.hidden = !fuzzyMatches(query, searchableText);
          });
        });
      }

      function fuzzyMatches(query, text) {
        const normalizedQuery = query.trim().toLowerCase();
        const normalizedText = text.toLowerCase();

        if (normalizedQuery.length === 0) {
          return true;
        }

        let searchIndex = 0;

        for (const character of normalizedQuery) {
          const matchIndex = normalizedText.indexOf(character, searchIndex);

          if (matchIndex === -1) {
            return false;
          }

          searchIndex = matchIndex + 1;
        }

        return true;
      }
    </script>
  </body>
</html>`;
}

function renderWorkspaceSectionContent(state: CommandVaultSidebarState): string {
  if (!state.enableWorkspaceScope) {
    return renderSectionState(
      "Workspace commands disabled",
      "Enable the workspace scope setting to view workspace commands.",
    );
  }

  if (!state.hasWorkspace) {
    return renderSectionState(
      "No workspace open",
      "Open a workspace folder to save workspace commands.",
    );
  }

  if (state.workspaceCommands.length === 0) {
    return "";
  }

  return renderCommandList(state.workspaceCommands);
}

function renderSectionState(
  title: string,
  copy: string,
  actionHtml?: string,
): string {
  return [
    '<div class="section-state">',
    `<strong>${escapeHtml(title)}</strong>`,
    copy ? `<span>${escapeHtml(copy)}</span>` : "",
    actionHtml ? `<div class="section-state-actions">${actionHtml}</div>` : "",
    "</div>",
  ].join("");
}

function renderSidebarActionButton(
  label: string,
  action: "create" | "export" | "import",
  scope?: CommandVaultCommand["scope"],
  disabled?: boolean,
  variant?: "secondary",
): string {
  const className = variant ? `sidebar-action ${variant}` : "sidebar-action";
  const icon = getCommandActionIcon(action);

  return [
    `<button class="${className}"`,
    ' type="button"',
    ` data-command-vault-action="${escapeHtmlAttribute(action)}"`,
    scope ? ` data-command-scope="${escapeHtmlAttribute(scope)}"` : "",
    ` aria-label="${escapeHtmlAttribute(label)}"`,
    disabled ? " disabled" : "",
    ` title="${escapeHtmlAttribute(label)}">`,
    `<span aria-hidden="true" class="${action === "export" || action === "import" ? "action-text" : "action-icon"}">${escapeHtml(icon)}</span>`,
    "</button>",
  ].join("");
}

function canCreateCommand(state: CommandVaultSidebarState): boolean {
  return canCreateWorkspaceCommand(state);
}

function renderCreateCommandForm(state: CommandVaultSidebarState): string {
  const canCreateWorkspace = canCreateWorkspaceCommand(state);

  return [
    '<form class="create-command-form" aria-label="Create command" hidden>',
    canCreateWorkspace ? '<input name="scope" type="hidden" value="workspace" />' : "",
    renderCommandFormFields(),
    '<div class="form-actions">',
    '<button class="sidebar-action form-action" type="submit" aria-label="Save command" title="Save command"><span aria-hidden="true" class="action-icon">✓</span></button>',
    '<button class="sidebar-action form-action secondary" type="button" data-command-vault-action="cancel-form" aria-label="Cancel create command" title="Cancel create command"><span aria-hidden="true" class="action-icon">×</span></button>',
    '</div>',
    "</form>",
  ].join("");
}

function renderCommandFormFields(command?: CommandVaultCommand): string {
  return [
    `<label>Name<input name="name" type="text" autocomplete="off" required${command ? ` value="${escapeHtmlAttribute(command.name)}"` : ""} /></label>`,
    `<label>Command<textarea name="command" required>${command ? escapeHtml(command.command) : ""}</textarea></label>`,
    `<label>Description<input name="description" type="text" autocomplete="off"${command?.description ? ` value="${escapeHtmlAttribute(command.description)}"` : ""} /></label>`,
  ].join("");
}

function canCreateWorkspaceCommand(state: CommandVaultSidebarState): boolean {
  return state.enableWorkspaceScope && state.hasWorkspace;
}

function renderCommandList(commands: readonly CommandVaultCommand[]): string {
  return [
    '<ul class="command-list">',
    commands.map((command) => renderCommandCard(command)).join(""),
    "</ul>",
  ].join("");
}

function renderCommandCard(command: CommandVaultCommand): string {
  const description = command.description
    ? `<p class="command-description">${escapeHtml(command.description)}</p>`
    : "";

  return [
    `<li class="command-card" data-search-text="${escapeHtmlAttribute([command.name, command.command].join(" "))}">`,
    '<div class="command-copy-block">',
    '<div class="command-title-row">',
    `<h3 class="command-name">${escapeHtml(command.name)}</h3>`,
    '<div class="command-actions" aria-label="Command actions">',
    renderActionButton("Run", "run", command),
    renderActionButton("Paste", "paste", command, "secondary"),
    renderActionButton("Copy", "copy", command, "secondary"),
    renderActionButton("Edit", "edit", command, "secondary"),
    renderActionButton("Delete", "delete", command, "secondary"),
    "</div>",
    "</div>",
    description,
    `<pre class="command-text" title="${escapeHtmlAttribute(command.command)}">${escapeHtml(truncateCommand(command.command))}</pre>`,
    "</div>",
    renderEditCommandForm(command),
    "</li>",
  ].join("");
}

function renderEditCommandForm(command: CommandVaultCommand): string {
  return [
    `<form class="create-command-form edit-command-form" aria-label="Edit ${escapeHtmlAttribute(command.name)} command" hidden data-command-id="${escapeHtmlAttribute(command.id)}">`,
    '<input name="scope" type="hidden" value="workspace" />',
    renderCommandFormFields(command),
    '<div class="form-actions">',
    `<button class="sidebar-action form-action" type="submit" aria-label="Save ${escapeHtmlAttribute(command.name)} command" title="Save ${escapeHtmlAttribute(command.name)} command"><span aria-hidden="true" class="action-icon">✓</span></button>`,
    `<button class="sidebar-action form-action secondary" type="button" data-command-vault-action="cancel-form" aria-label="Cancel editing ${escapeHtmlAttribute(command.name)} command" title="Cancel editing ${escapeHtmlAttribute(command.name)} command"><span aria-hidden="true" class="action-icon">×</span></button>`,
    '</div>',
    "</form>",
  ].join("");
}

function renderActionButton(
  label: string,
  action: CommandVaultSidebarAction,
  command: CommandVaultCommand,
  variant?: "secondary",
): string {
  const className = variant
    ? `command-action ${variant}`
    : "command-action";
  const icon = getCommandActionIcon(action);

  return [
    `<button class="${className}"`,
    ' type="button"',
    ` data-command-vault-action="${escapeHtmlAttribute(action)}"`,
    ` data-command-id="${escapeHtmlAttribute(command.id)}"`,
    ` data-command-scope="${escapeHtmlAttribute(command.scope)}"`,
    ` aria-label="${escapeHtmlAttribute(`${label} ${command.name}`)}"`,
    ` title="${escapeHtmlAttribute(`${label} ${command.name}`)}">`,
    `<span aria-hidden="true" class="action-icon">${escapeHtml(icon)}</span>`,
    "</button>",
  ].join("");
}

function getCommandActionIcon(action: CommandVaultSidebarAction): string {
  switch (action) {
    case "cancel-form":
      return "×";
    case "copy":
      return "⧉";
    case "delete":
      return "⌫";
    case "edit":
      return "✎";
    case "export":
      return "Export";
    case "import":
      return "Import";
    case "paste":
      return "⇥";
    case "run":
      return "▶";
    case "create":
      return "+";
  }
}

function parseCommandVaultSidebarMessage(
  value: unknown,
): CommandVaultSidebarMessage | undefined {
  return (
    parseCommandVaultSidebarActionMessage(value) ??
    parseCommandVaultSidebarCreateCommandMessage(value) ??
    parseCommandVaultSidebarUpdateCommandMessage(value)
  );
}

function parseCommandVaultSidebarActionMessage(
  value: unknown,
): CommandVaultSidebarActionMessage | undefined {
  if (!isPlainObject(value) || value.type !== "commandVault.action") {
    return undefined;
  }

  const { action, target } = value;

  if (
    !isCommandVaultSidebarAction(action) ||
    (target !== undefined && !isPlainObject(target))
  ) {
    return undefined;
  }

  if (action === "cancel-form" || action === "create") {
    return undefined;
  }

  if (action === "export" || action === "import") {
    return {
      type: "commandVault.action",
      action,
    };
  }

  if (
    !isPlainObject(target) ||
    typeof target.id !== "string" ||
    target.scope !== "workspace"
  ) {
    return undefined;
  }

  return {
    type: "commandVault.action",
    action,
    target: {
      id: target.id,
      scope: target.scope,
    },
  };
}

function parseCommandVaultSidebarUpdateCommandMessage(
  value: unknown,
): CommandVaultSidebarUpdateCommandMessage | undefined {
  const parsed = parseCommandVaultSidebarInputMessage(value, "commandVault.updateCommand");

  if (!parsed || typeof parsed.target.id !== "string") {
    return undefined;
  }

  return {
    type: "commandVault.updateCommand",
    target: {
      id: parsed.target.id,
      scope: parsed.target.scope,
    },
    input: parsed.input,
  };
}

function parseCommandVaultSidebarInputMessage(
  value: unknown,
  type: "commandVault.createCommand" | "commandVault.updateCommand",
):
  | {
      input: CommandVaultSidebarCreateCommandMessage["input"];
      target: {
        id?: unknown;
        scope: CommandVaultCommand["scope"];
      };
    }
  | undefined {
  if (!isPlainObject(value) || value.type !== type) {
    return undefined;
  }

  const { target, input } = value;

  if (
    !isPlainObject(target) ||
    target.scope !== "workspace" ||
    !isPlainObject(input) ||
    typeof input.name !== "string" ||
    typeof input.command !== "string" ||
    typeof input.description !== "string" ||
    input.name.trim().length === 0 ||
    input.command.trim().length === 0
  ) {
    return undefined;
  }

  return {
    target: {
      id: target.id,
      scope: target.scope,
    },
    input: {
      name: input.name.trim(),
      command: input.command.trim(),
      description: input.description.trim(),
    },
  };
}

function parseCommandVaultSidebarCreateCommandMessage(
  value: unknown,
): CommandVaultSidebarCreateCommandMessage | undefined {
  const parsed = parseCommandVaultSidebarInputMessage(value, "commandVault.createCommand");

  if (!parsed) {
    return undefined;
  }

  return {
    type: "commandVault.createCommand",
    target: {
      scope: parsed.target.scope,
    },
    input: parsed.input,
  };
}

function isCommandVaultSidebarAction(
  value: unknown,
): value is CommandVaultSidebarAction {
  return (
    value === "copy" ||
    value === "cancel-form" ||
    value === "create" ||
    value === "delete" ||
    value === "edit" ||
    value === "export" ||
    value === "import" ||
    value === "paste" ||
    value === "run"
  );
}

function truncateCommand(command: string): string {
  const maxLength = 55;

  if (command.length <= maxLength) {
    return command;
  }

  return `${command.slice(0, maxLength - 1)}…`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
