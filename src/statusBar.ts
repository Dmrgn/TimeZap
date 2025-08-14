// StatusBar integrates with TimeService to show live session info and today's total.

import * as vscode from 'vscode';
import TimeService, { SessionInfo } from './timeService';

function formatSecondsHuman(s: number): string {
  if (!s || s <= 0) {
    return '0s';
  } 
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export class StatusBar {
  private item: vscode.StatusBarItem;
  private timeService?: TimeService;
  private listener?: (...args: any[]) => void;

  constructor(timeService?: TimeService) {
    this.timeService = timeService;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.tooltip = 'TimeZap — click to open dashboard';
    this.item.command = 'timezap.showDashboard';
    this.item.show();

    this.item.text = 'TimeZap: initializing';

    if (this.timeService) {
      this.listener = () => { void this.refresh(); };
      this.timeService.onDidUpdate(this.listener);
      void this.refresh();
    }
  }

  /**
   * Refresh the status bar text using TimeService summary for today.
   * Shows formatted total seconds for the active workspace (today).
   */
  async refresh() {
    try {
      const info: SessionInfo = this.timeService ? this.timeService.getCurrentSessionInfo() : { running: false, config: { idleTimeoutSeconds: 300, persistIntervalSeconds: 30, aggregateBy: 'folder', autoStart: true } };
      const ws = info.activeWorkspace;
      const summary = await this.timeService?.getTodaySummaryForWorkspace(ws);
      const total = summary?.totalSeconds || 0;
      const human = formatSecondsHuman(total);
      const status = info.running ? `${human} (live)` : human;
      this.item.text = `TimeZap: ${status}`;
      this.item.show();
    } catch (err) {
      // Fallback to simple running/idle text
      const info: SessionInfo = this.timeService ? this.timeService.getCurrentSessionInfo() : { running: false, config: { idleTimeoutSeconds: 300, persistIntervalSeconds: 30, aggregateBy: 'folder', autoStart: true } };
      const text = info.running ? 'TimeZap: tracking' : 'TimeZap: idle';
      this.item.text = text;
      this.item.show();
      console.error('TimeZap: status bar refresh failed', err);
    }
  }

  update(text: string) {
    this.item.text = text;
    this.item.show();
  }

  dispose() {
    if (this.listener && this.timeService) {
      this.timeService.offDidUpdate(this.listener);
    }
    this.item.dispose();
  }
}

export default StatusBar;
