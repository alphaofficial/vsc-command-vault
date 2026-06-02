# VS Code Command Vault Extension — Technical & Design Spec

## 1. Product Summary


## Product Scope Constraint

This product supports exactly two command scopes:

- **Workspace**: repository-specific commands.
- **Global**: personal commands available across all workspaces.

There is no Team scope, Org scope, Cloud scope, or third collection type in the MVP or current design.


A VS Code extension that provides a Terminus-style command snippet vault inside VS Code.

Users can save frequently used terminal commands, organize them into folders, search them, edit them, run them in the integrated terminal, and optionally share project-specific command vaults through source control.

## 2. Goals

- Store reusable terminal commands.
- Provide a sidebar UI similar to a command vault.
- Allow commands to be grouped by folders/categories.
- Support project-level and user-level vaults.
- Execute commands in VS Code integrated terminals.
- Support variable placeholders and prompts before execution.
- Make commands easy to search, copy, edit, and run.
- Allow repo-shared command collections.

## 3. Non-goals

- Replacing VS Code Tasks.
- Building a full terminal emulator.
- Managing secrets directly.
- Running commands outside VS Code's terminal environment by default.
- Cloud sync in v1.

## 4. Primary User Stories

### Save command

As a developer, I want to save a terminal command with a name and description so I can reuse it later.

### Run command

As a developer, I want to click a saved command and execute it in the current workspace terminal.

### Organize commands

As a developer, I want to group commands by project, folder, or tool.

### Search commands

As a developer, I want to quickly fuzzy-search saved commands.

### Use variables

As a developer, I want commands like:

```bash
pnpm --filter {{packageName}} test
```

to prompt me for `packageName` before execution.

### Share workspace commands

As a team, we want to commit a `.vscode/command-vault.json` file so the same command library is available to everyone.

## 5. UX Overview

### Activity Bar

Add a new VS Code Activity Bar icon:

```text
Command Vault
```

Clicking it opens the command vault sidebar.

### Sidebar Layout

```text
COMMAND VAULT

[ Search commands... ]

Workspace
  Backend
    Run API dev server
    Run migrations
    Seed database

  Frontend
    Run web app
    Typecheck
    Unit tests

User
  Git
    Prune branches
    Show largest files

[ + New Command ] [ + New Folder ]
```

### Command Row

Each command row should show:

- Name
- Optional description on hover
- Icon based on command type/category
- Inline actions:
  - Run
  - Copy
  - Edit
  - Delete

### Command Detail Panel

Selecting or editing a command opens a webview/detail form:

```text
Name
[ Run API dev server ]

Command
[ pnpm --filter api dev ]

Working Directory
[ ${workspaceFolder} ]

Description
[ Starts local API service ]

Tags
[ api, dev, backend ]

Execution Mode
(•) Send to terminal
( ) Paste only
( ) Run as task

Terminal
(•) Active terminal
( ) New terminal
( ) Named terminal

[ Save ] [ Run ] [ Delete ]
```

## 6. Core Concepts

### Vault Scope

The extension supports two scopes:

#### User vault

Stored globally in VS Code extension global state or a user config file.

Used for personal commands.

#### Workspace vault

Stored in the repository:

```text
.vscode/command-vault.json
```

Used for team-shared commands.

### Command

A command is a reusable terminal snippet.

### Folder

A folder groups commands and nested folders.

### Variable

Variables are placeholders resolved before execution.

Examples:

```bash
git checkout {{branchName}}
pnpm --filter {{packageName}} test
aws logs tail /aws/lambda/{{functionName}} --follow
```

## 7. Data Model

### File Location

Workspace vault:

```text
.vscode/command-vault.json
```

User vault:

```text
$globalStorageUri/command-vault.json
```

### JSON Schema

