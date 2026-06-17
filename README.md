# Command Vault

<p align="center">
  <a href="https://github.com/alphaofficial/vsc-command-vault/releases/latest">
    <img src="https://img.shields.io/github/v/release/alphaofficial/vsc-command-vault?style=flat&colorA=000000&colorB=000000" alt="Latest release" />
  </a>
  <a href="https://github.com/alphaofficial/vsc-command-vault/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/alphaofficial/vsc-command-vault/ci.yml?style=flat&colorA=000000&colorB=000000" alt="Build workflow" />
  </a>
</p>

Command Vault is a VS Code extension for saving, searching, and running reusable terminal commands without leaving the editor.

## Install

```bash
curl -fL https://github.com/alphaofficial/vsc-command-vault/releases/latest/download/commandvault.vsix -o /tmp/commandvault.vsix && code --install-extension /tmp/commandvault.vsix
```

## Getting Started

### Open Command Vault

Click the **Command Vault** icon in the Activity Bar, or use the Command Palette:

```
Command Vault: Search Commands
```

### Create a Command

1. Click **+ New Command** in the sidebar
2. Enter a name and your terminal command
3. Choose **Workspace** or **Global** scope
4. Click **Save**

### Run a Command

- Click the **Run** button on any command card
- Or search for a command and press **Enter** to execute it

## Features

- **Dual Scopes** — Workspace commands for project-specific scripts, Global commands available across all projects
- **Card-based UI** — Commands displayed as cards with always-visible actions (Run, Copy, Edit, Delete)
- **Quick Search** — Fuzzy search across all commands via Quick Pick (`Alt+Enter` to paste without running)
- **Variable Placeholders** — Use `{{variableName}}` syntax for prompts before execution
- **Integrated Terminal** — Commands run directly in VS Code's integrated terminal
- **Import/Export** — Share your command collections easily

## Commands

| Action | Command |
| --- | --- |
| Search Commands | `Command Vault: Search Commands` |
| Create Command | `Command Vault: Create Command` |
| Edit Command | `Command Vault: Edit Command` |
| Copy Command | `Command Vault: Copy Command` |
| Run Command | `Command Vault: Run Command` |
| Delete Command | `Command Vault: Delete Command` |

### Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+Enter` (in Quick Pick) | Paste command without running |
| `Cmd/Ctrl+Enter` (in Quick Pick) | Edit selected command |

## Variable Placeholders

Use `{{placeholder}}` syntax in commands to prompt for values before execution:

```
git checkout {{branchName}}
pnpm --filter {{packageName}} test
```

Built-in VS Code variables are also supported:

- `${workspaceFolder}` — Current workspace path
- `${file}` — Active file path
- `${selectedText}` — Selected text in editor

## Configuration

```json
{
  "commandVault.defaultExecutionBehavior": "run" | "paste"
}
```

- **run** — Sends the command and executes it on Enter
- **paste** — Sends the command without a trailing newline on Enter

## Data Storage

- **Workspace** — Stored in extension global storage, keyed by workspace ID
- **Global** — Available across all workspaces, stored in extension global storage

Data is stored as JSON files in VS Code's extension storage directory, making it easy to inspect, backup, and migrate.

## Links

- [GitHub Repository](https://github.com/alphaofficial/vsc-command-vault)
- [Issue Tracker](https://github.com/alphaofficial/vsc-command-vault/issues)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items/alphaxsalt.vsc-snippet-catalog)

## License

MIT
