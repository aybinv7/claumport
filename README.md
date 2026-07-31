# Claumport

Claumport moves local Claude Code sessions between Claude Desktop accounts and computers.

It exports selected projects and sessions into one portable `.claumport` bundle. Import restores selected sessions into the current Claude Desktop account with fresh identities, so existing sessions and project files are not overwritten.

## Install

### From npm

After the public npm release:

```powershell
pnpm add --global claumport
claumport
```

### From source

Requirements: Node.js 18 or newer, pnpm, Claude Desktop, and Claude Code local sessions.

```powershell
git clone https://github.com/aybinv7/claumport.git
cd claumport
pnpm install
pnpm build
pnpm link --global
claumport
```

To update a source installation later:

```powershell
git pull
pnpm install
pnpm build
```

## Start

Run Claumport with no arguments for keyboard navigation:

```powershell
claumport
```

Use arrow keys to move, Space to toggle batch selections, Enter to continue, and type to filter longer lists.

Main areas:

- Accounts: inspect local account partitions and give them friendly names.
- Sessions: browse projects, export one bundle, import a bundle, or inspect saved archives.
- Archive library: view portable bundles kept by Claumport.

Direct commands and flags remain available for scripts.

## First-time account names

Claude Desktop stores session partitions with opaque UUIDs. Claumport does not depend on private browser/auth storage to recover email addresses. Name each local account once instead:

```powershell
claumport accounts label
```

Examples: `Work — ayoub@company.com`, `Personal`.

Labels are saved locally in `C:\Users\<you>\.claumport\accounts.json` and appear in Claumport selectors and lists.

## Export sessions

```powershell
claumport sessions export
```

Flow:

1. Choose source account and Claude workspace.
2. Select one or more projects.
3. Select one or more sessions inside each project, or choose all.
4. Claumport creates one `.claumport` bundle for everything selected.
5. Copy, upload, or send that one bundle.

Exported bundles are stored in:

```text
C:\Users\<you>\.claumport\exports
```

Claumport prints a clickable bundle path where terminal links are supported. Choose the Explorer prompt, or use `--reveal`, to open its location:

```powershell
claumport sessions export --all --reveal
```

If a bundle filename already exists, Claumport asks whether to replace it. Choosing No creates a numbered new filename. Use `--overwrite` only when replacement is intended.

Useful export flags:

```powershell
claumport sessions export --all
claumport sessions export --session <id> --session <id>
claumport sessions export --output .\team-handoff.claumport
claumport sessions export --output .\team-handoff.claumport --overwrite
```

## Import sessions

Put a received `.claumport` bundle in `C:\Users\<you>\.claumport\exports`, then run:

```powershell
claumport sessions import
```

Flow:

1. Claumport reads the active Claude Desktop account automatically.
2. Choose a saved archive, or drag and drop a received `.claumport` file into the terminal.
3. Files selected from another location are copied into the local archive library.
4. Choose one or more source projects and sessions. One bundle can import many sessions.
5. Choose the matching local project folder for each source project. Claumport explains the recorded source path but does not preselect a missing path from another device.
6. Review the session count and destination mapping, then confirm.

You can import a bundle directly from another location too:

```powershell
claumport sessions import "C:\Users\<you>\Downloads\friend-handoff.claumport"
```

For one known destination project:

```powershell
claumport sessions import .\team-handoff.claumport --target "C:\code\recipient-project" --yes
```

Imports create fresh Claude session/message IDs and rewrite transcript working directories to selected destination folders. Existing project files are untouched.

## Switching accounts on one computer

Local Claude Code transcripts usually remain after logout. Claumport lists local account partitions even when another account is active:

```powershell
claumport sessions list
```

You do not need to export before logout if sessions remain locally available. Export a bundle whenever you want a portable backup or need sessions to appear in another account/device.

New bundles record their source account. During interactive import, bundles from the currently active account are disabled to prevent pointless self-imports. Log into Account B, then import an export created while using Account A.

## Archive library

```powershell
claumport sessions archives
```

The guided Archive library menu can import saved sessions, add a received file, or browse bundle details. The command above prints saved bundles grouped by file. Archive library location:

```text
C:\Users\<you>\.claumport\exports
```

Completed imports are recorded locally in:

```text
C:\Users\<you>\.claumport\operations
```

Reimporting the same session bundle into the same account and destination folder is blocked by default. Use `--allow-duplicate` only when a deliberate second clone is needed.

## Safety and privacy

- Bundles are versioned and include per-session SHA-256 checksums.
- Export and import stream transcript data; large sessions are not loaded fully into memory.
- Import verifies transcript checksums before publishing sessions.
- Destination metadata is written last and atomically.
- Claumport never exports authentication, cookies, Claude account settings, or remote Cowork data.
- Bundles can contain prompts, source code, terminal output, file contents, and secrets. Treat every `.claumport` file as sensitive data.

## Scope

Claumport supports local Claude Code sessions surfaced by Claude Desktop. Remote Cowork sessions remain account-scoped on Anthropic services. Legacy local Cowork VM sessions use another format and are excluded.

## Development

```powershell
pnpm install
pnpm test
```

Do not use npm in this project.