```ts
export type CommandVaultFile = {
	version: 1
	folders: Array<CommandVaultFolder>
	commands: Array<CommandVaultCommand>
}

export type CommandVaultFolder = {
	id: string
	name: string
	parentFolderId: string | null
	sortOrder: number
}

export type CommandVaultCommand = {
	id: string
	name: string
	command: string
	description: string | null
	folderId: string | null
	scope: CommandVaultScope
	workingDirectory: string | null
	tags: Array<string>
	executionMode: CommandExecutionMode
	terminalMode: CommandTerminalMode
	namedTerminal: string | null
	sortOrder: number
	createdAt: string
	updatedAt: string
}

export type CommandVaultScope = 'user' | 'workspace'

export type CommandExecutionMode =
	| 'sendToTerminal'
	| 'pasteToTerminal'
	| 'copyToClipboard'

export type CommandTerminalMode =
	| 'activeTerminal'
	| 'newTerminal'
	| 'namedTerminal'
```

### Example

```json
{
	"version": 1,
	"folders": [
		{
			"id": "folder_backend",
			"name": "Backend",
			"parentFolderId": null,
			"sortOrder": 0
		}
	],
	"commands": [
		{
			"id": "command_api_dev",
			"name": "Run API dev server",
			"command": "pnpm --filter api dev",
			"description": "Starts the API dev server",
			"folderId": "folder_backend",
			"scope": "workspace",
			"workingDirectory": "${workspaceFolder}",
			"tags": ["api", "dev"],
			"executionMode": "sendToTerminal",
			"terminalMode": "namedTerminal",
			"namedTerminal": "API",
			"sortOrder": 0,
			"createdAt": "2026-06-02T00:00:00.000Z",
			"updatedAt": "2026-06-02T00:00:00.000Z"
		}
	]
}
```

## 8. Variable Interpolation

### Syntax

```text
{{variableName}}
```

### Built-in Variables

```text
${workspaceFolder}
${file}
${relativeFile}
${selectedText}
${env:VARIABLE_NAME}
```

### Prompt Variables

Unknown `{{variableName}}` placeholders trigger an input box.

Example:

```bash
git checkout {{branchName}}
```

Execution flow:

1. Detect `branchName`.
2. Prompt user: `branchName`.
3. Replace placeholder.
4. Execute command.

### Future Variable Types

Later versions can support typed variables:

```json
{
	"name": "Deploy service",
	"command": "pnpm deploy --stage {{stage}}",
	"variables": {
		"stage": {
			"type": "select",
			"options": ["dev", "staging", "prod"]
		}
	}
}
```

## 9. Extension Architecture

### Main Components

```text
src/
  extension.ts
  commands/
    registerCommands.ts
  vault/
    CommandVaultRepository.ts
    WorkspaceCommandVaultRepository.ts
    UserCommandVaultRepository.ts
    CommandVaultSchema.ts
  tree/
    CommandVaultTreeProvider.ts
    CommandVaultTreeItem.ts
  execution/
    CommandExecutor.ts
    VariableResolver.ts
    TerminalManager.ts
  webview/
    CommandEditorPanel.ts
    media/
  search/
    CommandSearchProvider.ts
  validation/
    validateCommandVaultFile.ts
```

## 10. VS Code Contribution Points

### package.json

```json
{
	"contributes": {
		"viewsContainers": {
			"activitybar": [
				{
					"id": "commandVault",
					"title": "Command Vault",
					"icon": "resources/command-vault.svg"
				}
			]
		},
		"views": {
			"commandVault": [
				{
					"id": "commandVault.commands",
					"name": "Commands"
				}
			]
		},
		"commands": [
			{
				"command": "commandVault.createCommand",
				"title": "Command Vault: Create Command"
			},
			{
				"command": "commandVault.runCommand",
				"title": "Command Vault: Run Command"
			},
			{
				"command": "commandVault.editCommand",
				"title": "Command Vault: Edit Command"
			},
			{
				"command": "commandVault.deleteCommand",
				"title": "Command Vault: Delete Command"
			},
			{
				"command": "commandVault.searchCommands",
				"title": "Command Vault: Search Commands"
			}
		]
	}
}
```

## 11. Command Execution

### Execution Modes

#### Send to terminal

Sends command text and presses enter.

```ts
terminal.sendText(resolvedCommand, true)
```

#### Paste to terminal

Sends command text without pressing enter.

```ts
terminal.sendText(resolvedCommand, false)
```

#### Copy to clipboard

Copies command only.

```ts
await vscode.env.clipboard.writeText(resolvedCommand)
```

### Terminal Selection

#### Active terminal

Use `vscode.window.activeTerminal`.

#### New terminal

Create a fresh terminal.

