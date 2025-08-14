# timezap — TODO / Roadmap

Created: 2025-08-13 20:03 (America/Toronto)

This file tracks high-level phases for the timezap VS Code extension and logs progress as phases are started/completed. Sensible defaults: idleTimeoutSeconds=300, persistIntervalSeconds=30, aggregateBy="folder", storage.method="globalState", autoStart=true, showStatusBar=true.

---

## Phases

### Phase 1 — Scaffolding & package.json (In Progress)
Goal: Prepare extension metadata, activation events, commands and configuration so the extension can register new functionality cleanly.
Tasks:
- [x] Create this todo.md
- [x] Update `package.json`:
  - Add `activationEvents` (e.g. `onStartupFinished`, `onCommand:*` as needed)
  - Add `contributes.commands` for: showDashboard, showSummary, exportData, importData, resetData, startTracking, stopTracking, toggleAutoStart
  - Add `contributes.configuration` settings for idleTimeoutSeconds, persistIntervalSeconds, aggregateBy, storage.method, autoStart, showStatusBar
- [x] Add basic placeholder source files:
  - `src/commands.ts` (command handlers wiring)
  - `src/timeService.ts` (skeleton) — created
  - `src/storage.ts` (skeleton)
  - `src/statusBar.ts` (skeleton)
  - `src/dashboard/webview.ts` (skeleton)
- [x] Run initial build (webpack) and ensure extension activates with no errors — verified by user

Progress log:
- 2025-08-13 20:03 — Phase 1 started. Created todo.md and outlined tasks.
- 2025-08-13 20:04 — Updated package.json (activationEvents, commands, configuration) and created `src/timeService.ts` skeleton.
- 2025-08-13 20:08 — Added Storage, StatusBar, Commands, Dashboard skeletons and wired extension activation. Initial build/run verified by user.

---

### Phase 2 — Core TimeService (In Progress)
Goal: Implement TimeService to track active editor, detect idle, accumulate seconds per workspace folder (and optionally per-file).
Tasks:
- [x] Implement event listeners: onDidChangeActiveTextEditor, onDidChangeTextDocument, onDidChangeTextEditorSelection, onDidChangeWindowState
- [x] Implement idle detection (default 5 minutes) and session tick (1s or batched)
- [x] Implement aggregation by folder and optional per-file
- [x] Expose events for UI updates (EventEmitter)

---

### Phase 3 — Persistence & Storage (In Progress)
Goal: Implement storage abstraction using `context.globalState` with debounce/persistInterval and import/export helpers.
Tasks:
- [x] Implement `src/storage.ts` for load/save/export/import
- [x] Debounce writes (default 30s) and flush on deactivate — basic debounce implemented (1s window) in scaffold
- [ ] Optional workspace-file storage mode (.vscode/timezap.json)

---

### Phase 4 — Status Bar & Commands (Completed)
Goal: Add status bar UI and command implementations for quick interactions.
Tasks:
- [x] Implement `src/statusBar.ts` showing current session and today's total (basic) — completed
- [x] Implement command handlers in `src/commands.ts` (start/stop/show summary/exports/imports/reset) — basic implementations present
- [x] Wire status bar click to open dashboard — completed

---

### Phase 5 — Dashboard Webview (In Progress)
Goal: Provide a webview dashboard with totals, top folders/files and a small chart for daily time.
Tasks:
- [x] Implement `src/dashboard/webview.ts` — created
- [x] Add simple chart (Chart.js via CDN or minimal inline chart) — implemented in webview
- [x] Implement messaging between extension and webview for initial data and series (live updates pending)

---

### Phase 6 — Wiring, Tests & Documentation (In Progress)
Goal: Connect components, add unit tests and update README/privacy notes.
Tasks:
- [x] Update `src/extension.ts` to wire services, commands and dispose on deactivate — completed (basic wiring present)
- [x] Add unit tests for accumulation and idle detection — added `src/test/timeService.test.ts`
- [x] Update README.md with usage, privacy and settings — updated
- [x] Add CHANGELOG entries — added Unreleased notes in CHANGELOG.md

---

### Phase 7 — Packaging & Release (Not started)
Goal: Finalize packaging, run ESLint/TypeScript checks, build production bundle and create VSIX if desired.
Tasks:
- [ ] Run `npm run lint`, `npm run compile` and `npm run package`
- [ ] Test extension in VS Code (vscode-test)
- [ ] Publish VSIX or prepare marketplace release notes

---

## Progress Log
- 2025-08-13 20:03 — Created todo.md and started Phase 1.

---

When I complete each phase I will update this file's progress log and task checkboxes. Beginning next: I will update `package.json` to add activation events, commands and configuration (Phase 1 tasks).
