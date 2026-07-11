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

1. Open a workspace folder (required)
2. Click **+** in the sidebar toolbar
3. Enter a name, terminal command, and optional description
4. Click the checkmark to save

### Run a Command

- Click the **Run** button on any command card
- Or search for a command and press **Enter** to execute it

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

## Configuration

```json
{
  "commandVault.defaultExecutionBehavior": "run" | "paste",
  "commandVault.terminalExecutionMode": "current" | "dedicated"
}
```

### Default execution behavior

- **run** — Sends the command and executes it on Enter
- **paste** — Sends the command without a trailing newline on Enter

### Terminal execution mode

- **current** — Uses the active terminal when one exists, otherwise creates a Command Vault terminal
- **dedicated** — Creates and reuses one terminal per command; if that terminal is closed, the next run creates it again

## Data Storage

Commands are stored as JSON in `workspaces/{workspaceId}.json` within VS Code's extension storage directory, where `workspaceId` is a SHA-256 hash of the workspace folder path. This makes it easy to inspect, backup, and migrate your commands.

## Links

- [GitHub Repository](https://github.com/alphaofficial/vsc-command-vault)
- [Issue Tracker](https://github.com/alphaofficial/vsc-command-vault/issues)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items/alphaxsalt.vsc-snippet-catalog)

## License

MIT
