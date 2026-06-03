# Watch Folders Rename Suggestions Design

Date: 2026-06-03
Status: ready for user review

## Context

KeepDir is a local-first Electron app for AI-assisted file organization and renaming. The app already has main-process filesystem access, SQLite persistence, validated IPC boundaries, AI provider adapters, rename suggestion normalization, rename application logic, and an Electron E2E harness.

The proposed feature should make KeepDir useful even when the user is not manually browsing a folder: while the app is open, it can watch selected directories, detect newly added files, generate rename suggestions, and present those suggestions for review.

## Goals

- Let each workspace configure one or more watched folders.
- Keep watching disabled by default and opt-in per folder.
- Watch only while the app is running.
- Detect newly added direct-child files in watched folders.
- Wait until files are stable before analyzing them.
- Reuse the existing AI rename pipeline and rename application logic.
- Persist suggestion queue state locally so generated suggestions are not lost if the app restarts.
- Require explicit user action before any file is renamed.

## Non-Goals

- No automatic rename on arrival in the first version.
- No recursive watching in the first version.
- No app account, sync, cloud state, or authentication.
- No background daemon after the app exits.
- No rule-learning or always-apply automation.
- No support for folder rename suggestions in the first version.

## Product Shape

Add a workspace-level "Watch Folders" setting. A user can add folders, remove folders, and toggle each folder on or off. Enabled folders start watching when the app opens and stop watching when the app closes or when the folder is disabled.

When a new file appears, KeepDir waits for it to settle, asks the configured AI provider for a rename suggestion, and adds the result to a review queue. The queue groups suggestions by folder and shows the original filename, suggested filename, reason, status, and basic file metadata.

Users can apply selected suggestions, dismiss selected suggestions, refresh suggestions, reveal a file in the OS file explorer, or open the original file. Applying suggestions uses the same conflict and partial-failure behavior as the existing rename flow.

## Architecture

### Main Process

Create a `watchFolderManager` module owned by the main process. It should:

- Load enabled watch-folder settings for the active workspace.
- Own `fs.watch` handles and lifecycle cleanup.
- Rescan a watched folder when watcher events arrive because native watcher events can be coalesced or incomplete.
- Track candidate files through a small state machine: `detected`, `stabilizing`, `queued`, `analyzing`, `suggested`, `error`, `dismissed`, `applied`, `stale`.
- Debounce directory events and batch new files per folder.
- Limit analysis concurrency to one watch batch at a time.
- Emit renderer events for queue changes and folder watcher status.

The first version should watch direct children only. If a new directory appears, it is ignored except that the UI can show it in normal browsing.

### Analysis Reuse

The current rename analysis logic lives inside `src/main/main.js`. Implementation should extract the reusable rename-analysis path into a testable main-process module so both manual rename and watched-folder analysis call the same validation, provider, image handling, JSON extraction, suggestion normalization, and cache logic.

Watched analysis should force fresh suggestions for newly detected files, but it may still use cached image payloads and provider settings. If no provider is configured, the watcher should mark the folder as blocked by configuration instead of repeatedly retrying.

### Persistence

Store watch-folder configuration in workspace settings:

```json
{
  "watchFolders": [
    {
      "id": "uuid",
      "path": "C:\\Users\\USER\\Downloads",
      "enabled": true,
      "createdAt": "2026-06-03T00:00:00.000Z"
    }
  ]
}
```

Store generated suggestions in a dedicated SQLite table, not only in renderer state:

```text
watched_rename_suggestions
- id
- workspace_id
- folder_path
- file_path
- original_name
- suggested_name
- reason
- status
- file_size
- file_mtime_ms
- error_message
- created_at
- updated_at
```

`file_path` should be unique for active suggestions within a workspace so repeated filesystem events do not create duplicates. Applied and dismissed rows can remain for short history, but the visible queue should default to pending/error/stale items.

### IPC Contract

Add focused IPC methods through preload and `electron.d.ts`:

- `getWatchFolders(workspaceId)`
- `saveWatchFolder(workspaceId, folder)`
- `removeWatchFolder(workspaceId, folderId)`
- `setWatchFolderEnabled(workspaceId, folderId, enabled)`
- `getWatchedRenameSuggestions(workspaceId)`
- `dismissWatchedRenameSuggestions(workspaceId, suggestionIds)`
- `refreshWatchedRenameSuggestions(workspaceId, suggestionIds)`
- `applyWatchedRenameSuggestions(workspaceId, suggestionIds)`
- `onWatchFoldersChanged(callback)`
- `onWatchedRenameSuggestionsChanged(callback)`

The apply IPC can group suggestions by folder and delegate to the existing rename application logic. After application, it should update queue rows with `applied`, `stale`, or `error` based on the actual file operation result.

## Detection Rules

Skip:

- Directories.
- Symbolic links.
- Hidden dotfiles.
- Temporary or partial downloads such as `.tmp`, `.temp`, `.part`, `.crdownload`, `.download`, and names ending in `~`.
- Files larger than the existing analysis limits, if applicable.
- Files outside the watched folder after path normalization.

Stability check:

- Record size and mtime after detection.
- Recheck after a short delay.
- Treat the file as stable only after size and mtime match across two checks.
- If the file disappears before analysis, drop the candidate without surfacing an error.

Before applying a suggestion, revalidate that the file still exists and that its size and mtime match the queued suggestion. If not, mark it `stale` and offer refresh.

## Renderer UX

Add a Watch Folders section to workspace settings. It should show configured folders, enabled state, current watcher status, and last error if any.

Add a watched suggestions queue entry point near the directory explorer/sidebar. The queue should be compact and operational:

- Group by folder.
- Show status counts.
- Let the user select suggestions.
- Support apply selected, dismiss selected, refresh selected, open file, and reveal in folder.
- Keep the existing Rename Dialog for manual selected-file rename flows.

Do not add a marketing-style landing surface. This is a utility workflow and should stay dense, predictable, and review-oriented.

## Error Handling

- If a watched folder is deleted or inaccessible, mark that folder as unavailable and stop its watcher.
- If provider settings are missing, show folder/watch queue status that analysis is blocked by provider configuration.
- If AI output is invalid, keep the file in the queue with an error and allow refresh.
- If applying a suggestion conflicts with an existing filename, use the existing conflict behavior from `applyRenameSuggestions`.
- If the app quits while analysis is running, stop watchers and leave queued suggestions in their last persisted state.

## Testing

Add unit coverage for:

- Watch-folder setting validation.
- Direct-child path validation.
- Ignored temporary/hidden files.
- Stability detection.
- Duplicate event coalescing.
- Queue persistence transitions.
- Provider-missing and analysis-error states.
- Apply flow updates for success, partial failure, stale file, and dismissed suggestions.

Add renderer coverage for:

- Watch Folders settings controls.
- Suggestion queue grouped by folder.
- Apply/dismiss/refresh actions.
- Blocked provider configuration messaging.

Add E2E coverage for:

- Add a temp directory as a watched folder in an isolated profile.
- Create a new file after the app is open.
- Verify a queued suggestion appears through a stubbed or deterministic test analysis path.
- Apply the suggestion and verify the file is renamed.
- Restart the app and verify persisted watch-folder configuration and queue state.

## Acceptance Criteria

- Watching is opt-in and scoped to workspace-configured folders.
- No file is renamed without explicit user action.
- New stable files appear in a persisted review queue.
- The same validation and conflict boundaries used by manual rename apply to watched suggestions.
- Watchers clean up on app quit, workspace change, and folder disable/remove.
- The feature passes `npm run check`, focused Jest tests, and an Electron E2E flow.

