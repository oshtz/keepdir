# keepdir Architecture

keepdir is a local-first Electron desktop app. There is no app-level user account system; user data lives on the machine, and AI provider access is configured with provider API keys or local model servers.

## Process Model

- `src/main/main.js` owns Electron windows, IPC handlers, filesystem access, AI analysis orchestration, import/export, and update operations.
- `src/main/preload.js` exposes a constrained `window.electronAPI` bridge to the renderer.
- `src/renderer/App.tsx` and the renderer components own UI state, user interactions, and calls through the preload bridge.
- `src/renderer/electron.d.ts` is the renderer-side IPC contract. Keep this file aligned with preload and main handler behavior when adding or changing bridge calls.

## Local Storage

- `src/main/database.js` stores workspaces, workspace settings, custom sections, operation history settings, and file analysis cache in SQLite.
- The app uses WAL mode and local cache cleanup/optimization utilities.
- Export/import flows serialize workspace or full-app data to JSON files chosen by the user.

## AI Providers

- Provider adapters live under `src/main/providers/`.
- Cloud providers use provider API keys from local settings.
- Ollama and LM Studio talk to local servers and do not need app accounts.
- Main-process analysis validates selected files, batches requests, extracts JSON model output with `src/main/jsonExtraction.js`, and normalizes suggestions before they reach the renderer.

## Safety Boundaries

- The renderer does not receive Node.js access directly.
- IPC payloads are normalized in `ipcValidation.js`, `stateValidation.js`, `suggestionValidation.js`, and `importValidation.js`.
- File operations are applied in the main process and return structured partial-success results for recovery UI.

## Verification

- `npm run typecheck` checks TypeScript.
- `npm run lint` runs the staged ESLint gate.
- `npm run format:check` checks config/docs formatting.
- `npm run test:ci` runs the Jest suite.
- `npm run test:e2e` launches the real Electron shell with Playwright against the dev renderer.
- `npm run build` builds the renderer bundle.
- `npm run check` runs typecheck, lint, Jest, and build.
