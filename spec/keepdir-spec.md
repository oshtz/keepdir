# KeepDir Behavioral Contract

KeepDir has one core loop: watched folders are scanned, enabled rules are evaluated in order, a dry-run queue is produced, and files move only after a pending action is reviewed or bulk-applied.

## Store

The store is camelCase JSON at `{appData}/com.oshtz.keepdir/keepdir.json`. The bundle identifier remains `com.oshtz.keepdir` so existing installations keep their data.

`Store` contains `settings`, `workspaceSettings`, `watchFolders`, and `ruleActions`. `settings` and all unknown `workspaceSettings` values are opaque JSON and must round-trip without schema loss.

Writes are atomic: serialize pretty JSON to `keepdir.json.tmp`, copy the live file to `keepdir.json.bak`, delete the live file, then rename the tmp file over it. Reads parse the main file first and fall back to `.bak` if the main file is corrupt.

On every save, terminal actions (`applied`, `skipped`, `stale`, `undone`) older than 30 days are pruned. If a workspace has more than 1,000 actions, prune oldest terminal actions first. Non-terminal actions are never pruned.

## Rules

Rules are sorted by `order`; disabled rules are ignored. Match criteria are an AND of `nameContains`, `extensionIn`, `sourceUrlContains`, and `downloadedFromContains`. Missing criteria pass. Text comparisons are case-insensitive.

Download metadata criteria are tri-state. If required metadata is unavailable, the rule is treated as matched but uncertain, evaluation stops, and the action becomes `needs_review`.

If a rule matches certainly, its action fields merge into the accumulated action. `targetFolder`, `targetNameTemplate`, and `ask` each override only when present. When `stopOnMatch` is missing or true, evaluation stops. The last certain matching rule owns `ruleId` and `ruleName`.

Every enabled rule evaluated emits a trace item: `ruleId`, `ruleName`, `matched`, `uncertain`, and exact reasons. A rule with no criteria emits `matched all files`.

No matched rule becomes `needs_review` with `No rule matched`; this row is only queued when `queueUnmatchedFiles` is true.

## Targets

Filename tokens are `{name}`, `{originalName}`, `{basename}`, `{ext}`, and `{date}`. Folder segment tokens are `{date}`, `{yyyy}`, and `{mm}`. Dates are UTC `yyyy-MM-dd`.

`safeFilename` replaces control characters and `< > : " / \ | ? *` with `_`, trims whitespace and leading/trailing dots, errors when empty, and guards Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) on every platform.

Target folders are relative to the watched root. Only normal path components and `.` are allowed; `..` and rooted paths are rejected.

Evaluation status is:

- `needs_review` when unmatched, uncertain, ask=true, or target equals source.
- `conflict` when the target already exists.
- `error` when target expansion fails.
- `pending` otherwise.

## Queue Mutations

Apply only accepts `pending`. It checks target exists, status, source existence, regular-file and non-symlink type, size/mtime drift, `..` components, containment inside the watched root, same-path no-op, target existence, symlink ancestors, parent creation, and no-replace move. Success records `appliedSourcePath` and `appliedTargetPath`.

Undo only accepts `applied`. It keeps both paths inside the watched root, refuses to overwrite the original path, verifies the moved file still matches the original snapshot, rejects symlink ancestors, then no-replace moves back and marks `undone`.

Retarget is forbidden for `applied`, `undone`, and `skipped`. It sanitizes the new name, rechecks the source snapshot, keeps the target inside the watched root, rejects symlink ancestors, and derives `pending`, `conflict`, or `needs_review`.

Skip can only move non-terminal actions to `skipped`; a batch fails if any selected action is terminal.

## Watcher

File-system events only trigger scans. The scan owns correctness.

Constants: event debounce 250 ms, stable interval 500 ms, rebuild check 5 s, fallback poll 2 s, safety scan 60 s. Files queue only after two scans see identical size and mtime. The dedupe key is `path:size:mtimeMs`. Symlinks are skipped. Non-recursive watches ignore nested files. Non-terminal actions outside the current watched scope become `stale`.

## Metadata

Windows reads NTFS ADS `:Zone.Identifier`, sniffing UTF-16LE vs UTF-8. `HostUrl` wins over `ReferrerUrl`; `AppName` becomes `downloadedFrom`.

macOS reads xattr `com.apple.metadata:kMDItemWhereFroms` as a binary plist. The first non-empty value is `sourceUrl`; all values joined by spaces become `downloadedFrom`.

## Assistant

Allowed providers are `openai`, `google`, `anthropic`, `openrouter`, `lmstudio`, and `ollama`. Keys are stored under service `KeepDir Rule Assistant`, account = provider. Requests use a 30 s timeout. Drafted rules are disabled until the user saves them.
