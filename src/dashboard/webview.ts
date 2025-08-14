// Dashboard webview for TimeZap:
// - Shows a bar chart for today's buckets (folders or files) with human-friendly time labels.
// - Shows a time-series chart beneath for selected ranges: 7d, 30d, 1y, all.
// - Expects payloads from the extension in the shape:
//   { today: { totalSeconds, buckets }, series: { "7d": [...], "30d": [...], "1y": [...], "all": [...] } }
// - The extension posts an initial payload when the panel is opened; the webview supports user-controlled range selection.

import * as vscode from 'vscode';

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private lastPayload: any = {};

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;

    this.panel.webview.onDidReceiveMessage(
      message => {
        // Webview -> extension messages handled here if needed in future.
        // Currently the webview requests no additional extension-side actions.
        // Keep placeholder for future interactions.
      },
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      return DashboardPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'timezapDashboard',
      'TimeZap Dashboard',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri]
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel);
    DashboardPanel.currentPanel.updateHtml();
    return DashboardPanel.currentPanel;
  }

  public dispose() {
    DashboardPanel.currentPanel = undefined;

    // Clean up
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      try { d?.dispose(); } catch {}
    }
  }

  public postData(payload: any) {
    // Keep last payload for later (user-driven refresh)
    this.lastPayload = payload || {};
    this.panel.webview.postMessage({ command: 'data', payload: this.lastPayload });
  }

  private updateHtml() {
    // Using Chart.js CDN for simple visuals
    const chartCdn = 'https://cdn.jsdelivr.net/npm/chart.js';

    this.panel.webview.html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data: https:; script-src https: 'unsafe-inline'; style-src 'unsafe-inline' https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TimeZap Dashboard</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial; padding: 12px; color: var(--fg); background: var(--bg); }
    h1 { font-size: 1.2rem; margin: 0 0 8px 0; }
    #summary { margin-bottom: 12px; }
    #controls { margin-bottom: 8px; }
    button.range { margin-right: 6px; padding: 6px 10px; border-radius: 4px; border: 1px solid rgba(125,125,125,0.15); background: transparent; color: var(--fg); cursor: pointer; }
    button.range.active { background: rgba(54,162,235,0.12); }
    .chart-wrap { margin-bottom: 18px; }
    canvas { width: 100%; max-width: 100%; height: 220px; }
    .meta { color: var(--muted); font-size: 0.9rem; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>TimeZap — Today</h1>
  <div id="summary">Loading…</div>

  <div class="chart-wrap">
    <canvas id="bucketsChart" width="600" height="220"></canvas>
  </div>

  <div id="controls">
    Range:
    <button class="range" data-range="7d">7 days</button>
    <button class="range" data-range="30d">30 days</button>
    <button class="range" data-range="1y">1 year</button>
    <button class="range active" data-range="all">All</button>
  </div>

  <div class="chart-wrap">
    <canvas id="seriesChart" width="800" height="220"></canvas>
  </div>

  <div id="seriesTotal" style="margin-bottom:8px;font-weight:600">Total (selected range): Loading…</div>

  <div class="meta">Data is stored locally and not sent anywhere.</div>

  <script src="${chartCdn}"></script>
  <script>
    const vscode = acquireVsCodeApi();

    // Helpers
    function formatSecondsHuman(s) {
      if (!s || s <= 0) return '0s';
      const hours = Math.floor(s / 3600);
      const minutes = Math.floor((s % 3600) / 60);
      const seconds = s % 60;
      if (hours > 0) return hours + 'h ' + minutes + 'm';
      if (minutes > 0) return minutes + 'm ' + seconds + 's';
      return seconds + 's';
    }

    function buildBucketsPayload(buckets) {
      // Convert buckets object to sorted arrays, format labels to include human time
      const entries = Object.keys(buckets || {}).map(k => ({ k, v: buckets[k] || 0 }));
      // Sort descending by seconds
      entries.sort((a,b) => (b.v - a.v));
      const labels = entries.map(e => e.k);
      const data = entries.map(e => e.v);
      const formattedLabels = entries.map(e => \`\${e.k} — \${formatSecondsHuman(e.v)}\`);
      return { labels, data, formattedLabels };
    }

    // Charts
    const bucketsCtx = document.getElementById('bucketsChart').getContext('2d');
    const seriesCtx = document.getElementById('seriesChart').getContext('2d');

    let bucketsChart = null;
    let seriesChart = null;

    function renderBuckets(payload) {
      const prepared = buildBucketsPayload(payload.buckets || {});
      const labels = prepared.formattedLabels;
      const data = prepared.data;

      if (bucketsChart) {
        bucketsChart.data.labels = labels;
        bucketsChart.data.datasets[0].data = data;
        bucketsChart.update();
      } else {
        bucketsChart = new Chart(bucketsCtx, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Seconds',
              data,
              backgroundColor: 'rgba(54, 162, 235, 0.6)'
            }]
          },
          options: {
            indexAxis: 'y',
            scales: {
              x: { beginAtZero: true }
            },
            plugins: {
              tooltip: {
                callbacks: {
                  label: context => {
                    const v = context.raw || 0;
                    return formatSecondsHuman(v);
                  }
                }
              }
            }
          }
        });
      }
    }

    function renderSeries(rangeKey, seriesData) {
      const arr = seriesData && seriesData[rangeKey] ? seriesData[rangeKey] : [];
      const labels = arr.map(x => x.date);
      const data = arr.map(x => Math.round(x.totalSeconds / 60)); // show minutes on chart for readability

      const unit = 'minutes';

      const title = rangeKey === 'all' ? 'All time (days)' : \`\${rangeKey} (days)\`;

      if (seriesChart) {
        seriesChart.data.labels = labels;
        seriesChart.data.datasets[0].data = data;
        seriesChart.options.plugins.title.text = title;
        seriesChart.update();
      } else {
        seriesChart = new Chart(seriesCtx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Minutes',
              data,
              borderColor: 'rgba(75,192,192,0.9)',
              backgroundColor: 'rgba(75,192,192,0.2)',
              fill: true,
              tension: 0.2
            }]
          },
          options: {
            plugins: {
              title: { display: true, text: title },
              tooltip: {
                callbacks: {
                  label: context => {
                    const minutes = context.raw || 0;
                    const secs = Math.round(minutes * 60);
                    return formatSecondsHuman(secs);
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: v => v + 'm'
                }
              }
            }
          }
        });
      }
    }

    // Range controls
    const rangeButtons = Array.from(document.querySelectorAll('button.range'));
    let activeRange = 'all';

    function updateSeriesTotal(rangeKey, seriesData) {
      const arr = seriesData && seriesData[rangeKey] ? seriesData[rangeKey] : [];
      const totalSeconds = arr.reduce((acc, x) => acc + (x.totalSeconds || 0), 0);
      const el = document.getElementById('seriesTotal');
      if (el) el.textContent = 'Total (' + rangeKey + '): ' + formatSecondsHuman(totalSeconds);
    }

    rangeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        rangeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeRange = btn.getAttribute('data-range');
        // re-render series chart if we have series data
        if (window.latestSeries) {
          renderSeries(activeRange, window.latestSeries);
          updateSeriesTotal(activeRange, window.latestSeries);
        }
      });
    });

    // Keep latest data accessible
    window.latestPayload = {};
    window.latestSeries = null;

    window.addEventListener('message', event => {
      const msg = event.data;
      if (!msg) return;
      if (msg.command === 'data') {
        const payload = msg.payload || {};
        window.latestPayload = payload;
        // summary
        const today = payload.today || { totalSeconds: 0, buckets: {} };
        document.getElementById('summary').textContent = 'Total today: ' + formatSecondsHuman(today.totalSeconds || 0);

        renderBuckets(today);

        // series: payload.series expected to contain ranges
        window.latestSeries = payload.series || null;
        if (window.latestSeries) {
          renderSeries(activeRange, window.latestSeries);
        } else {
          // clear series chart if no data
          if (seriesChart) {
            seriesChart.data.labels = [];
            seriesChart.data.datasets[0].data = [];
            seriesChart.update();
          }
        }
      }
    });

    // notify extension we're ready to receive initial data
    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
  }
}

export default DashboardPanel;
