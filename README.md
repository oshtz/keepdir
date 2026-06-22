# KeepDir

Local-first desktop automation for watched folders.

KeepDir is now a small Tauri app built around one loop: watch folders, evaluate ordered deterministic rules, show dry-run actions, and move files only after review.

## Features

- Watched folders with a native folder picker
- Ordered automation rules
- Case-insensitive matching by name, extension, source URL, and downloaded-from app
- Dry-run Rule Action Queue with trace, target path, status, and reason
- Safe apply path: rechecks file size/mtime, rejects stale files, target conflicts, traversal, and symlink target directories
- System tray icon with Show and Quit; closing the window hides it while the watcher keeps running

## Stack

- Tauri 2 + Rust native backend
- Vite 7 + React 18 + TypeScript
- Tailwind CSS + small local React components
- Local app-data JSON store

## Development

```powershell
npm install
npm run dev
```

## Checks

```powershell
npm run verify
```

Or run the pieces separately:

```powershell
npm run check
npm run audit:prod
npm run rust:test
npm run rust:clippy
npm run test:e2e
npm run test:runtime
```

`npm run check` includes Prettier, TypeScript, ESLint, Jest, and the production Vite build.
`npm run test:e2e` currently means a Tauri debug build smoke check.
`npm run test:runtime` launches the debug app against a temp watched folder and verifies a dry-run queue row.

## Manual Smoke

```powershell
npm run dev
```

1. Add a temp watched folder.
2. Add and enable a rule like `txt -> Sorted` with `{basename}-sorted.{ext}`.
3. Drop `invoice.txt` into the watched folder and wait for a `pending` queue row.
4. Apply the row and confirm the file moves only after review.
5. Close the window, reopen from tray, then Quit from the tray menu.

## Build

```powershell
npm run tauri:build
```

Windows release bundles are written under `src-tauri\target\release\bundle\`.
The GitHub release workflow requires macOS secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` for signed/notarized DMGs.

## Notes

No AI provider is called from watched folders. The old Electron explorer/AI app is preserved on the `electron-old` branch.
