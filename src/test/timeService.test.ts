import * as assert from 'assert';
import TimeService from '../timeService';

// Minimal fake storage to inject into TimeService for tests
class FakeStorage {
  private data: any;
  constructor(initial: any) {
    this.data = initial || {};
  }
  async load() {
    return this.data;
  }
  async save(d: any) {
    this.data = d;
  }
  async exportToJson() {
    return JSON.stringify(this.data, null, 2);
  }
  async importFromJson(json: string) {
    this.data = JSON.parse(json);
  }
}

suite('TimeService - time series', () => {
  test('getTimeSeriesForWorkspaceRanges returns contiguous ranges and all buckets', async () => {
    // Prepare fake persisted data for workspace 'untitled' with a couple of day buckets
    const today = new Date();
    const k = (d: Date) => d.toISOString().slice(0, 10);

    const d0 = new Date(today);
    const d1 = new Date(today); d1.setDate(d1.getDate() - 1);
    const d3 = new Date(today); d3.setDate(d3.getDate() - 3);

    const data: any = {
      workspaceFolders: {
        'untitled': {
          meta: { path: 'untitled' },
          dates: {}
        }
      }
    };
    data.workspaceFolders['untitled'].dates[k(d0)] = { totalSeconds: 3600 };
    data.workspaceFolders['untitled'].dates[k(d1)] = { totalSeconds: 1800 };
    data.workspaceFolders['untitled'].dates[k(d3)] = { totalSeconds: 600 };
    
    const fakeStorage = new FakeStorage(data);
    
    // Pass a dummy context (TimeService doesn't use it heavily in the tested methods)
    // Cast fakeStorage as any to match TimeService storage parameter in tests.
    const ts = new TimeService((null as unknown) as any, fakeStorage as any);

    const ranges = await ts.getTimeSeriesForWorkspaceRanges('untitled');

    // 7d,30d,1y lengths
    assert.strictEqual(ranges['7d'].length, 7, '7d length should be 7');
    assert.strictEqual(ranges['30d'].length, 30, '30d length should be 30');
    assert.strictEqual(ranges['1y'].length, 365, '1y length should be 365');

    // 'all' should include exactly the 3 day entries we set
    const all = ranges['all'];
    assert.strictEqual(all.length, 3, 'all should contain 3 recorded days');
    const totals = all.map((e: any) => e.totalSeconds).reduce((a: number, b: number) => a + b, 0);
    assert.strictEqual(totals, 3600 + 1800 + 600, 'sum of all totals should match inserted values');

    // 7d contiguous must include the three days at the correct keys
    const keys7 = ranges['7d'].map((e: any) => e.date);
    const key0 = k(d0);
    const key1 = k(d1);
    const key3 = k(d3);
    assert.ok(keys7.includes(key0), '7d should include today');
    assert.ok(keys7.includes(key1), '7d should include yesterday');
    assert.ok(keys7.includes(key3), '7d should include 3 days ago');
  });
});
