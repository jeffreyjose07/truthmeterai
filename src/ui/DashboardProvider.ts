import * as vscode from 'vscode';
import * as path from 'path';
import { LocalStorage } from '../storage/LocalStorage';
import { AIEventCollector } from '../collectors/AIEventCollector';
import { TimeTracker } from '../collectors/TimeTracker';

export class DashboardProvider {
    private panel: vscode.WebviewPanel | undefined;
    private onRefreshCallback?: () => Promise<void>;
    private currentHistoryDays: number = 30; // Default history timeframe

    constructor(
        private context: vscode.ExtensionContext,
        private storage: LocalStorage,
        private aiCollector: AIEventCollector,
        private timeTracker: TimeTracker
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
            // Set initial dropdown value in the webview
            this.panel.webview.postMessage({
                command: 'setInitialTimeframe',
                days: this.currentHistoryDays
            });
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            }, null, this.context.subscriptions);

            this.panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'refresh':
                            // If days is explicitly sent, use it, otherwise use current
                            this.currentHistoryDays = message.days || this.currentHistoryDays;
                            await this.refreshData();
                            break;
                        case 'export':
                            await this.exportData();
                            break;
                        case 'setTimeframe':
                            this.currentHistoryDays = message.days;
                            await this.refreshData();
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

        const chartJsPath = vscode.Uri.file(
            path.join(this.context.extensionPath, 'resources', 'chart.js')
        );
        const chartJsUri = this.panel!.webview.asWebviewUri(chartJsPath);

        const chartAdapterJsPath = vscode.Uri.file(
            path.join(this.context.extensionPath, 'resources', 'chart-adapter.js')
        );
        const chartAdapterJsUri = this.panel!.webview.asWebviewUri(chartAdapterJsPath);

        // CSP: Allow scripts from local resources and 'unsafe-inline' (needed for Chart.js and our inline scripts)
        const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel!.webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; script-src ${this.panel!.webview.cspSource} 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src ${this.panel!.webview.cspSource} https:;">`;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${csp}
            <title>AI Impact Dashboard</title>
            <link href="${styleUri}" rel="stylesheet">
            <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
            <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">
            <script src="${chartJsUri}"></script>
            <script src="${chartAdapterJsUri}"></script>
            <style>
                /* Tooltip CSS */
                .tooltip {
                    position: relative;
                    display: inline-block;
                    cursor: help;
                    border-bottom: 1px dotted var(--text-secondary);
                }
                
                .tooltip .tooltiptext {
                    visibility: hidden;
                    width: 220px;
                    background-color: var(--card-bg);
                    color: var(--text-primary);
                    text-align: center;
                    border-radius: 6px;
                    padding: 8px;
                    position: absolute;
                    z-index: 10;
                    bottom: 125%;
                    left: 50%;
                    margin-left: -110px;
                    opacity: 0;
                    transition: opacity 0.3s;
                    font-size: 12px;
                    font-weight: normal;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                    border: 1px solid var(--border-color);
                    line-height: 1.4;
                }
                
                .tooltip:hover .tooltiptext {
                    visibility: visible;
                    opacity: 1;
                }

                /* Sparkline Canvas */
                .sparkline-container {
                    width: 100%;
                    height: 40px;
                    margin-top: 8px;
                }
            </style>
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
                    <select id="timeframeSelect" class="md-select" onchange="setTimeframe(this.value)">
                        <option value="7">Last 7 Days</option>
                        <option value="30" selected>Last 30 Days</option>
                        <option value="90">Last 90 Days</option>
                    </select>
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
                                <span class="card-title tooltip">Net Productivity
                                    <span class="tooltiptext">Actual velocity gain vs manual coding, accounting for rework.</span>
                                </span>
                                <span class="material-icons-round icon">speed</span>
                            </div>
                            <div class="card-body">
                                <div class="kpi-value" id="roiValue">--%</div>
                                <div class="kpi-sub">Actual Gain</div>
                                <div class="sparkline-container">
                                    <canvas id="roiSparkline"></canvas>
                                </div>
                            </div>
                            <div class="card-footer">
                                <span class="trend" id="roiTrend">--</span>
                                <span class="footer-text">vs. manual coding</span>
                            </div>
                        </div>

                        <div class="md-card kpi-card secondary">
                            <div class="card-header">
                                <span class="card-title tooltip">Time Impact
                                    <span class="tooltiptext">Net hours saved after deducting review and fix time.</span>
                                </span>
                                <span class="material-icons-round icon">schedule</span>
                            </div>
                            <div class="card-body">
                                <div class="kpi-value" id="timeValue">--h</div>
                                <div class="kpi-sub">Net Saved/Week</div>
                                <div class="sparkline-container">
                                    <canvas id="timeSparkline"></canvas>
                                </div>
                            </div>
                            <div class="card-footer">
                                <span class="trend" id="timeTrend">--</span>
                                <span class="footer-text">accounting for cleanup</span>
                            </div>
                        </div>

                        <div class="md-card kpi-card warning">
                            <div class="card-header">
                                <span class="card-title tooltip">Code Churn
                                    <span class="tooltiptext">% of AI code rewritten shortly after generation. Lower is better.</span>
                                </span>
                                <span class="material-icons-round icon">delete_sweep</span>
                            </div>
                            <div class="card-body">
                                <div class="kpi-value" id="churnValue">--%</div>
                                <div class="kpi-sub">Rewritten Code</div>
                                <div class="sparkline-container">
                                    <canvas id="churnSparkline"></canvas>
                                </div>
                            </div>
                            <div class="card-footer">
                                <span class="trend" id="churnTrend">--</span>
                                <span class="footer-text">AI code stability</span>
                            </div>
                        </div>

                        <div class="md-card kpi-card info">
                            <div class="card-header">
                                <span class="card-title tooltip">Duplication
                                    <span class="tooltiptext">Ratio of copied code blocks. Lower is better.</span>
                                </span>
                                <span class="material-icons-round icon">content_copy</span>
                            </div>
                            <div class="card-body">
                                <div class="kpi-value" id="duplicationValue">--x</div>
                                <div class="kpi-sub">Growth Factor</div>
                                <div class="sparkline-container">
                                    <canvas id="duplicationSparkline"></canvas>
                                </div>
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

                    <!-- Churn History Chart -->
                    <div class="md-card chart-card">
                        <div class="card-header-row">
                            <h2>Code Churn Trend</h2>
                        </div>
                        <div class="chart-container" style="position: relative; height: 300px; width: 100%;">
                            <canvas id="churnChart"></canvas>
                        </div>
                    </div>

                    <!-- AI Activity and Flow Timeline Chart -->
                    <div class="md-card chart-card">
                        <div class="card-header-row">
                            <h2>AI Activity & Flow Timeline</h2>
                        </div>
                        <div class="chart-container" style="position: relative; height: 300px; width: 100%;">
                            <canvas id="timelineChart"></canvas>
                        </div>
                    </div>

                    <!-- Risk Heatmap Chart -->
                    <div class="md-card chart-card">
                        <div class="card-header-row">
                            <h2>AI Risk Heatmap (Usage vs. Churn)</h2>
                        </div>
                        <div class="chart-container" style="position: relative; height: 350px; width: 100%;">
                            <canvas id="riskChart"></canvas>
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

                    <!-- Performance (SPACE) Metrics -->
                    <div class="md-card large-card" style="margin-top: 1rem;">
                        <div class="card-header-row">
                            <h2>Performance (SPACE)</h2>
                            <span class="material-icons-round icon" title="Correlates AI usage with Build/Test outcomes">science</span>
                        </div>
                        <div class="card-content-row">
                            <div class="metric-group">
                                <label>Build Success Rate</label>
                                <span class="metric-text" id="buildSuccess">--%</span>
                            </div>
                            <div class="metric-group">
                                <label>Test Success Rate</label>
                                <span class="metric-text" id="testSuccess">--%</span>
                            </div>
                            <div class="metric-group">
                                <label>AI Impact Correlation</label>
                                <div class="chip" id="aiCorrelation">--</div>
                                <small id="aiCorrelationDesc" style="display:block; margin-top:4px; color:var(--text-secondary)">--</small>
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
                let currentDays = 30; // Default timeframe

                function setTimeframe(days) {
                    currentDays = parseInt(days, 10);
                    refreshData(); // Refresh with new timeframe
                }
                
                function refreshData() {
                    document.getElementById('loadingState').style.display = 'flex';
                    document.getElementById('dashboardContent').style.display = 'none';
                    vscode.postMessage({ command: 'refresh', days: currentDays });
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
                    } else if (message.command === 'setInitialTimeframe') {
                        document.getElementById('timeframeSelect').value = message.days;
                    }
                });

                let productivityChart = null;
                let churnChart = null;
                let timelineChart = null;
                let riskChart = null;

                function updateDashboard(data) {
                    document.getElementById('loadingState').style.display = 'none';
                    document.getElementById('dashboardContent').style.display = 'block';

                    if (!data.hasData) {
                        // Show empty state or zeros
                    }

                    // Update ROI
                    const roi = data.roi || 0;
                    updateMetric('roi', (roi * 100).toFixed(0) + '%', roi > 0 ? 'positive' : 'negative', data.comparison?.roi);
                    
                    // Update Time
                    const time = data.netTime || 0;
                    updateMetric('time', (time > 0 ? '+' : '') + time.toFixed(1) + 'h', time > 0 ? 'positive' : 'negative', data.comparison?.netTime);

                    // Update Churn
                    const churn = data.churn || 0;
                    updateMetric('churn', (churn * 100).toFixed(0) + '%', churn > 0.3 ? 'negative' : 'positive', data.comparison?.churn);

                    // Update Duplication
                    const dup = data.duplication || 0;
                    updateMetric('duplication', dup.toFixed(1) + 'x', dup > 1.5 ? 'negative' : 'positive', data.comparison?.duplication);

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
                            div.innerHTML = '‹span class="material-icons-round">' + (rec.icon || 'info') + '</span>' +
                                           '<div class="alert-content">' +
                                               '<strong>' + rec.title + '</strong>' +
                                               '<p>' + rec.text + '</p>' +
                                           '</div>';
                            alertsContainer.appendChild(div);
                        });
                    } else {
                        alertsContainer.innerHTML = '<div class="empty-state">No critical alerts.</div>';
                    }

                    // Render Charts if history exists
                    if (data.history && data.history.length > 0) {
                        renderChart(data.history);
                        renderChurnChart(data.history);
                        
                        // Render Sparklines
                        renderSparkline('roiSparkline', data.history.map(h => h.roi?.overallROI || 0), '#4caf50');
                        renderSparkline('timeSparkline', data.history.map(h => h.productivity?.netTimeSaved || 0), '#2196f3');
                        renderSparkline('churnSparkline', data.history.map(h => (h.quality?.codeChurn?.rate || 0) * 100), '#ff9800');
                        renderSparkline('duplicationSparkline', data.history.map(h => h.quality?.duplication?.cloneRate || 0), '#00bcd4');
                    }
                    
                    // Render Timeline & Risk Charts
                    renderTimelineChart(data.flowBlocks || [], data.rawAiEvents || []);
                    renderRiskChart(data.fileStats || {});

                    // Update Performance Metrics
                    if (data.performance) {
                        const buildSuccess = (data.performance.buildStats.successRate * 100).toFixed(0);
                        const testSuccess = (data.performance.testStats.successRate * 100).toFixed(0);
                        
                        updateMetricText('buildSuccess', buildSuccess + '%');
                        updateMetricText('testSuccess', testSuccess + '%');

                        const correlation = data.performance.buildStats.aiCorrelation;
                        const correlationEl = document.getElementById('aiCorrelation');
                        const correlationDesc = document.getElementById('aiCorrelationDesc');

                        if (correlation > 0.3) {
                            correlationEl.textContent = "Positive";
                            correlationEl.className = "chip success";
                            correlationDesc.textContent = "AI usage linked to better builds";
                        } else if (correlation < -0.3) {
                            correlationEl.textContent = "Negative";
                            correlationEl.className = "chip danger";
                            correlationDesc.textContent = "AI usage linked to failures";
                        } else {
                            correlationEl.textContent = "Neutral";
                            correlationEl.className = "chip";
                            correlationDesc.textContent = "No significant correlation";
                        }
                    }
                }

                function updateMetricText(id, text) {
                    const el = document.getElementById(id);
                    if (el) el.textContent = text;
                }

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

                function renderChurnChart(history) {
                    const ctx = document.getElementById('churnChart').getContext('2d');

                    const labels = history.map(h => new Date(h.timestamp).toLocaleDateString());
                    const churnRateData = history.map(h => (h.quality?.codeChurn?.rate || 0) * 100); // %
                    const aiVsHumanChurnData = history.map(h => h.quality?.codeChurn?.aiVsHuman || 0); // Ratio

                    if (churnChart) {
                        churnChart.destroy();
                    }

                    churnChart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [
                                {
                                    label: 'Overall Churn Rate (%)',
                                    data: churnRateData,
                                    borderColor: '#ff9800', // Orange
                                    backgroundColor: 'rgba(255, 152, 0, 0.1)',
                                    yAxisID: 'y',
                                    tension: 0.4,
                                    fill: true
                                },
                                {
                                    label: 'AI vs. Human Churn Ratio',
                                    data: aiVsHumanChurnData,
                                    borderColor: '#f44336', // Red
                                    backgroundColor: 'rgba(244, 67, 54, 0.1)',
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
                                    text: 'Code Churn History (Higher is Worse)'
                                }
                            },
                            scales: {
                                y: {
                                    type: 'linear',
                                    display: true,
                                    position: 'left',
                                    title: { display: true, text: 'Churn Rate (%)' }
                                },
                                y1: {
                                    type: 'linear',
                                    display: true,
                                    position: 'right',
                                    grid: {
                                        drawOnChartArea: false,
                                    },
                                    title: { display: true, text: 'AI vs. Human Ratio' }
                                }
                            }
                        }
                    });
                }

                function renderTimelineChart(flowBlocks, aiEvents) {
                    const ctx = document.getElementById('timelineChart').getContext('2d');

                    if (timelineChart) {
                        timelineChart.destroy();
                    }
                    
                    const flowData = flowBlocks.map(block => ({
                        x: [new Date(block.start), new Date(block.end)],
                        y: 'Flow State'
                    }));

                    const aiData = aiEvents.filter(event => event.type === 'suggestion').map(event => ({
                        x: new Date(event.timestamp),
                        y: 'AI Suggestion',
                                                            label: \`AI: \${event.fileType} (\${event.suggestionLength} chars)\`                    }));

                    timelineChart = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: ['Flow State', 'AI Suggestion'],
                            datasets: [
                                {
                                    label: 'Flow State',
                                    data: flowData,
                                    backgroundColor: 'rgba(76, 175, 80, 0.5)', // Green
                                    borderColor: '#4caf50',
                                    borderWidth: 1,
                                    stack: 'timeline'
                                },
                                {
                                    label: 'AI Suggestion',
                                    data: aiData,
                                    backgroundColor: 'rgba(33, 150, 243, 0.8)', // Blue
                                    borderColor: '#2196f3',
                                    borderWidth: 1,
                                    type: 'scatter', // Overlay as scatter points
                                    pointRadius: 5,
                                    pointHoverRadius: 7,
                                    pointStyle: 'crossRot',
                                    tooltip: {
                                        callbacks: {
                                            label: function(context) {
                                                let label = context.dataset.label || '';
                                                if (context.raw.label) {
                                                    label += ': ' + context.raw.label;
                                                }
                                                return label;
                                            }
                                        }
                                    }
                                }
                            ]
                        },
                        options: {
                            indexAxis: 'y', // Make it a horizontal bar chart
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: {
                                    type: 'time',
                                    time: {
                                        unit: 'hour',
                                        displayFormats: {
                                            hour: 'MMM D, h:mm a'
                                        }
                                    },
                                    title: {
                                        display: true,
                                        text: 'Time'
                                    }
                                },
                                y: {
                                    title: {
                                        display: true,
                                        text: 'Event Type'
                                    }
                                }
                            },
                            plugins: {
                                title: {
                                    display: true,
                                    text: 'Developer Activity Timeline'
                                },
                                tooltip: {
                                    mode: 'index',
                                    intersect: false
                                }
                            }
                        }
                    });
                }

                function renderRiskChart(fileStats) {
                    const ctx = document.getElementById('riskChart').getContext('2d');

                    if (riskChart) {
                        riskChart.destroy();
                    }

                    // Transform data for scatter plot
                    const dataPoints = [];
                    for (const [file, stats] of Object.entries(fileStats)) {
                        // Clean up filename for display (remove long paths)
                        const fileName = file.split(/[\\\\/]/).pop();
                        dataPoints.push({
                            x: stats.suggestions, // Usage (Intensity)
                            y: stats.churn * 100, // Churn % (Risk)
                            label: fileName,
                            fullPath: file
                        });
                    }

                    // Color coding logic
                    const colors = dataPoints.map(p => {
                        if (p.y > 30 && p.x > 5) return 'rgba(244, 67, 54, 0.7)'; // High Risk (Red)
                        if (p.y < 10 && p.x > 10) return 'rgba(76, 175, 80, 0.7)'; // Productive (Green)
                        return 'rgba(33, 150, 243, 0.5)'; // Normal (Blue)
                    });

                    riskChart = new Chart(ctx, {
                        type: 'scatter',
                        data: {
                            datasets: [{
                                label: 'Files',
                                data: dataPoints,
                                backgroundColor: colors,
                                borderColor: colors.map(c => c.replace('0.7', '1').replace('0.5', '1')),
                                pointRadius: 8,
                                pointHoverRadius: 10
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                title: {
                                    display: true,
                                    text: 'Risk Heatmap: AI Intensity vs. Code Churn'
                                },
                                tooltip: {
                                    callbacks: {
                                        label: function(context) {
                                            const p = context.raw;
                                            return \`\${p.label}: \${p.x} suggestions, \${p.y.toFixed(1)}% churn\`;
                                        }
                                    }
                                },
                                annotation: {
                                    annotations: {
                                        box1: {
                                            type: 'box',
                                            xMin: 10, xMax: 1000,
                                            yMin: 30, yMax: 100,
                                            backgroundColor: 'rgba(255, 99, 132, 0.1)',
                                            borderColor: 'rgba(255, 99, 132, 0.2)',
                                            borderWidth: 1,
                                            label: { content: 'Risk Zone', enabled: true }
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    type: 'linear',
                                    position: 'bottom',
                                    title: { display: true, text: 'AI Suggestions (Intensity)' }
                                },
                                y: {
                                    title: { display: true, text: 'Churn Rate (%)' },
                                    min: 0,
                                    max: 100
                                }
                            }
                        }
                    });
                }

                // Track sparkline instances to destroy them on update
                const sparklineInstances = {};

                function renderSparkline(canvasId, data, color) {
                    const ctx = document.getElementById(canvasId).getContext('2d');
                    
                    if (sparklineInstances[canvasId]) {
                        sparklineInstances[canvasId].destroy();
                    }

                    sparklineInstances[canvasId] = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: data.map((_, i) => i), // Dummy labels
                            datasets: [{
                                data: data,
                                borderColor: color,
                                borderWidth: 2,
                                pointRadius: 0, // Hide points for cleaner look
                                fill: false,
                                tension: 0.4 // Smooth curves
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false }, tooltip: { enabled: false } },
                            scales: {
                                x: { display: false },
                                y: { display: false }
                            },
                            layout: { padding: 0 }
                        }
                    });
                }

                function updateMetric(id, value, trendClass, diff) {
                    const el = document.getElementById(id + 'Value');
                    el.textContent = value;
                    // Reset classes
                    el.classList.remove('text-positive', 'text-negative');
                    el.classList.add('text-' + trendClass);

                    // Update Comparison Trend
                    const trendEl = document.getElementById(id + 'Trend');
                    if (trendEl && diff !== undefined && !isNaN(diff)) {
                        const diffPercent = (diff * 100).toFixed(1) + '%';
                        const icon = diff > 0 ? 'trending_up' : (diff < 0 ? 'trending_down' : 'trending_flat');
                        // Invert logic for "bad" metrics like churn/duplication
                        const isBadMetric = id === 'churn' || id === 'duplication';
                        const isGoodDiff = isBadMetric ? diff < 0 : diff > 0;
                        const colorClass = isGoodDiff ? 'text-positive' : 'text-negative';
                        
                        trendEl.innerHTML = \`<span class="material-icons-round \${colorClass}" style="font-size:16px; vertical-align:middle;">\${icon}</span> \${diff > 0 ? '+' : ''}\${diffPercent}\`;
                    }
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
        // Fetch double the history to calculate previous period comparison
        const fullHistory = await this.storage.getMetricsHistory(this.currentHistoryDays * 2);
        
        // Fetch live data for immediate feedback
        const liveAiMetrics = await this.aiCollector.getMetrics();
        const liveTimeMetrics = await this.timeTracker.getMetrics();

        const now = Date.now();
        const periodMs = this.currentHistoryDays * 24 * 60 * 60 * 1000;
        const currentPeriodStart = now - periodMs;
        const previousPeriodStart = now - (periodMs * 2);

        // Split history
        const currentHistory = fullHistory.filter((m: any) => m.timestamp >= currentPeriodStart);
        const previousHistory = fullHistory.filter((m: any) => m.timestamp >= previousPeriodStart && m.timestamp < currentPeriodStart);

        // Calculate Averages for Comparison
        const calcAvg = (data: any[], selector: (m: any) => number) => {
            if (data.length === 0) {return 0;}
            return data.reduce((sum, m) => sum + (selector(m) || 0), 0) / data.length;
        };

        const currentStats = {
            roi: calcAvg(currentHistory, m => m.roi?.overallROI),
            netTime: calcAvg(currentHistory, m => m.productivity?.netTimeSaved),
            churn: calcAvg(currentHistory, m => m.quality?.codeChurn?.rate),
            duplication: calcAvg(currentHistory, m => m.quality?.duplication?.cloneRate)
        };

        const prevStats = {
            roi: calcAvg(previousHistory, m => m.roi?.overallROI),
            netTime: calcAvg(previousHistory, m => m.productivity?.netTimeSaved),
            churn: calcAvg(previousHistory, m => m.quality?.codeChurn?.rate),
            duplication: calcAvg(previousHistory, m => m.quality?.duplication?.cloneRate)
        };

        const calculateDiff = (curr: number, prev: number) => {
            if (prev === 0) {return 0;}
            return (curr - prev) / Math.abs(prev);
        };

        const comparison = {
            roi: calculateDiff(currentStats.roi, prevStats.roi),
            netTime: calculateDiff(currentStats.netTime, prevStats.netTime),
            churn: calculateDiff(currentStats.churn, prevStats.churn),
            duplication: calculateDiff(currentStats.duplication, prevStats.duplication)
        };
        
        // Calculate derived values for display
        const dashboardData = {
            hasData: !!metrics,
            history: currentHistory, // Only show current history in charts by default
            roi: metrics?.roi?.overallROI ?? 0,
            perceivedROI: metrics?.productivity?.perceivedGain ?? 0,
            churn: metrics?.quality?.codeChurn?.rate ?? 0,
            duplication: metrics?.quality?.duplication?.cloneRate ?? 0,
            netTime: metrics?.productivity?.netTimeSaved ?? 0,
            performance: metrics?.performance,
            recommendations: this.generateRecommendations(metrics),
            rawAiEvents: this.aiCollector.getRawEvents(),
            flowBlocks: liveTimeMetrics.flowBlocks || metrics?.productivity?.flowBlocks || [],
            fileStats: liveAiMetrics.fileStats || metrics?.ai?.fileStats || {},
            comparison: comparison // Pass comparison data
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
        // Execute the report generation command
        await vscode.commands.executeCommand('aiMetrics.generateReport');
    }

    public showReport(_report: any) {
        vscode.window.showInformationMessage('Report generated successfully. Check dashboard for details.');
        this.refreshData();
    }
}