#### Named terminal

Find existing terminal by name, or create one.

```ts
function getNamedTerminal(terminalName: string): vscode.Terminal {
	const existingTerminal = vscode.window.terminals.find(
		(terminal) => terminal.name === terminalName,
	)

	return existingTerminal ?? vscode.window.createTerminal(terminalName)
}
```

## 12. Tree View Behaviour

### Tree Nodes

- Scope node: `Workspace`, `User`
- Folder node
- Command node

### Context Menus

Folder:

- New Command
- New Folder
- Rename
- Delete

Command:

- Run
- Copy
- Edit
- Duplicate
- Delete

### Drag and Drop

Support later:

- Move command between folders.
- Reorder commands.
- Move folders.

## 13. Search UX

Command palette command:

```text
Command Vault: Search Commands
```

Opens Quick Pick:

```text
Run API dev server
pnpm --filter api dev
Backend · workspace
```

Actions:

- Enter: run command
- Alt/Option + Enter: paste only
- Cmd/Ctrl + Enter: edit

## 14. Validation

The extension should validate vault files using a JSON schema.

Invalid file behaviour:

- Show non-blocking warning.
- Ignore invalid entries where possible.
- Offer to open the vault file.
- Never delete or rewrite invalid user data automatically.

## 15. Settings

```json
{
	"commandVault.defaultExecutionMode": "sendToTerminal",
	"commandVault.defaultTerminalMode": "activeTerminal",
	"commandVault.enableWorkspaceVault": true,
	"commandVault.enableUserVault": true,
	"commandVault.confirmBeforeRunning": false,
	"commandVault.autoCreateWorkspaceVault": false
}
```

## 16. Security Considerations

Commands are arbitrary shell text.

Recommended safeguards:

- Do not auto-run commands on startup.
- Do not execute commands from untrusted workspaces without explicit user action.
- Show workspace trust warning when appropriate.
- Optional confirmation for commands containing risky patterns:
  - `rm -rf`
  - `sudo`
  - `curl ... | sh`
  - `Invoke-WebRequest ... | iex`
- Never store secrets in the vault.
- Support environment variable references instead.

## 17. Testing Strategy

### Unit Tests

Use Vitest.

Test:

- JSON loading.
- JSON validation.
- Variable extraction.
- Variable interpolation.
- Terminal selection logic.
- Sort ordering.
- Repository merge behaviour.

Example:

```ts
import { describe, expect, it } from 'vitest'
import { extractPromptVariables } from './VariableResolver'

describe('extractPromptVariables', () => {
	it('extracts unique prompt variable names', () => {
		const variableNames = extractPromptVariables(
			'pnpm --filter {{packageName}} test {{packageName}}',
		)

		expect(variableNames).toEqual(['packageName'])
	})
})
```

### Integration Tests

Use `@vscode/test-electron`.

Test:

- Extension activates.
- Tree view loads.
- Command can be created.
- Command can be edited.
- Command can be sent to terminal.

## 18. Implementation Phases

### Phase 1 — MVP

- Activity bar view.
- Tree provider.
- Workspace vault JSON file.
- User vault JSON file.
- Create/edit/delete command.
- Run command in active terminal.
- Copy command.
- Basic Quick Pick search.

### Phase 2 — Polished Vault

- Folders.
- Nested folders.
- Tags.
- Named terminals.
- Working directory support.
- Drag and drop.
- JSON schema publishing.

### Phase 3 — Advanced Commands

- Prompt variables.
- Select variables.
- Recent values.
- Favorites.
- Usage count.
- Command history.

### Phase 4 — Team Workflows

- Import/export.
- Workspace recommendations.
- Shared command packs.
- Markdown docs generation.
- Optional task conversion.

## 19. MVP Acceptance Criteria

- User can create a command from the sidebar.
- User can edit a command.
- User can delete a command.
- User can run a command in the integrated terminal.
- User can copy a command.
- User can store commands globally.
- User can store commands in `.vscode/command-vault.json`.
- Workspace commands can be committed to git.
- Commands survive VS Code restart.
- Invalid vault JSON does not crash the extension.

## 20. Suggested Name Ideas

- Command Vault
- Terminal Vault
- Snippet Terminal
- Runbook
- Dev Commands
- Shell Shelf
- Command Shelf

