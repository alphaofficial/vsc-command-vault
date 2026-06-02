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
  onDidReceiveMessage?: (
    message: CommandVaultSidebarActionMessage,
  ) => void | Promise<void>;
  repository: CommandVaultRepository;
  workspace: CommandVaultWorkspace;
}

export interface CommandVaultSidebarState {
  globalCommands: readonly CommandVaultCommand[];
  hasWorkspace: boolean;
  workspaceCommands: readonly CommandVaultCommand[];
}

export type CommandVaultSidebarAction = "copy" | "delete" | "edit" | "run";

export interface CommandVaultSidebarActionMessage {
  action: CommandVaultSidebarAction;
  target: {
    id: string;
    scope: CommandVaultCommand["scope"];
  };
  type: "commandVault.action";
}

export function createCommandVaultSidebarProvider(
  options: CreateCommandVaultSidebarProviderOptions,
): CommandVaultSidebarController {
  let activeWebviewView: CommandVaultWebviewView | undefined;

  const refresh = async () => {
    if (!activeWebviewView) {
      return;
    }

    const state = await loadCommandVaultSidebarState(
      options.repository,
      options.workspace.workspaceFolders,
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
        const actionMessage = parseCommandVaultSidebarActionMessage(message);

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
): Promise<CommandVaultSidebarState> {
  const workspaceFolderPath = workspaceFolders?.[0]?.uri.fsPath;
  const globalCommandsPromise = repository.readGlobalCommands();

  if (!workspaceFolderPath) {
    const globalCommands = await globalCommandsPromise;

    return {
      hasWorkspace: false,
      workspaceCommands: [],
      globalCommands,
    };
  }

  const workspaceId = createWorkspaceId(workspaceFolderPath);
  const [workspaceCommands, globalCommands] = await Promise.all([
    repository.readWorkspaceCommands(workspaceId),
    globalCommandsPromise,
  ]);

  return {
    hasWorkspace: true,
    workspaceCommands,
    globalCommands,
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
        color: var(--vscode-foreground);
        background:
          radial-gradient(circle at top, color-mix(in srgb, var(--vscode-button-background) 12%, transparent) 0, transparent 48%),
          var(--vscode-sideBar-background);
      }

      main {
        display: grid;
        gap: 16px;
      }

      .hero {
        display: grid;
        gap: 6px;
        padding: 14px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 14px;
        background: color-mix(in srgb, var(--vscode-editor-background) 78%, transparent);
      }

      .hero h1,
      .section-title {
        margin: 0;
      }

      .hero h1 {
        font-size: 16px;
        font-weight: 700;
      }

      .hero p,
      .section-copy,
      .section-state {
        margin: 0;
        line-height: 1.45;
      }

      .section {
        display: grid;
        gap: 10px;
      }

      .section-heading {
        display: grid;
        gap: 4px;
      }

      .section-title {
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .section-copy {
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
      }

      .section-state {
        padding: 14px;
        border: 1px dashed var(--vscode-panel-border);
        border-radius: 12px;
        background: color-mix(in srgb, var(--vscode-editor-background) 65%, transparent);
      }

      .section-state strong {
        display: block;
        margin-bottom: 4px;
        font-size: 13px;
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
        border-radius: 12px;
        background: color-mix(in srgb, var(--vscode-editor-background) 82%, transparent);
      }

      .command-copy-block {
        display: grid;
        gap: 8px;
      }

      .command-name {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
      }

      .command-description {
        margin: 0;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        line-height: 1.4;
      }

      .command-text {
        margin: 0;
        padding: 10px 12px;
        overflow-x: auto;
        border-radius: 10px;
        background: var(--vscode-textCodeBlock-background, color-mix(in srgb, var(--vscode-editor-background) 88%, black));
        color: var(--vscode-textPreformat-foreground, var(--vscode-foreground));
        font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
        font-size: 12px;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .command-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .command-action {
        border: 1px solid var(--vscode-button-border, transparent);
        border-radius: 999px;
        padding: 6px 10px;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
      }

      .command-action.secondary {
        color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
        background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      }

      .command-action:hover {
        background: var(--vscode-button-hoverBackground);
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero" aria-label="Command Vault summary">
        <h1>Command Vault</h1>
        <p>Save reusable terminal commands for the current workspace or every workspace.</p>
      </section>
      <section class="section" aria-labelledby="workspace-heading">
        <div class="section-heading">
          <h2 class="section-title" id="workspace-heading">Workspace</h2>
          <p class="section-copy">Commands saved only for the open workspace.</p>
        </div>
        ${renderWorkspaceSectionContent(state)}
      </section>
      <section class="section" aria-labelledby="global-heading">
        <div class="section-heading">
          <h2 class="section-title" id="global-heading">Global</h2>
          <p class="section-copy">Commands available from any workspace.</p>
        </div>
        ${renderGlobalSectionContent(state.globalCommands)}
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

        const action = button.dataset.commandVaultAction;
        const id = button.dataset.commandId;
        const scope = button.dataset.commandScope;

        if (!action || !id || !scope) {
          return;
        }

        vscode.postMessage({
          type: "commandVault.action",
          action,
          target: {
            id,
            scope,
          },
        });
      });
    </script>
  </body>
</html>`;
}

function renderWorkspaceSectionContent(state: CommandVaultSidebarState): string {
  if (!state.hasWorkspace) {
    return renderSectionState(
      "No workspace open",
      "Open a workspace folder to save workspace commands.",
    );
  }

  if (state.workspaceCommands.length === 0) {
    return renderSectionState(
      "No workspace commands yet",
      "Save workspace-only commands here for the current project.",
    );
  }

  return renderCommandList(state.workspaceCommands);
}

function renderGlobalSectionContent(
  commands: readonly CommandVaultCommand[],
): string {
  if (commands.length === 0) {
    return renderSectionState(
      "No global commands yet",
      "Save reusable personal commands here.",
    );
  }

  return renderCommandList(commands);
}

function renderSectionState(title: string, copy: string): string {
  return [
    '<div class="section-state">',
    `<strong>${escapeHtml(title)}</strong>`,
    `<span>${escapeHtml(copy)}</span>`,
    "</div>",
  ].join("");
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
    '<li class="command-card">',
    '<div class="command-copy-block">',
    `<h3 class="command-name">${escapeHtml(command.name)}</h3>`,
    description,
    `<pre class="command-text">${escapeHtml(command.command)}</pre>`,
    "</div>",
    '<div class="command-actions" aria-label="Command actions">',
    renderActionButton("Run", "run", command),
    renderActionButton("Copy", "copy", command, "secondary"),
    renderActionButton("Edit", "edit", command, "secondary"),
    renderActionButton("Delete", "delete", command, "secondary"),
    "</div>",
    "</li>",
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

  return [
    `<button class="${className}"`,
    ' type="button"',
    ` data-command-vault-action="${escapeHtmlAttribute(action)}"`,
    ` data-command-id="${escapeHtmlAttribute(command.id)}"`,
    ` data-command-scope="${escapeHtmlAttribute(command.scope)}"`,
    ` aria-label="${escapeHtmlAttribute(`${label} ${command.name}`)}">`,
    escapeHtml(label),
    "</button>",
  ].join("");
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
    !isPlainObject(target) ||
    typeof target.id !== "string" ||
    !isCommandVaultScope(target.scope)
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

function isCommandVaultSidebarAction(
  value: unknown,
): value is CommandVaultSidebarAction {
  return (
    value === "copy" ||
    value === "delete" ||
    value === "edit" ||
    value === "run"
  );
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
