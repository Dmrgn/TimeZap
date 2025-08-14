# Change Log

All notable changes to the "timezap" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- Initial MVP tracking of editor activity with idle detection and per-day aggregation.
- Dashboard webview with today's buckets and selectable time-series (7d, 30d, 1y, All).
- Status bar item showing formatted "today" total for active workspace.
- Export / import JSON for persisted data.
- Unit test for time-series generation (`src/test/timeService.test.ts`).

### Changed
- Storage implemented using `context.globalState` with debounced saves.
- Package scaffolding and commands (`timezap.showDashboard`, `timezap.showSummary`, `timezap.exportData`, `timezap.importData`, `timezap.resetData`, `timezap.startTracking`, `timezap.stopTracking`, `timezap.toggleAutoStart`).

### Fixed
- N/A

### Notes
- Live dashboard updates, workspace-file storage, CSV export, and additional tests are planned next.