## 21. Recommended MVP Name

**Command Vault**

Clear, searchable, and directly communicates the core feature.

## 22. Termius-inspired Design Spec

### Design Intent

The UI should feel like a Termius-style command vault inside VS Code: compact, searchable, grouped, and fast to execute.

It must expose only two command collections:

- Workspace
- Global

### Main Sidebar Layout

```text
COMMAND VAULT

[ Search commands... ]

Workspace
  Backend
    Run API dev server        ▶  ⧉  ⋯
    Run migrations            ▶  ⧉  ⋯
    Seed database             ▶  ⧉  ⋯

  Frontend
    Run web app               ▶  ⧉  ⋯
    Typecheck                 ▶  ⧉  ⋯
    Unit tests                ▶  ⧉  ⋯

Global
  Git
    Prune branches            ▶  ⧉  ⋯
    Delete merged branches    ▶  ⧉  ⋯

  AWS
    Tail Lambda logs          ▶  ⧉  ⋯
    Assume role               ▶  ⧉  ⋯

[ + Command ] [ + Folder ]
```

### Scope Behaviour

`Workspace` and `Global` are always visible top-level roots.

Workspace commands are stored at:

```text
.vscode/command-vault.json
```

Global commands are stored at:

```text
~/.command-vault/commands.json
```

Commands from different scopes are never merged.

If names collide, show both:

```text
Deploy
Workspace > Release

Deploy
Global > AWS
```

### Visual Hierarchy

Each command row should show:

```text
[terminal icon] Command name                 [Run] [Copy] [More]
                command preview or description
```

Rules:

- Command name is primary.
- Command preview is secondary and truncated.
- Folder path appears in tooltip/search results.
- Scope is visible through the tree root.
- Actions appear on hover to keep the list clean.

### Scope Headers

Each scope header supports:

```text
New Command
New Folder
Open Vault File
Refresh
Collapse All
```

### Folder Rows

Folder rows support:

```text
New Command
New Folder
Rename
Delete
```

Folders can be nested.

### Command Row Actions

Each command supports:

```text
Run
Paste
Copy
Edit
Duplicate
Delete
```

Recommended interaction:

- Single click: select command.
- Double click: run command.
- Enter: run command.
- Cmd/Ctrl+C: copy command.
- Context menu: full action list.

### Command Editor

Creating or editing opens a VS Code webview form.

```text
┌────────────────────────────────────────────┐
│ Run API dev server                         │
│ Workspace > Backend                        │
├────────────────────────────────────────────┤
│ Name                                       │
│ [ Run API dev server ]                     │
│                                            │
│ Command                                    │
│ [ pnpm --filter api dev ]                  │
│                                            │
│ Description                                │
│ [ Starts the API dev server ]              │
│                                            │
│ Scope                                      │
│ [ Workspace ▼ ]                            │
│                                            │
│ Folder                                     │
│ [ Backend ▼ ]                              │
│                                            │
│ Working directory                          │
│ [ ${workspaceFolder} ]                     │
│                                            │
│ Terminal                                   │
│ [ Named terminal: API ▼ ]                  │
│                                            │
│ Execution                                  │
│ [ Send and run ▼ ]                         │
│                                            │
│ Tags                                       │
│ [ api ] [ dev ] [ backend ]                │
├────────────────────────────────────────────┤
│ [ Save ] [ Run ] [ Copy ] [ Delete ]       │
└────────────────────────────────────────────┘
```

### Create Command Flow

When creating from a scope or folder, preselect that location.

When creating from the global toolbar, ask:

```text
Where should this command be saved?

Workspace
Stored in .vscode/command-vault.json

Global
Stored in ~/.command-vault/commands.json
```

### Search UX

Search includes Workspace and Global commands by default.

Quick Pick format:

```text
Run API dev server
pnpm --filter api dev
Workspace > Backend

Prune branches
git branch --merged | grep -v main | xargs git branch -d
Global > Git
```

Supported filters:

```text
scope:workspace
scope:global
tag:aws
folder:backend
```

Ranking:

1. Command name.
2. Tags.
3. Folder name.
4. Command text.
5. Description.
6. Recently used.

### Empty States

No workspace vault:

