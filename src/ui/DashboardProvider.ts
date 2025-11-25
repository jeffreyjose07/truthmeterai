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
                'AI Metrics Dashboard',
                column || vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
                    ]
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
            <title>AI Metrics Dashboard</title>
            <link href="${styleUri}" rel="stylesheet">
        </head>
        <body>
            <div class="dashboard-container">
                <header class="dashboard-header">
                    <div class="header-content">
                        <h1 class="dashboard-title">AI Coding Assistant Metrics</h1>
                        <p class="dashboard-subtitle">Research-Backed Impact Analysis</p>
                    </div>
                    <div class="header-actions">
                        <button class="btn-secondary" onclick="refreshData()">
                            <span class="btn-icon">↻</span>
                            Refresh
                        </button>
                        <button class="btn-primary" onclick="exportReport()">
                            <span class="btn-icon">↓</span>
                            Export
                        </button>
                    </div>
                </header>

                <div class="alert-banner" id="alertBanner" style="display: none;"></div>

                <div id="loadingState" class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Collecting metrics data...</p>
                    <p class="loading-hint">Start coding to begin tracking AI assistant impact</p>
                </div>

                <div id="metricsContainer" style="display: none;">
                    <div class="metrics-grid">
                        <div class="metric-card card-primary">
                            <div class="card-header">
                                <div class="card-title">
                                    <span class="card-icon">📊</span>
                                    <span>Actual ROI</span>
                                </div>
                                <span class="metric-trend" id="roiTrend">—</span>
                            </div>
                            <div class="card-body">
                                <div class="metric-value" id="roiValue">—</div>
                                <div class="metric-label">Return on Investment</div>
                                <div class="metric-detail" id="perceivedROIDetail" style="display: none;">
                                    Perceived: <span id="perceivedROI">—</span>
                                </div>
                            </div>
                            <div class="card-footer" id="roiInsight"></div>
                        </div>

                        <div class="metric-card card-warning">
                            <div class="card-header">
                                <div class="card-title">
                                    <span class="card-icon">🔄</span>
                                    <span>Code Churn</span>
                                </div>
                                <span class="metric-trend" id="churnTrend">—</span>
                            </div>
                            <div class="card-body">
                                <div class="metric-value" id="churnValue">—</div>
                                <div class="metric-label">Code rewritten within 14 days</div>
                            </div>
                            <div class="card-footer" id="churnInsight"></div>
                        </div>

                        <div class="metric-card card-danger">
                            <div class="card-header">
                                <div class="card-title">
                                    <span class="card-icon">📋</span>
                                    <span>Code Duplication</span>
                                </div>
                                <span class="metric-trend" id="duplicationTrend">—</span>
                            </div>
                            <div class="card-body">
                                <div class="metric-value" id="duplicationValue">—</div>
                                <div class="metric-label">Copy-paste code increase</div>
                            </div>
                            <div class="card-footer" id="duplicationInsight"></div>
                        </div>

                        <div class="metric-card card-info">
                            <div class="card-header">
                                <div class="card-title">
                                    <span class="card-icon">⏱️</span>
                                    <span>Time Impact</span>
                                </div>
                                <span class="metric-trend" id="timeTrend">—</span>
                            </div>
                            <div class="card-body">
                                <div class="metric-value" id="timeValue">—</div>
                                <div class="metric-label">Net hours per week</div>
                            </div>
                            <div class="card-footer" id="timeInsight"></div>
                        </div>
                    </div>

                    <div class="recommendations-section" id="recommendationsSection" style="display: none;">
                        <div class="section-header">
                            <h2>Recommendations</h2>
                            <p class="section-subtitle">Data-driven insights to optimize AI usage</p>
                        </div>
                        <div id="recommendations" class="recommendations-list"></div>
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let hasData = false;

                function refreshData() {
                    vscode.postMessage({ command: 'refresh' });
                }

                function exportReport() {
                    vscode.postMessage({ command: 'export' });
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateData') {
                        updateDashboard(message.data);
                    }
                });

                function updateDashboard(data) {
                    hasData = data.hasData;

                    // Always show metrics container if we have data structure (even if values are 0)
                    // Only show loading if we truly have no metrics object at all
                    if (hasData || (data.roi !== null || data.churn !== null || data.duplication !== null || data.netTime !== null)) {
                        document.getElementById('loadingState').style.display = 'none';
                        document.getElementById('metricsContainer').style.display = 'block';
                    } else {
                        // No data yet - show helpful message
                        document.getElementById('loadingState').style.display = 'flex';
                        document.getElementById('metricsContainer').style.display = 'none';
                        const loadingMsg = document.querySelector('#loadingState p');
                        if (loadingMsg) {
                            loadingMsg.textContent = 'Tracking started! Make some code changes with AI assistance to see metrics.';
                        }
                        return;
                    }

                    // Update ROI
                    const roiElement = document.getElementById('roiValue');
                    if (data.roi !== null && data.roi !== undefined) {
                        const roiValue = Math.round(data.roi * 100);
                        roiElement.textContent = (roiValue > 0 ? '+' : '') + roiValue + '%';
                        roiElement.className = 'metric-value ' + (roiValue > 0 ? 'positive' : 'negative');
                        document.getElementById('roiTrend').textContent = roiValue > 0 ? '↑' : '↓';
                        document.getElementById('roiInsight').textContent = roiValue > 0
                            ? 'Positive impact on productivity'
                            : 'Cost exceeds benefit';

                        if (data.perceivedROI) {
                            document.getElementById('perceivedROIDetail').style.display = 'block';
                            document.getElementById('perceivedROI').textContent = '+' + Math.round(data.perceivedROI * 100) + '%';
                        }
                    } else {
                        roiElement.textContent = 'Calculating...';
                        roiElement.className = 'metric-value';
                    }

                    // Update Churn
                    const churnElement = document.getElementById('churnValue');
                    if (data.churn !== null && data.churn !== undefined) {
                        const churnValue = Math.round(data.churn * 100);
                        churnElement.textContent = churnValue + '%';
                        churnElement.className = 'metric-value ' + (churnValue > 30 ? 'negative' : 'positive');
                        document.getElementById('churnTrend').textContent = churnValue > 30 ? '↑' : '↓';
                        document.getElementById('churnInsight').textContent = churnValue > 30
                            ? 'High rewrite rate detected'
                            : 'Healthy code stability';
                    } else {
                        churnElement.textContent = 'Calculating...';
                    }

                    // Update Duplication
                    const dupElement = document.getElementById('duplicationValue');
                    if (data.duplication !== null && data.duplication !== undefined) {
                        dupElement.textContent = data.duplication.toFixed(1) + 'x';
                        dupElement.className = 'metric-value ' + (data.duplication > 2 ? 'negative' : 'positive');
                        document.getElementById('duplicationTrend').textContent = data.duplication > 2 ? '↑' : '↓';
                        document.getElementById('duplicationInsight').textContent = data.duplication > 2
                            ? 'Technical debt increasing'
                            : 'Good code reuse';
                    } else {
                        dupElement.textContent = 'Calculating...';
                    }

                    // Update Time Impact
                    const timeElement = document.getElementById('timeValue');
                    if (data.netTime !== null && data.netTime !== undefined) {
                        const hours = data.netTime.toFixed(1);
                        timeElement.textContent = (data.netTime > 0 ? '+' : '') + hours + 'h';
                        timeElement.className = 'metric-value ' + (data.netTime > 0 ? 'positive' : 'negative');
                        document.getElementById('timeTrend').textContent = data.netTime > 0 ? '↑' : '↓';
                        document.getElementById('timeInsight').textContent = data.netTime > 0
                            ? 'Net time saved'
                            : 'More time spent than saved';
                    } else {
                        timeElement.textContent = 'Calculating...';
                    }

                    // Update Recommendations
                    if (data.recommendations && data.recommendations.length > 0) {
                        document.getElementById('recommendationsSection').style.display = 'block';
                        updateRecommendations(data.recommendations);
                    }

                    // Show Alerts
                    if (data.alerts && data.alerts.length > 0) {
                        showAlerts(data.alerts);
                    }
                }

                function updateRecommendations(recommendations) {
                    const container = document.getElementById('recommendations');
                    container.innerHTML = recommendations.map(rec =>
                        '<div class="recommendation-card">' +
                        '<div class="rec-icon">' + rec.icon + '</div>' +
                        '<div class="rec-content">' +
                        '<div class="rec-title">' + rec.title + '</div>' +
                        '<div class="rec-text">' + rec.text + '</div>' +
                        '</div>' +
                        '</div>'
                    ).join('');
                }

                function showAlerts(alerts) {
                    const banner = document.getElementById('alertBanner');
                    banner.innerHTML = alerts.map(alert =>
                        '<div class="alert alert-' + alert.type + '">' +
                        '<span class="alert-icon">' + (alert.type === 'error' ? '⚠️' : 'ℹ️') + '</span>' +
                        '<span class="alert-message">' + alert.message + '</span>' +
                        '</div>'
                    ).join('');
                    banner.style.display = 'block';
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
            }
        }

        const metrics = await this.storage.getLatestMetrics();

        console.log('[Dashboard] Retrieved metrics:', JSON.stringify(metrics, null, 2));

        // Check if we have metrics data (even if values are 0, we have data structure)
        // A metrics object exists if it has been calculated and stored
        const hasActualData = metrics && (
            (metrics.roi !== undefined && metrics.roi !== null) ||
            (metrics.quality !== undefined && metrics.quality !== null) ||
            (metrics.productivity !== undefined && metrics.productivity !== null)
        );

        console.log('[Dashboard] hasActualData =', hasActualData);

        // Always provide data structure, even if values are 0
        // This allows the dashboard to display "0" values instead of showing loading state
        const dashboardData = {
            hasData: hasActualData,
            roi: metrics?.roi?.overallROI ?? 0,
            perceivedROI: metrics?.productivity?.perceivedGain ?? 0,
            churn: metrics?.quality?.codeChurn?.rate ?? 0,
            duplication: metrics?.quality?.duplication?.cloneRate
                ? metrics.quality.duplication.cloneRate / (metrics.quality.duplication.beforeAI || 1)
                : 0,
            netTime: metrics?.productivity?.netTimeSaved ?? 0,

            recommendations: hasActualData ? this.generateRecommendations(metrics) : [],
            alerts: hasActualData ? this.generateAlerts(metrics) : []
        };

        this.panel?.webview.postMessage({
            command: 'updateData',
            data: dashboardData
        });
    }

    private generateRecommendations(metrics: any): any[] {
        const recommendations = [];

        const churnRate = metrics.quality?.codeChurn?.rate || 0;
        const duplicationRate = metrics.quality?.duplication?.cloneRate || 0;
        const roi = metrics.roi?.overallROI || 0;

        if (churnRate > 0.3) {
            recommendations.push({
                icon: '⚠️',
                title: 'High Code Churn Detected',
                text: 'Provide clearer prompts and context to AI to reduce rewrites. Consider pair programming sessions to improve AI usage.'
            });
        }

        if (duplicationRate > 0.15) {
            recommendations.push({
                icon: '🔄',
                title: 'Code Duplication Increasing',
                text: 'Enable DRY principle checks. Review AI-generated code for abstractions before accepting.'
            });
        }

        if (roi < 1) {
            recommendations.push({
                icon: '💰',
                title: 'ROI Below Expectations',
                text: 'Focus AI usage on boilerplate code, tests, and documentation. Avoid using AI for complex business logic.'
            });
        } else {
            recommendations.push({
                icon: '✨',
                title: 'Positive Impact',
                text: 'Continue current usage patterns. Consider expanding AI usage to similar tasks.'
            });
        }

        recommendations.push({
            icon: '🎓',
            title: 'Best Practices',
            text: 'Junior developers often see highest gains. Use AI as a learning tool with proper review processes.'
        });

        return recommendations;
    }

    private generateAlerts(metrics: any): any[] {
        const alerts = [];

        const churnRate = metrics.quality?.codeChurn?.rate || 0;
        const roi = metrics.roi?.overallROI || 0;

        if (churnRate > 0.4) {
            alerts.push({
                type: 'error',
                message: 'Critical: Over 40% of AI code is being rewritten. Review AI usage patterns immediately.'
            });
        }

        if (roi < 0) {
            alerts.push({
                type: 'warning',
                message: 'AI is currently slowing down development. Consider adjusting usage patterns or providing team training.'
            });
        }

        return alerts;
    }

    private async exportData() {
        const data = await this.storage.exportData();

        const uri = vscode.Uri.parse('untitled:ai-metrics-report.json');
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });

        const edit = new vscode.WorkspaceEdit();
        edit.insert(uri, new vscode.Position(0, 0), data);
        await vscode.workspace.applyEdit(edit);
    }

    public showReport(report: any) {
        vscode.window.showInformationMessage('Report generated successfully');
    }
}
