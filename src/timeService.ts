// TimeService — core tracking implementation (MVP-level).
// - Tracks active editor activity and accumulates seconds per workspace folder
//   (and optionally per-file).
// - Detects idle based on editor/document/window activity.
// - Persists periodically via the provided Storage abstraction.
//
// Notes:
// - This is an MVP implementation intended to be expanded/optimized later.
// - It uses a simple 1s tick to accumulate time and a debounce-based persist.

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import Storage, { PersistedData } from './storage';

export interface TimeServiceConfig {
  idleTimeoutSeconds: number;
  persistIntervalSeconds: number;
  aggregateBy: 'folder' | 'file';
  autoStart: boolean;
}

export interface SessionInfo {
  running: boolean;
  lastActivity?: number;
  activeFile?: string;
  activeWorkspace?: string;
  config: TimeServiceConfig;
}

/**
 * Helper: returns YYYY-MM-DD for a Date
 */
function dateKeyFor(ts = Date.now()): string {
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}

/**
 * TimeService
 */
export class TimeService {
  private context: vscode.ExtensionContext;
  private storage: Storage;
  private config: TimeServiceConfig;
  private running = false;

  // accumulation data loaded from storage
  private data: PersistedData = {};

  // runtime tracking
  private lastActivity = Date.now();
  private lastTick = Date.now();
  private activeFile?: string;
  private activeWorkspace?: string;
  private idle = false;

  // timers and listeners
  private tickTimer?: NodeJS.Timeout;
  private persistTimer?: NodeJS.Timeout;
  private disposables: vscode.Disposable[] = [];

  private emitter = new EventEmitter();

  constructor(context: vscode.ExtensionContext, storage: Storage, config?: Partial<TimeServiceConfig>) {
    this.context = context;
    this.storage = storage;
    this.config = {
      idleTimeoutSeconds: 300,
      persistIntervalSeconds: 30,
      aggregateBy: 'folder',
      autoStart: true,
      ...config
    };

    // conservative initial load (non-blocking)
    this.storage.load().then(d => {
      this.data = d || {};
      this.emitter.emit('update', { loaded: true });
    }).catch(err => {
      console.error('TimeZap: failed to load persisted data', err);
      this.data = {};
    });
  }

  onDidUpdate(listener: (...args: any[]) => void) {
    this.emitter.on('update', listener);
  }

  offDidUpdate(listener: (...args: any[]) => void) {
    this.emitter.off('update', listener);
  }

