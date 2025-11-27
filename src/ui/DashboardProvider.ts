import * as vscode from 'vscode';
import * as path from 'path';
import { LocalStorage } from '../storage/LocalStorage';

export class DashboardProvider {
    private panel: vscode.WebviewPanel | undefined;
    private onRefreshCallback?: () => Promise<void>;

    constructor(
        private context: vscode.ExtensionContext,
        private storage: LocalStorage
    ) {}

    public setRefreshCallback(callback: () => Promise<void>) {
        this.onRefreshCallback = callback;
    }

    public async show() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.panel) {
            this.panel.reveal(column);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'aiMetricsDashboard',
                'AI Impact Dashboard',
                column || vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
                    ],
                    retainContextWhenHidden: true
                }
            );

            this.panel.webview.html = await this.getHtmlContent();

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            }, null, this.context.subscriptions);

            this.panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'refresh':
                            await this.refreshData();
                            break;
                        case 'export':
                            await this.exportData();
                            break;
                    }
                },
                null,
                this.context.subscriptions
            );
        }

        await this.refreshData();
    }

    private async getHtmlContent(): Promise<string> {
        const stylePath = vscode.Uri.file(
            path.join(this.context.extensionPath, 'resources', 'styles.css')
        );
        const styleUri = this.panel!.webview.asWebviewUri(stylePath);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AI Impact Dashboard</title>
            <link href="${styleUri}" rel="stylesheet">
            <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
            <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        </head>
        <body class="material-theme">
            <div class="app-bar">
                <div class="app-bar-content">
                    <span class="material-icons-round app-logo">analytics</span>
                    <h1>TruthMeter AI</h1>
                    <div class="spacer"></div>
                    <button class="md-button" onclick="refreshData()">
                        <span class="material-icons-round">refresh</span>
                        Refresh
                    </button>
                    <button class="md-button outlined" onclick="exportReport()">
                        <span class="material-icons-round">download</span>
                        Export
                    </button>
                </div>
            </div>

            <main class="content">
                <div id="loadingState" class="loading-container">
                    <div class="spinner"></div>
                    <p>Analyzing productivity metrics...</p>
                </div>

                <div id="dashboardContent" style="display: none;">
                    
                    <!-- KPI Cards -->
                    <div class="kpi-grid">
                        <div class="md-card kpi-card primary">
                            <div class="card-header">
                                <span class="card-title">Net Productivity</span>
                                <span class="material-icons-round icon">speed</span>
                            </div>
                            <div class="card-body">
                                <div class="kpi-value" id="roiValue">--%</div>
                                <div class="kpi-sub">Actual Gain</div>
                            </div>
                            <div class="card-footer">
                                <span class="trend" id="roiTrend">--</span>
                                <span class="footer-text">vs. manual coding</span>
                            </div>
                        </div>

                        <div class="md-card kpi-card secondary">
                            <div class="card-header">
                                <span class="card-title">Time Impact</span>
                                <span class="material-icons-round icon">schedule</span>
                            </div>
                            <div class="card-body">
                                <div class="kpi-value" id="timeValue">--h</div>
                                <div class="kpi-sub">Net Saved/Week</div>
                            </div>
                            <div class="card-footer">
                                <span class="trend" id="timeTrend">--</span>
                                <span class="footer-text">accounting for cleanup</span>
                            </div>
                        </div>

                        <div class="md-card kpi-card warning">
                            <div class="card-header">
                                <span class="card-title">Code Churn</span>
                                <span class="material-icons-round icon">delete_sweep</span>
                            </div>
                            <div class="card-body">
                                <div class="kpi-value" id="churnValue">--%</div>
                                <div class="kpi-sub">Rewritten Code</div>
                            </div>
                            <div class="card-footer">
                                <span class="trend" id="churnTrend">--</span>
                                <span class="footer-text">AI code stability</span>
                            </div>
                        </div>

                        <div class="md-card kpi-card info">
                            <div class="card-header">
                                <span class="card-title">Duplication</span>
                                <span class="material-icons-round icon">content_copy</span>
                            </div>
                            <div class="card-body">
                                <div class="kpi-value" id="duplicationValue">--x</div>
                                <div class="kpi-sub">Growth Factor</div>
                            </div>
                            <div class="card-footer">
                                <span class="trend" id="duplicationTrend">--</span>
                                <span class="footer-text">vs. clean code</span>
                            </div>
                        </div>
                    </div>

                    <!-- Historical Trends Chart -->
                    <div class="md-card chart-card">
                        <div class="card-header-row">
                            <h2>Productivity vs. AI Usage Trend</h2>
                        </div>
                        <div class="chart-container" style="position: relative; height: 300px; width: 100%;">
                            <canvas id="productivityChart"></canvas>
                        </div>
                    </div>

                    <div class="grid-row">
                        <!-- Main Insight Card -->
                        <div class="md-card large-card">
                            <div class="card-header-row">
                                <h2>ROI Analysis</h2>
                                <div class="chip" id="roiStatus">--</div>
                            </div>
                            <div class="card-content-row">
                                <div class="metric-group">
                                    <label>Perceived Gain</label>
                                    <div class="progress-bar-container">
                                        <div class="progress-bar perceived" id="perceivedBar" style="width: 0%"></div>
                                    </div>
                                    <span class="metric-text" id="perceivedROI">--%</span>
                                </div>
                                <div class="metric-group">
                                    <label>Actual Gain</label>
                                    <div class="progress-bar-container">
                                        <div class="progress-bar actual" id="actualBar" style="width: 0%"></div>
                                    </div>
                                    <span class="metric-text" id="actualROI">--%</span>
                                </div>
                            </div>
                            <div class="insight-box">
                                <span class="material-icons-round">lightbulb</span>
                                <p id="roiInsight">Analysis pending...</p>
                            </div>
                        </div>

                        <!-- Quality Alerts -->
                        <div class="md-card list-card">
                            <div class="card-header-row">
                                <h2>Quality Insights</h2>
                            </div>
                            <div class="list-container" id="alertsList">
                                <!-- Alerts injected here -->
                            </div>
                        </div>
                    </div>

                    <!-- Methodology Section (Collapsible) -->
                    <div class="md-card collapsible-card">
                        <div class="card-header-row" onclick="toggleMethodology()">
                            <div class="title-group">
                                <span class="material-icons-round">science</span>
                                <h2>Research Methodology</h2>
                            </div>
                            <span class="material-icons-round expand-icon" id="methodologyIcon">expand_more</span>
                        </div>
                        <div class="card-content-hidden" id="methodologyContent">
                            <div class="methodology-grid">
                                <div class="method-item">
                                    <strong>The "Guesswork" Hypothesis (Churn):</strong>
                                    <p>High churn (>30%) on AI code often means the AI is "guessing"—providing plausible but wrong solutions you have to fix later. This wastes more time than writing it yourself.</p>
                                </div>
                                <div class="method-item">
                                    <strong>Net Time Impact (True ROI):</strong>
                                    <p>We calculate: <em>(Time Saved Writing) - (Review Time + Fix Time + Context Switch Cost)</em>. If negative, the AI is a net drag on speed.</p>
                                </div>
                                <div class="method-item">
                                    <strong>Flow Efficiency:</strong>
                                    <p>Productivity isn't just lines of code. It's uninterrupted "Deep Work". We track how often AI suggestions break your flow vs. keeping you in the zone.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <script>
                const vscode = acquireVsCodeApi();
                
                function refreshData() {
                    document.getElementById('loadingState').style.display = 'flex';
                    document.getElementById('dashboardContent').style.display = 'none';
                    vscode.postMessage({ command: 'refresh' });
                }

                function exportReport() {
                    vscode.postMessage({ command: 'export' });
                }

                function toggleMethodology() {
                    const content = document.getElementById('methodologyContent');
                    const icon = document.getElementById('methodologyIcon');
                    if (content.classList.contains('expanded')) {
                        content.classList.remove('expanded');
                        icon.textContent = 'expand_more';
                    } else {
                        content.classList.add('expanded');
                        icon.textContent = 'expand_less';
                    }
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateData') {
                        updateDashboard(message.data);
                    }
                });

                function updateDashboard(data) {
                    document.getElementById('loadingState').style.display = 'none';
                    document.getElementById('dashboardContent').style.display = 'block';

                    if (!data.hasData) {
                        // Show empty state or zeros
                    }

                    // Update ROI
                    const roi = data.roi || 0;
                    updateMetric('roi', (roi * 100).toFixed(0) + '%', roi > 0 ? 'positive' : 'negative');
                    
                    // Update Time
                    const time = data.netTime || 0;
                    updateMetric('time', (time > 0 ? '+' : '') + time.toFixed(1) + 'h', time > 0 ? 'positive' : 'negative');

                    // Update Churn
                    const churn = data.churn || 0;
                    updateMetric('churn', (churn * 100).toFixed(0) + '%', churn > 0.3 ? 'negative' : 'positive');

                    // Update Duplication
                    const dup = data.duplication || 0;
                    updateMetric('duplication', dup.toFixed(1) + 'x', dup > 1.5 ? 'negative' : 'positive');

                    // Update Bars
                    const perceived = data.perceivedROI || 0;
                    document.getElementById('perceivedROI').textContent = (perceived * 100).toFixed(0) + '%';
                    document.getElementById('perceivedBar').style.width = Math.min(perceived * 100, 100) + '%';
                    
                    document.getElementById('actualROI').textContent = (roi * 100).toFixed(0) + '%';
                    document.getElementById('actualBar').style.width = Math.min(Math.max(roi * 100, 0), 100) + '%';

                    // Insights
                    const insight = document.getElementById('roiInsight');
                    const status = document.getElementById('roiStatus');
                    
                    if (roi > 1) {
                        insight.textContent = "AI is delivering significant value. Expand usage.";
                        status.textContent = "Excellent";
                        status.className = "chip success";
                    } else if (roi > 0) {
                        insight.textContent = "Positive impact, but watch for hidden costs.";
                        status.textContent = "Good";
                        status.className = "chip warning";
                    } else {
                        insight.textContent = "Costs (review/fixes) are outweighing benefits.";
                        status.textContent = "Negative";
                        status.className = "chip danger";
                    }

                    // Alerts
                    const alertsContainer = document.getElementById('alertsList');
                    alertsContainer.innerHTML = '';
                    if (data.recommendations && data.recommendations.length > 0) {
                        data.recommendations.forEach(rec => {
                            const div = document.createElement('div');
                            div.className = 'alert-item';
                            // Use simple string concatenation to avoid template literal issues in TypeScript
                            div.innerHTML = '<span class="material-icons-round">' + (rec.icon || 'info') + '</span>' +
                                           '<div class="alert-content">' +
                                               '<strong>' + rec.title + '</strong>' +
                                               '<p>' + rec.text + '</p>' +
                                           '</div>';
                            alertsContainer.appendChild(div);
                        });
                    } else {
                        alertsContainer.innerHTML = '<div class="empty-state">No critical alerts.</div>';
                    }

                    // Render Chart if history exists
                    if (data.history && data.history.length > 0) {
                        renderChart(data.history);
                    }
                }

                let productivityChart = null;

                function renderChart(history) {
                    const ctx = document.getElementById('productivityChart').getContext('2d');
                    
                    // Prepare data
                    const labels = history.map(h => new Date(h.timestamp).toLocaleDateString());
                    const netTimeData = history.map(h => h.productivity?.netTimeSaved || 0);
                    const aiUsageData = history.map(h => h.ai?.totalSuggestions || 0);

                    if (productivityChart) {
                        productivityChart.destroy();
                    }

                    productivityChart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [
                                {
                                    label: 'Net Time Saved (Hours)',
                                    data: netTimeData,
                                    borderColor: '#4caf50', // Green
                                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                                    yAxisID: 'y',
                                    tension: 0.4,
                                    fill: true
                                },
                                {
                                    label: 'AI Suggestions',
                                    data: aiUsageData,
                                    borderColor: '#2196f3', // Blue
                                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                                    yAxisID: 'y1',
                                    tension: 0.4,
                                    borderDash: [5, 5]
                                }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            interaction: {
                                mode: 'index',
                                intersect: false,
                            },
                            plugins: {
                                title: {
                                    display: true,
                                    text: 'Does more AI = More Productivity?'
                                }
                            },
                            scales: {
                                y: {
                                    type: 'linear',
                                    display: true,
                                    position: 'left',
                                    title: { display: true, text: 'Hours Saved' }
                                },
                                y1: {
                                    type: 'linear',
                                    display: true,
                                    position: 'right',
                                    grid: {
                                        drawOnChartArea: false,
                                    },
                                    title: { display: true, text: 'Suggestions' }
                                }
                            }
                        }
                    });
                }

                function updateMetric(id, value, trendClass) {
                    const el = document.getElementById(id + 'Value');
                    el.textContent = value;
                    // Reset classes
                    el.classList.remove('text-positive', 'text-negative');
                    el.classList.add('text-' + trendClass);
                }
            </script>
        </body>
        </html>`;
    }

    private async refreshData() {
        // Trigger metrics recalculation if callback is set
        if (this.onRefreshCallback) {
            try {
                await this.onRefreshCallback();
            } catch (error) {
                console.error('Error in refresh callback:', error);
                // Do not rethrow, proceed to load stored data
            }
        }

        const metrics = await this.storage.getLatestMetrics();
        const history = await this.storage.getMetricsHistory(30);
        
        // Calculate derived values for display
        const dashboardData = {
            hasData: !!metrics,
            history: history,
            roi: metrics?.roi?.overallROI ?? 0,
            perceivedROI: metrics?.productivity?.perceivedGain ?? 0,
            churn: metrics?.quality?.codeChurn?.rate ?? 0,
            duplication: metrics?.quality?.duplication?.cloneRate ?? 0,
            netTime: metrics?.productivity?.netTimeSaved ?? 0,
            recommendations: this.generateRecommendations(metrics)
        };

        this.panel?.webview.postMessage({
            command: 'updateData',
            data: dashboardData
        });
    }

    private generateRecommendations(metrics: any): any[] {
        const recs = [];
        if (!metrics) {return [];}

        if ((metrics.quality?.codeChurn?.rate || 0) > 0.3) {
            recs.push({ icon: 'warning', title: 'High Churn', text: 'AI code is being rewritten frequently.' });
        }
        if ((metrics.productivity?.netTimeSaved || 0) < 0) {
            recs.push({ icon: 'timer_off', title: 'Time Loss', text: 'More time spent fixing than saving.' });
        }

        // Cost Optimization (Phase 3)
        if ((metrics.roi?.overallROI || 0) < 0) {
            recs.push({
                icon: 'savings',
                title: 'Cost Alert',
                text: 'Your AI ROI is negative. You are spending more on the license + fix time than you are saving.'
            });
        }

        if (recs.length === 0) {
            recs.push({ icon: 'check_circle', title: 'All Good', text: 'Metrics are within healthy ranges.' });
        }

        // Pattern Recognition (Phase 3)
        const languageStats = metrics.ai?.languageStats;
        if (languageStats) {
            for (const lang in languageStats) {
                const stats = languageStats[lang];
                // If significant usage (>5 suggestions) and low acceptance (<15%)
                if (stats.suggestions > 5 && stats.acceptanceRate < 0.15) {
                    const rejectionRate = ((1 - stats.acceptanceRate) * 100).toFixed(0);
                    recs.push({
                        icon: 'psychology',
                        title: 'Pattern Detected',
                        text: `You reject ${rejectionRate}% of suggestions in ${lang} files. Consider disabling AI for this language to reduce noise.`
                    });
                }
            }
        }

        return recs;
    }

    private async exportData() {
        const data = await this.storage.exportData();
        const doc = await vscode.workspace.openTextDocument({
            content: data,
            language: 'json'
        });
        await vscode.window.showTextDocument(doc);
    }

    public showReport(_report: any) {
        vscode.window.showInformationMessage('Report generated successfully. Check dashboard for details.');
        this.refreshData();
    }
}
