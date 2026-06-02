import { createWorkspaceId, type CommandVaultCommand } from "./model.ts";
import type {
  CommandVaultWorkspace,
  CommandVaultWorkspaceFolder,
} from "./create-command.ts";
import type { CommandVaultRepository } from "./repository.ts";

export interface CommandVaultWebview {
  html: string;
}

export interface CommandVaultWebviewView {
  webview: CommandVaultWebview;
}

export interface CommandVaultWebviewViewProvider {
  resolveWebviewView(
    webviewView: CommandVaultWebviewView,
  ): void | Promise<void>;
}

export interface CreateCommandVaultSidebarProviderOptions {
  repository: CommandVaultRepository;
  workspace: CommandVaultWorkspace;
}

export interface CommandVaultSidebarState {
  globalCommands: readonly CommandVaultCommand[];
  hasWorkspace: boolean;
  workspaceCommands: readonly CommandVaultCommand[];
}

export function createCommandVaultSidebarProvider(
  options: CreateCommandVaultSidebarProviderOptions,
): CommandVaultWebviewViewProvider {
  return {
    async resolveWebviewView(webviewView) {
      const state = await loadCommandVaultSidebarState(
        options.repository,
        options.workspace.workspaceFolders,
      );

      webviewView.webview.html = renderCommandVaultSidebarHtml(state);
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
        <div class="section-state">
          ${renderWorkspaceSectionState(state)}
        </div>
      </section>
      <section class="section" aria-labelledby="global-heading">
        <div class="section-heading">
          <h2 class="section-title" id="global-heading">Global</h2>
          <p class="section-copy">Commands available from any workspace.</p>
        </div>
        <div class="section-state">
          ${renderGlobalSectionState(state.globalCommands)}
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function renderWorkspaceSectionState(state: CommandVaultSidebarState): string {
  if (!state.hasWorkspace) {
    return [
      "<strong>No workspace open</strong>",
      "<span>Open a workspace folder to save workspace commands.</span>",
    ].join("");
  }

  if (state.workspaceCommands.length === 0) {
    return [
      "<strong>No workspace commands yet</strong>",
      "<span>Save workspace-only commands here for the current project.</span>",
    ].join("");
  }

  return [
    `<strong>${formatCommandCount(state.workspaceCommands.length)}</strong>`,
    "<span>Workspace commands are loaded for this project.</span>",
  ].join("");
}

function renderGlobalSectionState(
  globalCommands: readonly CommandVaultCommand[],
): string {
  if (globalCommands.length === 0) {
    return [
      "<strong>No global commands yet</strong>",
      "<span>Save reusable personal commands here.</span>",
    ].join("");
  }

  return [
    `<strong>${formatCommandCount(globalCommands.length)}</strong>`,
    "<span>Global commands are loaded across workspaces.</span>",
  ].join("");
}

function formatCommandCount(commandCount: number): string {
  return commandCount === 1 ? "1 saved command" : `${commandCount} saved commands`;
}
