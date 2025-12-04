import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AllMetrics } from '../types/metrics';

export class ReportGenerator {
    private extensionPath: string | undefined;

    constructor(extensionPath?: string) {
        this.extensionPath = extensionPath;
    }

    public generateHTML(metrics: AllMetrics, projectName: string): string {
        const timestamp = new Date().toLocaleDateString(undefined, { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
        });
        
        const metricsJson = JSON.stringify(metrics, null, 2);

        let chartJsScript = '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>';
        
        // Try to inline Chart.js if extensionPath is provided and file exists
        if (this.extensionPath) {
            try {
                const chartJsPath = path.join(this.extensionPath, 'resources', 'chart.js');
                if (fs.existsSync(chartJsPath)) {
                    const chartJsContent = fs.readFileSync(chartJsPath, 'utf8');
                    chartJsScript = `<script>${chartJsContent}</script>`;
                }
            } catch (e) {
                console.error('Failed to inline Chart.js:', e);
                // Fallback to CDN is already set
            }
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Impact Report - ${projectName}</title>
    ${chartJsScript}
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">
    <style>
        :root {
            --primary: #2563eb;
            --primary-light: #3b82f6;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --surface: #ffffff;
            --surface-alt: #f8fafc;
            --border: #e2e8f0;
            --text-main: #1e293b;
            --text-secondary: #64748b;
            --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
            --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --surface: #0f172a;
                --surface-alt: #1e293b;
                --border: #334155;
                --text-main: #f1f5f9;
                --text-secondary: #94a3b8;
            }
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--surface-alt);
            color: var(--text-main);
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 2rem;
        }

        /* Header */
        .report-header {
            background: var(--surface);
            padding: 2rem;
            border-radius: 12px;
            box-shadow: var(--shadow);
            margin-bottom: 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-left: 6px solid var(--primary);
        }

