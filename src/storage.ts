// Storage abstraction (skeleton).
// Responsible for loading/saving the aggregated time data.
// Currently a placeholder that uses context.globalState in future implementation.

import * as vscode from 'vscode';

export interface PersistedData {
  // structure will be defined in Phase 2/3
  [key: string]: any;
}

export class Storage {
  private context: vscode.ExtensionContext;
  private key = 'timezap.data';

  private pendingData?: PersistedData;
  private saveTimer?: NodeJS.Timeout;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async load(): Promise<PersistedData> {
    const data = this.context.globalState.get<PersistedData>(this.key, {});
    return data;
  }

  /**
   * Debounced save: schedule a save 1s later. If called again within the delay,
   * the previous save is replaced. This reduces frequent disk writes from timers.
   */
  async save(data: PersistedData): Promise<void> {
    this.pendingData = data;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    await new Promise<void>((resolve) => {
      this.saveTimer = setTimeout(async () => {
        try {
          await this.context.globalState.update(this.key, this.pendingData);
        } catch (err) {
          console.error('TimeZap: storage save failed', err);
        }
        this.saveTimer = undefined;
        this.pendingData = undefined;
        resolve();
      }, 1000);
    });
  }

  async exportToJson(): Promise<string> {
    const data = await this.load();
    return JSON.stringify(data, null, 2);
  }

  async importFromJson(json: string): Promise<void> {
    const data = JSON.parse(json);
    await this.save(data);
  }
}

export default Storage;
