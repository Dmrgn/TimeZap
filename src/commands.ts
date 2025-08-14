// Command registrations for TimeZap.
// Provides basic implementations for the main commands using the provided
// TimeService and Storage skeletons. These are intentionally lightweight
// placeholders so the extension can be run/tested while we implement full logic.

import * as vscode from 'vscode';
import TimeService from './timeService';
import Storage from './storage';
import StatusBar from './statusBar';
import DashboardPanel from './dashboard/webview';

export function registerCommands(
  context: vscode.ExtensionContext,
  timeService: TimeService,
  storage: Storage,
  statusBar?: StatusBar
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand('timezap.showDashboard', async () => {
      // Open the dashboard and post today's summary + series for the active workspace
      const panel = DashboardPanel.createOrShow(context.extensionUri);
      try {
        const summary = await timeService.getTodaySummaryForWorkspace();
        const series = await timeService.getTimeSeriesForWorkspaceRanges();
        const aggregateBy = timeService.getCurrentSessionInfo().config.aggregateBy;
        const buckets = aggregateBy === 'file' ? summary.byFile : summary.byFolder;
        panel.postData({
          today: { totalSeconds: summary.totalSeconds || 0, buckets: buckets || {} },
          series: series || {}
        });
      } catch (err) {
        console.error('TimeZap: failed to prepare dashboard data', err);
        vscode.window.showErrorMessage('TimeZap: Failed to load dashboard data.');
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('timezap.showSummary', async () => {
      const session = timeService.getCurrentSessionInfo();
      const stored = await storage.load();
      // Minimal summary while full aggregation is implemented later:
      const runningText = session.running ? 'running' : 'stopped';
      vscode.window.showInformationMessage(`TimeZap is currently ${runningText}. Stored items: ${Object.keys(stored || {}).length}`);
    })
  );

  disposables.push(
    vscode.commands.registerCommand('timezap.exportData', async () => {
      try {
        const json = await storage.exportToJson();
        const uri = await vscode.window.showSaveDialog({
          filters: { 'JSON': ['json'] },
          defaultUri: vscode.Uri.file('timezap-export.json'),
          saveLabel: 'Export TimeZap Data'
        });
        if (!uri) {
          return;
        }
        await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
        vscode.window.showInformationMessage(`TimeZap: Exported data to ${uri.fsPath}`);
      } catch (err) {
        vscode.window.showErrorMessage(`TimeZap: Export failed — ${String(err)}`);
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('timezap.importData', async () => {
      try {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: false,
          filters: { 'JSON': ['json'] },
          openLabel: 'Import TimeZap Data'
        });
        if (!uris || uris.length === 0) {
          return;
        }
        const content = await vscode.workspace.fs.readFile(uris[0]);
        const json = content.toString();
        await storage.importFromJson(json);
        vscode.window.showInformationMessage(`TimeZap: Imported data from ${uris[0].fsPath}`);
      } catch (err) {
        vscode.window.showErrorMessage(`TimeZap: Import failed — ${String(err)}`);
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('timezap.resetData', async () => {
      const confirmed = await vscode.window.showWarningMessage(
        'TimeZap: Reset all tracked data for this environment? This cannot be undone.',
        { modal: true },
        'Reset'
      );
      if (confirmed === 'Reset') {
        await storage.save({});
        vscode.window.showInformationMessage('TimeZap: Data reset.');
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('timezap.startTracking', async () => {
      timeService.start();
      statusBar?.update('TimeZap: tracking');
      vscode.window.showInformationMessage('TimeZap: Tracking started.');
    })
  );

  disposables.push(
    vscode.commands.registerCommand('timezap.stopTracking', async () => {
      timeService.stop();
      statusBar?.update('TimeZap: stopped');
      vscode.window.showInformationMessage('TimeZap: Tracking stopped.');
    })
  );

  disposables.push(
    vscode.commands.registerCommand('timezap.toggleAutoStart', async () => {
      const cfg = vscode.workspace.getConfiguration();
      const cur = cfg.get<boolean>('timezap.autoStart', true);
      await cfg.update('timezap.autoStart', !cur, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`TimeZap: autoStart set to ${!cur}`);
    })
  );

  // Register all disposables on the extension context so they are disposed automatically
  context.subscriptions.push(...disposables);
  return disposables;
}

export default registerCommands;