        .header-content h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 0.5rem; }
        .header-content p { color: var(--text-secondary); font-size: 0.9rem; }

        .score-badge {
            text-align: center;
            background: var(--surface-alt);
            padding: 1rem 2rem;
            border-radius: 8px;
            border: 1px solid var(--border);
        }
        .score-val { font-size: 2rem; font-weight: 800; color: var(--primary); line-height: 1; }
        .score-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary); font-weight: 600; margin-top: 0.5rem; }

        /* KPI Grid */
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }

        .kpi-card {
            background: var(--surface);
            padding: 1.5rem;
            border-radius: 12px;
            box-shadow: var(--shadow-sm);
            border: 1px solid var(--border);
            transition: transform 0.2s ease;
        }

        .kpi-card:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
        
        .kpi-title { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text-secondary); font-weight: 500; margin-bottom: 1rem; }
        .kpi-value { font-size: 1.8rem; font-weight: 700; color: var(--text-main); }
        .kpi-trend { font-size: 0.85rem; margin-top: 0.5rem; display: flex; align-items: center; gap: 0.25rem; }
        
        .trend-up { color: var(--success); }
        .trend-down { color: var(--danger); }
        .trend-neutral { color: var(--text-secondary); }

        /* Sections */
        .section {
            background: var(--surface);
            border-radius: 12px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: var(--shadow-sm);
            border: 1px solid var(--border);
        }

        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--border);
        }

        .section-header h2 { font-size: 1.25rem; font-weight: 600; display: flex; align-items: center; gap: 0.75rem; }
        
        /* Charts */
        .chart-container { position: relative; height: 300px; width: 100%; }

        /* Tables */
        .data-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
        .data-table th { text-align: left; padding: 1rem; color: var(--text-secondary); font-weight: 500; font-size: 0.85rem; border-bottom: 1px solid var(--border); }
        .data-table td { padding: 1rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
        .data-table tr:last-child td { border-bottom: none; }

        /* Insights Box */
        .insight-box {
            background: rgba(37, 99, 235, 0.05);
            border-left: 4px solid var(--primary);
            padding: 1rem;
            border-radius: 0 8px 8px 0;
            margin-top: 1rem;
            font-size: 0.9rem;
        }

        .space-matrix {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
        }
        .space-item {
            background: var(--surface-alt);
            padding: 1rem;
            border-radius: 8px;
        }
        .space-label { font-size: 0.8rem; text-transform: uppercase; color: var(--text-secondary); font-weight: 700; }
        .space-val { font-size: 1.2rem; font-weight: 600; margin-top: 0.25rem; }

        @media print {
            body { background: white; color: black; }
            .container { max-width: 100%; padding: 0; }
            .report-header, .kpi-card, .section { box-shadow: none; border: 1px solid #ccc; page-break-inside: avoid; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="report-header">
            <div class="header-content">
                <h1>AI Impact Analysis Report</h1>
                <p>${projectName} • Generated on ${timestamp}</p>
            </div>
            <div class="score-badge">
                <div class="score-val" id="roiScore">--</div>
                <div class="score-label">ROI Score</div>
            </div>
        </div>

        <!-- Executive KPI Summary -->
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-title"><span class="material-icons-round">timer</span> Net Time Saved</div>
                <div class="kpi-value" id="netTimeVal">--</div>
                <div class="kpi-trend" id="netTimeTrend">vs. manual coding</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-title"><span class="material-icons-round">delete_sweep</span> Code Churn</div>
                <div class="kpi-value" id="churnVal">--</div>
                <div class="kpi-trend">Stability Index</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-title"><span class="material-icons-round">trending_up</span> Productivity</div>
                <div class="kpi-value" id="velocityVal">--</div>
                <div class="kpi-trend">Velocity Gain</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-title"><span class="material-icons-round">attach_money</span> Est. Value</div>
                <div class="kpi-value" id="valueVal">--</div>
                <div class="kpi-trend">Monthly Impact</div>
            </div>
        </div>

        <!-- Charts Section -->
        <div class="section">
            <div class="section-header">
                <h2><span class="material-icons-round">analytics</span> Activity Trends</h2>
            </div>
            <div class="chart-container">
                <canvas id="activityChart"></canvas>
            </div>
            <div class="insight-box" id="activityInsight">
                Analysis pending...
            </div>
        </div>

        <div class="section">
            <div class="section-header">
                <h2><span class="material-icons-round">psychology</span> SPACE Framework Analysis</h2>
            </div>
            <div class="space-matrix">
                <div class="space-item">
                    <div class="space-label">Satisfaction</div>
                    <div class="space-val" id="spaceSat">--</div>
                    <p style="font-size: 0.8rem; color: var(--text-secondary)">Dev Experience & Happiness</p>
                </div>
                <div class="space-item">
                    <div class="space-label">Performance</div>
                    <div class="space-val" id="spacePerf">--</div>
                    <p style="font-size: 0.8rem; color: var(--text-secondary)">Build & Test Health</p>
                </div>
                <div class="space-item">
                    <div class="space-label">Activity</div>
                    <div class="space-val" id="spaceAct">--</div>
                    <p style="font-size: 0.8rem; color: var(--text-secondary)">Volume & Frequency</p>
                </div>
                <div class="space-item">
                    <div class="space-label">Efficiency</div>
                    <div class="space-val" id="spaceEff">--</div>
                    <p style="font-size: 0.8rem; color: var(--text-secondary)">Flow & Interruptions</p>
                </div>
            </div>
        </div>

        <!-- Detailed Metrics Table -->
        <div class="section">
            <div class="section-header">
                <h2><span class="material-icons-round">table_view</span> Detailed Metrics</h2>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Metric Category</th>
                        <th>Measurement</th>
                        <th>Value</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="metricsTableBody">
                    <!-- Populated by JS -->
                </tbody>
            </table>
        </div>

        <div class="section">
            <div class="section-header">
                <h2><span class="material-icons-round">lightbulb</span> Recommendations</h2>
            </div>
            <div id="recommendationsList">
                <!-- Populated by JS -->
            </div>
        </div>
    </div>

    <script>
        // Embed Data directly
        const DATA = ${metricsJson};

        // Helper functions
        const formatPercent = (n) => (n * 100).toFixed(1) + '%';
        const formatTime = (h) => h.toFixed(1) + 'h';
        
        function initDashboard() {
            // 1. KPI Cards
            const roi = DATA.roi?.overallROI || 0;
            const netTime = DATA.productivity?.netTimeSaved || 0;
            const churn = DATA.quality?.codeChurn?.rate || 0;
            const velocity = DATA.productivity?.actualGain || 0;
            const value = DATA.roi?.costBenefit?.netValue || 0;

            document.getElementById('roiScore').textContent = (roi * 100).toFixed(0);
            document.getElementById('roiScore').style.color = roi > 0 ? 'var(--success)' : 'var(--danger)';

            document.getElementById('netTimeVal').textContent = (netTime > 0 ? '+' : '') + formatTime(netTime);
            document.getElementById('netTimeVal').style.color = netTime > 0 ? 'var(--success)' : 'var(--danger)';

            document.getElementById('churnVal').textContent = formatPercent(churn);
            document.getElementById('churnVal').style.color = churn > 0.3 ? 'var(--danger)' : 'var(--success)';

            document.getElementById('velocityVal').textContent = formatPercent(velocity);
            document.getElementById('valueVal').textContent = '$' + value.toFixed(0);

            // 2. Charts
            const ctx = document.getElementById('activityChart').getContext('2d');
            // Mock historical data if history array missing in export, or use current point
            // Ideally DATA should have history. For now, we plot categories.
            
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Time Saved', 'Time Wasted', 'Review Time', 'Fix Time'],
                    datasets: [{
                        label: 'Hours/Week',
                        data: [
                            DATA.roi?.costBenefit?.timeSaved || 0,
                            DATA.roi?.costBenefit?.timeWasted || 0,
                            DATA.roi?.teamImpact?.reviewTime || 0,
                            // Fallback calculation for fix time if not direct
                            Math.abs((DATA.productivity?.netTimeSaved || 0) - (DATA.roi?.costBenefit?.timeSaved || 0))
                        ],
                        backgroundColor: [
                            '#10b981', // Green
                            '#ef4444', // Red
                            '#f59e0b', // Orange
                            '#64748b'  // Gray
                        ],
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, title: { display: true, text: 'Time Allocation Breakdown' } },
                    scales: { y: { beginAtZero: true, title: { display: true, text: 'Hours' } } }
                }
            });

            // 3. SPACE Matrix
            document.getElementById('spaceSat').textContent = (DATA.productivity?.satisfaction?.average || 0).toFixed(1) + '/5';
            document.getElementById('spacePerf').textContent = formatPercent(DATA.performance?.buildStats?.successRate || 0);
            document.getElementById('spaceAct').textContent = (DATA.ai?.totalSuggestions || 0) + ' sugg.';
            document.getElementById('spaceEff').textContent = formatTime(DATA.productivity?.flowEfficiency?.focusTime || 0) + ' focus';

            // 4. Table Population
            const tbody = document.getElementById('metricsTableBody');
            const rows = [
                { cat: 'Quality', name: 'Duplication Rate', val: formatPercent(DATA.quality?.duplication?.cloneRate || 0), status: (DATA.quality?.duplication?.cloneRate || 0) < 0.1 ? 'Good' : 'Check' },
                { cat: 'Quality', name: 'AI vs Human Churn', val: (DATA.quality?.codeChurn?.aiVsHuman || 0).toFixed(2) + 'x', status: 'Info' },
                { cat: 'Productivity', name: 'Context Switches', val: DATA.productivity?.flowEfficiency?.contextSwitches || 0, status: 'Info' },
                { cat: 'Economic', name: 'Break Even', val: (DATA.roi?.breakEvenDays || 0).toFixed(1) + ' days', status: 'Info' }
            ];

            rows.forEach(r => {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td>' + r.cat + '</td><td>' + r.name + '</td><td><strong>' + r.val + '</strong></td><td>' + r.status + '</td>';
                tbody.appendChild(tr);
            });

            // 5. Recommendations
            const recsDiv = document.getElementById('recommendationsList');
            const recText = DATA.roi?.recommendation || 'No specific recommendation.';
            recsDiv.innerHTML = '<div class="insight-box">' + recText + '</div>';
            
            // Dynamic Insight
            const insightDiv = document.getElementById('activityInsight');
            if (netTime > 0) {
                insightDiv.textContent = "Positive Trend: The AI is saving more time than it costs to review/fix its output.";
                insightDiv.style.borderLeftColor = "var(--success)";
            } else {
                insightDiv.textContent = "Attention Needed: Fix/Review time is currently negating the speed gains from AI generation.";
                insightDiv.style.borderLeftColor = "var(--danger)";
            }
        }

        // Run
        initDashboard();
    </script>
</body>
</html>`;
    }
}