  getCurrentSessionInfo(): SessionInfo {
    return {
      running: this.running,
      lastActivity: this.lastActivity,
      activeFile: this.activeFile,
      activeWorkspace: this.activeWorkspace,
      config: this.config
    };
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.idle = false;
    this.lastActivity = Date.now();
    this.lastTick = Date.now();

    // attach listeners
    this.attachListeners();

    // start tick timer (1s)
    this.tickTimer = setInterval(() => this.onTick(), 1000);

    // start periodic persist timer
    this.persistTimer = setInterval(() => this.persist(), this.config.persistIntervalSeconds * 1000);

    this.emitter.emit('update', { running: true });
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.detachListeners();
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = undefined;
    }
    // persist final state
    this.persist().catch(err => {
      console.error('TimeZap: failed to persist on stop', err);
    });
    this.emitter.emit('update', { running: false });
  }

  dispose(): void {
    this.stop();
    this.emitter.removeAllListeners();
  }

  private attachListeners() {
    // editor change -> treat as activity & update active file/workspace
    this.disposables.push(vscode.window.onDidChangeActiveTextEditor(e => {
      if (e && e.document) {
        this.onActivityForEditor(e);
      } else {
        this.activeFile = undefined;
        this.activeWorkspace = undefined;
        this.emitter.emit('update', { activeFile: this.activeFile });
      }
    }));

    // typing / document change -> activity
    this.disposables.push(vscode.workspace.onDidChangeTextDocument(() => this.markActivity()));
    // selection change (cursor move) -> activity
    this.disposables.push(vscode.window.onDidChangeTextEditorSelection(() => this.markActivity()));
    // window focus/blur
    this.disposables.push(vscode.window.onDidChangeWindowState(state => {
      if (state.focused) {
        this.markActivity();
      } else {
        // on blur, we still wait for idleTimeout before marking idle
        this.markActivity();
      }
    }));
  }

  private detachListeners() {
    while (this.disposables.length) {
      const d = this.disposables.pop();
      try { d?.dispose(); } catch {}
    }
  }

  private onActivityForEditor(editor: vscode.TextEditor | undefined) {
    if (!editor || !editor.document) {
      this.activeFile = undefined;
      this.activeWorkspace = undefined;
      this.markActivity();
      return;
    }
    const uri = editor.document.uri;
    this.activeFile = uri.fsPath;
    const wf = vscode.workspace.getWorkspaceFolder(uri);
    this.activeWorkspace = wf ? wf.uri.toString() : 'untitled';
    this.markActivity();
    this.emitter.emit('update', { activeFile: this.activeFile, activeWorkspace: this.activeWorkspace });
  }

  private markActivity() {
    this.lastActivity = Date.now();
    if (this.idle) {
      this.idle = false;
      // resume lastTick so we don't overcount
      this.lastTick = Date.now();
      this.emitter.emit('update', { idle: false });
    }
  }

  private async onTick() {
    if (!this.running) {
      return;
    }

    const now = Date.now();

    // detect idle
    if ((now - this.lastActivity) >= this.config.idleTimeoutSeconds * 1000) {
      if (!this.idle) {
        this.idle = true;
        this.emitter.emit('update', { idle: true });
      }
      // do not accumulate while idle
      this.lastTick = now;
      return;
    }

    // accumulate delta seconds into data model
    const deltaSec = Math.floor((now - this.lastTick) / 1000);
    if (deltaSec <= 0) {
      return;
    }
    this.lastTick = now;

    const workspaceKey = this.activeWorkspace || 'untitled';
    const fileKey = this.activeFile || 'untitled';

    const day = dateKeyFor(now);

    // ensure structure
    if (!this.data.workspaceFolders) {
      this.data.workspaceFolders = {};
    }
    if (!this.data.workspaceFolders[workspaceKey]) {
      this.data.workspaceFolders[workspaceKey] = { meta: { path: workspaceKey }, dates: {} };
    }
    const ws = this.data.workspaceFolders[workspaceKey];
    if (!ws.dates) {
      ws.dates = {};
    }
    if (!ws.dates[day]) {
      ws.dates[day] = { totalSeconds: 0, byFile: {}, byFolder: {} };
    }
    const dayBucket = ws.dates[day];
    dayBucket.totalSeconds = (dayBucket.totalSeconds || 0) + deltaSec;

    if (this.config.aggregateBy === 'file') {
      dayBucket.byFile[fileKey] = (dayBucket.byFile[fileKey] || 0) + deltaSec;
    } else {
      // aggregate by folder relative to workspace (simple dirname)
      let folderKey = fileKey;
      try {
        const folderPath = require('path').relative(workspaceKey.startsWith('file://') ? vscode.Uri.parse(workspaceKey).fsPath : workspaceKey, fileKey);
        folderKey = folderPath.split(require('path').sep)[0] || '.';
      } catch {
        folderKey = fileKey;
      }
      dayBucket.byFolder[folderKey] = (dayBucket.byFolder[folderKey] || 0) + deltaSec;
    }

    // emit update for UI components to refresh
    this.emitter.emit('update', { workspace: workspaceKey, day, deltaSec, total: dayBucket.totalSeconds });

    // Note: persistence is handled by periodic persistTimer
  }

  private async persist(): Promise<void> {
    try {
      await this.storage.save(this.data);
      this.emitter.emit('persisted');
    } catch (err) {
      console.error('TimeZap: persist error', err);
    }
  }

  // simple helper to get today's summary for current workspace
  async getTodaySummaryForWorkspace(workspaceUri?: string) {
    const wsKey = workspaceUri || this.activeWorkspace || 'untitled';
    const day = dateKeyFor(Date.now());
    const loaded = await this.storage.load();
    const ws = loaded.workspaceFolders && loaded.workspaceFolders[wsKey];
    if (!ws || !ws.dates || !ws.dates[day]) {
      return { totalSeconds: 0, byFile: {}, byFolder: {} };
    }
    return ws.dates[day];
  }

  /**
   * Return time series data for several ranges for the given workspace.
   * Produces contiguous arrays for 7d and 30d (including zeros) and for 1y (last 365 days).
   * 'all' returns sorted existing day buckets.
   *
   * Result shape:
   * { "7d": [{date: "2025-08-07", totalSeconds: 123}, ...], "30d": [...], "1y": [...], "all": [...] }
   */
  async getTimeSeriesForWorkspaceRanges(workspaceUri?: string) {
    const wsKey = workspaceUri || this.activeWorkspace || 'untitled';
    const loaded = await this.storage.load();
    const ws = loaded.workspaceFolders && loaded.workspaceFolders[wsKey];
    const result: { [k: string]: { date: string; totalSeconds: number }[] } = {
      '7d': [],
      '30d': [],
      '1y': [],
      'all': []
    };

    if (!ws || !ws.dates) {
      // produce empty ranges (7d/30d/1y with zeros for continuity)
      const today = new Date();
      const makeRange = (days: number) => {
        const arr: { date: string; totalSeconds: number }[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          arr.push({ date: dateKeyFor(d.getTime()), totalSeconds: 0 });
        }
        return arr;
      };
      result['7d'] = makeRange(7);
      result['30d'] = makeRange(30);
      result['1y'] = makeRange(365);
      result['all'] = [];
      return result;
    }

    // Collect existing day keys and totals
    const dayEntries: { date: string; totalSeconds: number }[] = Object.keys(ws.dates).map(k => {
      return { date: k, totalSeconds: ws.dates[k].totalSeconds || 0 };
    }).sort((a, b) => a.date.localeCompare(b.date));

    // ALL: include all existing day entries sorted
    result['all'] = dayEntries.slice();

    // Helper to build contiguous range ending today
    const buildContiguous = (days: number) => {
      const out: { date: string; totalSeconds: number }[] = [];
      const today = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = dateKeyFor(d.getTime());
        const found = ws.dates[key];
        out.push({ date: key, totalSeconds: found ? (found.totalSeconds || 0) : 0 });
      }
      return out;
    };

    result['7d'] = buildContiguous(7);
    result['30d'] = buildContiguous(30);

    // 1y: build contiguous last 365 days
    result['1y'] = buildContiguous(365);

    return result;
  }
}

export default TimeService;