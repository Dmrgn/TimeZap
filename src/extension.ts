// Entry point for the TimeZap extension — wires services, commands and UI.

import * as vscode from 'vscode';
import TimeService from './timeService';
import Storage from './storage';
import StatusBar from './statusBar';
import registerCommands from './commands';

let timeService: TimeService | undefined;
let storage: Storage | undefined;
let statusBar: StatusBar | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('TimeZap: activating extension');

  storage = new Storage(context);
  timeService = new TimeService(context, storage);
  statusBar = new StatusBar(timeService);

  // Register commands and get disposables
  registerCommands(context, timeService, storage, statusBar);

  // Auto-start if configured
  const cfg = vscode.workspace.getConfiguration();
  const autoStart = cfg.get<boolean>('timezap.autoStart', true);
  if (autoStart) {
    timeService.start();
    statusBar.update('TimeZap: tracking');
  } else {
    statusBar.update('TimeZap: idle');
  }

  // Keep references on context for easier debugging
  context.subscriptions.push({
    dispose: () => {
      // nothing here; components will be disposed in deactivate
    }
  });

  console.log('TimeZap: activated');
}

export function deactivate() {
  console.log('TimeZap: deactivating extension');
  try {
    timeService?.dispose();
  } catch (err) {
    console.error('TimeZap: error disposing TimeService', err);
  }
  try {
    statusBar?.dispose();
  } catch (err) {
    console.error('TimeZap: error disposing StatusBar', err);
  }
  // Storage does not need explicit dispose in this scaffold, but if there are
  // pending writes they should be flushed here in a full implementation.
  console.log('TimeZap: deactivated');
}
