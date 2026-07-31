# claumport

`claumport` exports local Claude Code sessions into portable archives and imports them on another account or computer. Run `claumport` with no arguments for guided keyboard navigation.

No authentication, cookies, account settings, or remote Cowork data enter an archive. Import creates fresh session and message UUIDs, rewrites the working directory to the recipient's project path, and adds the session to the currently logged-in Claude Desktop account.

## Typical workflow

Sender lists every resumable session stored on the device:

```powershell
claumport sessions list
```

Sender chooses account, project, then session interactively:

```powershell
claumport sessions export
```

Choose multiple projects with Space, then select sessions inside each project. Every selected session becomes its own `.claumport` file under `~/.claumport/exports`. Paths are terminal-clickable where supported; choose the Explorer reveal prompt or use `--reveal` to open the exported file location.

```powershell
claumport sessions export --all --reveal
```

Send selected archive files like sensitive documents.

Recipient sees saved archives, then imports one into their local project path:

```powershell
claumport sessions archives
claumport sessions import --target "C:\code\my-project"
```

Archives live in `~/.claumport/exports`. `sessions import` first selects one or more source projects, then sessions from each project, then one destination folder per selected project. Import reads Claude Desktop's active account automatically. No logout or account switch is required. Existing project files are untouched.

## Same-device account switching

Local transcripts usually remain after logout. `sessions list` reads all known account partitions on the device and marks the active account. Export desired sessions before or after switching accounts, then import their archives into the active account.

Archives exported by the currently active account are disabled in the interactive importer. Export from Account A, log into Account B, then choose that archive from the library and import it. No export/import is required before logout if local sessions still remain; export only when you want a portable copy or to bring a session into another account/device.

## Friendly account names

Claude Desktop stores session partitions by opaque account UUID, not a stable readable email/name record. Give each local account a name once; Claumport then uses it in interactive selectors and account views.

```powershell
claumport accounts label
```

Use a name such as `Work — name@company.com` or `Personal`.

## Safety model

- Archives are versioned and include transcript size plus SHA-256 checksum.
- Export streams transcripts without loading large sessions fully into memory.
- Import verifies checksum before publishing the new transcript.
- Imported sessions receive fresh IDs, so existing sessions are never overwritten.
- Reimporting the same archive into the same account and folder is blocked unless `--allow-duplicate` is explicit.
- Desktop metadata is written last and atomically.
- Existing target project files are never changed.
- Each completed import writes an operation record under `~/.claumport/operations`.

Session transcripts can contain prompts, source code, terminal output, file contents, and secrets. Treat `.claumport` files as sensitive.

## Non-interactive examples

```powershell
claumport sessions export --account <account> --session <session> --output .\review.claumport
claumport sessions import .\review.claumport --target C:\code\recipient-project --yes
claumport sessions import .\review.claumport --target C:\code\recipient-project --allow-duplicate --yes
```

Use `--data-dir` and `--claude-dir` for non-default Claude storage paths.

## Development

Use pnpm:

```powershell
pnpm install
pnpm test
```

Do not use npm in this project.

## Boundary

Current format targets local Claude Code sessions shown by Claude Desktop. Remote Cowork sessions remain account-scoped on Anthropic's service. Legacy local Cowork VM sessions use a different format and are intentionally excluded.