```text
No workspace commands yet.

[ Create Workspace Command ]
[ Open .vscode/command-vault.json ]
```

No global vault:

```text
No global commands yet.

[ Create Global Command ]
[ Open ~/.command-vault/commands.json ]
```

### Error States

Invalid JSON:

```text
Command vault file has invalid JSON.

[ Open File ]
[ Retry ]
```

Permission problem:

```text
Command vault file could not be saved.

[ Retry ]
[ Save As... ]
```

### VS Code Theme Compatibility

Use VS Code theme tokens only:

```css
color: var(--vscode-foreground);
background: var(--vscode-sideBar-background);
border-color: var(--vscode-sideBar-border);
```

Do not hardcode colours.

### Keyboard Shortcuts

Suggested commands:

```text
Command Vault: Search Commands
Command Vault: Create Workspace Command
Command Vault: Create Global Command
Command Vault: Run Selected Command
Command Vault: Copy Selected Command
```

### MVP Design Acceptance Criteria

- Workspace and Global roots are visible at the same time.
- User can create a Workspace command.
- User can create a Global command.
- User can search both scopes together.
- User can filter by scope.
- User can run, copy, edit, duplicate, and delete commands.
- Command rows feel like a command vault, not a generic settings editor.
- No third scope exists.



# SPEC UPDATE (LATEST DECISIONS)

## Product Constraints

- Only two scopes exist:
  - Workspace
  - Global

No Team scope.
No Org scope.
No Cloud scope.

## Information Architecture

The UI is flat.

There are no folders.
There are no nested groups.

Commands are displayed directly under:

- Workspace
- Global

## UI Direction

The extension should be implemented as a Webview-based sidebar, not a TreeDataProvider.

Reasoning:

- Supports a Termius-style experience.
- Supports card layouts.
- Supports always-visible actions.
- Supports future drag/drop.
- Avoids TreeView limitations.

## Command Card Layout

Each command is rendered as a card.

Example:

Workspace

[ Run API Dev Server ]
pnpm --filter api dev

[Run] [Copy] [Edit] [Delete]

Global

[ Prune Branches ]
git branch --merged | grep -v main

[Run] [Copy] [Edit] [Delete]

## Action Visibility

Do not hide actions behind context menus.

Primary actions must always be visible:

- Run
- Copy
- Edit
- Delete

Section actions:

- Add Command
- Paste Command

## Search

Searches both Workspace and Global simultaneously.

Results display scope badges:

- Workspace
- Global

## Simplified Data Model

```ts
export type CommandVaultCommand = {
	id: string
	scope: 'workspace' | 'global'
	name: string
	command: string
	description: string | null
	createdAt: string
	updatedAt: string
}
```

## Storage

Workspace:

```text
.vscode/command-vault.json
```

Global:

```text
~/.command-vault/commands.json
```


# SPEC UPDATE — STORAGE MODEL (LATEST)

## Storage Principles

- Commands are personal.
- Workspace commands are NOT stored in the workspace.
- Workspace commands are NOT git tracked.
- Workspace commands are NOT shared.
- No files are created inside repositories.

## Scopes

### Global

Visible in every VS Code workspace.

### Workspace

Visible only when the associated workspace is open.

## Storage Location

Use the VS Code extension storage directory via:

```ts
context.globalStorageUri
```

Example structure:

```text
globalStorage/
├── global.json
└── workspaces/
    ├── <workspace-id>.json
    ├── <workspace-id>.json
    └── <workspace-id>.json
```

## Workspace Identification

Workspace files are keyed by a stable workspace identifier.

Example:

```ts
const workspaceId = sha256(workspaceFolder.uri.fsPath)
```

## Examples

Global commands:

```text
globalStorage/global.json
```

Workspace commands:

```text
globalStorage/workspaces/<workspace-id>.json
```

## Rejected Approaches

Do not use:

```text
.vscode/command-vault.json
.vscode/command-vault.local.json
```

Reason:

- Pollutes repositories
- Creates git concerns
- Requires ignore management

Do not use:

```ts
context.globalState
context.workspaceState
```

Reason:

- Harder to inspect
- Harder to back up
- Harder to migrate
- Harder to export/import

JSON files inside the extension storage directory are the preferred implementation.
