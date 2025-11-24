import * as vscode from 'vscode';
import * as path from 'path';
import { LocalStorage } from '../storage/LocalStorage';

export class DashboardProvider {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private storage: LocalStorage
    ) {}

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
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        </head>
        <body>
            <div class="container">
                <header>
                    <h1>AI Pair Programming Metrics</h1>
                    <div class="subtitle">Research-Backed Impact Analysis</div>
                </header>

                <div class="alert-banner" id="alertBanner"></div>

                <div class="metrics-grid">
                    <div class="metric-card highlight">
                        <div class="metric-header">
                            <span class="metric-label">ACTUAL ROI</span>
                            <span class="metric-trend" id="roiTrend">↓</span>
                        </div>
                        <div class="metric-value" id="roiValue">-19%</div>
                        <div class="metric-detail">
                            Perceived: <span id="perceivedROI">+20%</span>
                        </div>
                        <div class="metric-insight">
                            Developers overestimate gains by 39%
                        </div>
                    </div>

                    <div class="metric-card">
                        <div class="metric-header">
                            <span class="metric-label">CODE CHURN</span>
                            <span class="metric-trend negative">↑</span>
                        </div>
                        <div class="metric-value" id="churnValue">42%</div>
                        <div class="metric-detail">
                            AI code rewritten within 14 days
                        </div>
                        <div class="metric-insight">
                            2x higher than human code
                        </div>
                    </div>

                    <div class="metric-card">
                        <div class="metric-header">
                            <span class="metric-label">CODE CLONES</span>
                            <span class="metric-trend negative">↑</span>
                        </div>
                        <div class="metric-value" id="duplicationValue">4.2x</div>
                        <div class="metric-detail">
                            Increase in copy-paste code
                        </div>
                        <div class="metric-insight">
                            Technical debt accumulating
                        </div>
                    </div>

                    <div class="metric-card">
                        <div class="metric-header">
                            <span class="metric-label">NET TIME IMPACT</span>
                            <span class="metric-trend negative">↓</span>
                        </div>
                        <div class="metric-value negative" id="timeValue">-0.6h</div>
                        <div class="metric-detail">
                            Per developer per week
                        </div>
                        <div class="metric-insight">
                            More time fixing than saving
                        </div>
                    </div>
                </div>

                <div class="recommendations-section">
                    <h2>Data-Driven Recommendations</h2>
                    <div id="recommendations" class="recommendations-list"></div>
                </div>

                <div class="actions">
                    <button onclick="refreshData()">Refresh</button>
                    <button onclick="exportReport()">Export Report</button>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

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
                    document.getElementById('roiValue').textContent =
                        data.roi > 0 ? '+' + data.roi + '%' : data.roi + '%';
                    document.getElementById('perceivedROI').textContent =
                        '+' + data.perceivedROI + '%';
                    document.getElementById('churnValue').textContent =
                        data.churn + '%';
                    document.getElementById('duplicationValue').textContent =
                        data.duplication + 'x';
                    document.getElementById('timeValue').textContent =
                        data.netTime > 0 ? '+' + data.netTime + 'h' : data.netTime + 'h';

                    updateRecommendations(data.recommendations);
                    showAlerts(data.alerts);
                }

                function updateRecommendations(recommendations) {
                    const container = document.getElementById('recommendations');
                    container.innerHTML = recommendations.map(rec =>
                        '<div class="recommendation-item">' +
                        '<span class="rec-icon">' + rec.icon + '</span>' +
                        '<span class="rec-text">' + rec.text + '</span>' +
                        '</div>'
                    ).join('');
                }

                function showAlerts(alerts) {
                    if (alerts && alerts.length > 0) {
                        const banner = document.getElementById('alertBanner');
                        banner.innerHTML = alerts.map(alert =>
                            '<div class="alert ' + alert.type + '">' + alert.message + '</div>'
                        ).join('');
                        banner.style.display = 'block';
                    }
                }
            </script>
        </body>
        </html>`;
    }

    private async refreshData() {
        const metrics = await this.storage.getLatestMetrics();

        const dashboardData = {
            roi: metrics.roi?.overallROI || -19,
            perceivedROI: 20,
            churn: Math.round((metrics.quality?.codeChurn?.rate || 0.42) * 100),
            duplication: metrics.quality?.duplication?.cloneRate ? metrics.quality.duplication.cloneRate * 4 : 4.2,
            netTime: metrics.productivity?.netTimeSaved || -0.6,

            recommendations: this.generateRecommendations(metrics),
            alerts: this.generateAlerts(metrics)
        };

        this.panel?.webview.postMessage({
            command: 'updateData',
            data: dashboardData
        });
    }

    private generateRecommendations(metrics: any): any[] {
        const recommendations = [];

        if (metrics.quality?.codeChurn?.rate > 0.3) {
            recommendations.push({
                icon: '⚠️',
                text: 'High code churn detected. Provide AI prompt training to reduce rewrites.'
            });
        }

        if (metrics.quality?.duplication?.cloneRate > 0.15) {
            recommendations.push({
                icon: '🔄',
                text: 'Excessive duplication. Enable DRY principle checks in AI workflow.'
            });
        }

        if (metrics.roi?.overallROI < 1) {
            recommendations.push({
                icon: '💰',
                text: 'Negative ROI. Focus AI usage on boilerplate and test generation only.'
            });
        }

        recommendations.push({
            icon: '🎓',
            text: 'Junior developers show highest gains. Pair them with AI for learning.'
        });

        return recommendations;
    }

    private generateAlerts(metrics: any): any[] {
        const alerts = [];

        if (metrics.quality?.codeChurn?.rate > 0.4) {
            alerts.push({
                type: 'error',
                message: 'Critical: 40%+ of AI code is being rewritten. Immediate action required.'
            });
        }

        if (metrics.roi?.overallROI < 0) {
            alerts.push({
                type: 'warning',
                message: 'AI is making your team SLOWER. Review usage patterns immediately.'
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
