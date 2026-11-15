import * as vscode from 'vscode';
import { analyzeRepo, RepoReport, AnalyzeOptions } from './core/analyze';
import { findRepoRoot } from './core/git';
import { toMarkdown, pct, share } from './core/report';
import { CustomRule } from './core/attribution';
import { renderDashboard, DashboardState } from './dashboard';

const STALE_MS = 10 * 60_000;

class TruthMeter implements vscode.Disposable {
    private reports: RepoReport[] = [];
    private selected = 0;
    private lastRun = 0;
    private running?: Promise<void>;
    private error?: string;
    private panel?: vscode.WebviewPanel;
    private readonly status: vscode.StatusBarItem;
    private readonly output: vscode.LogOutputChannel;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly ctx: vscode.ExtensionContext) {
        this.output = vscode.window.createOutputChannel('TruthMeter', { log: true });
        this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
        this.status.command = 'truthmeter.showDashboard';
        this.status.name = 'TruthMeter';
        this.disposables.push(this.output, this.status);
    }

    private config() {
        return vscode.workspace.getConfiguration('truthmeter');
    }

    private options(): AnalyzeOptions {
        const c = this.config();
        const gitPath = vscode.workspace.getConfiguration('git').get<string | string[]>('path');
        return {
            windowDays: c.get<number>('windowDays', 90),
            minAgeDays: c.get<number>('survival.minAgeDays', 14),
            excludes: c.get<string[]>('excludePatterns'),
            customRules: c.get<CustomRule[]>('attribution.customRules', []),
            trustCopilotTrailer: c.get<boolean>('attribution.trustCopilotTrailer', true),
            agentLogs: { enabled: c.get<boolean>('agentLogs.enabled', false) },
            git: { gitPath: Array.isArray(gitPath) ? gitPath[0] : gitPath || undefined },
            maxBlameFiles: c.get<number>('survival.maxFiles', 400),
        };
    }

    async repoRoots(): Promise<string[]> {
        const roots = new Set<string>();
        const git = this.options().git;
        for (const f of vscode.workspace.workspaceFolders ?? []) {
            if (f.uri.scheme !== 'file') { continue; }
            const root = await findRepoRoot(f.uri.fsPath, git);
            if (root) { roots.add(root); }
        }
        return [...roots];
    }

    /** Re-analyses every repo in the workspace. Concurrent calls share one run. */
    refresh(): Promise<void> {
        if (this.running) { return this.running; }
        this.running = (async () => {
            const started = Date.now();
            this.render(true);
            this.status.text = '$(sync~spin) TruthMeter';
            try {
                const roots = await this.repoRoots();
                const opts = this.options();
                const reports: RepoReport[] = [];
                for (const root of roots) {
                    try {
                        reports.push(await analyzeRepo(root, opts));
                    } catch (e) {
                        this.output.error(`Analysis failed for ${root}: ${e}`);
                    }
                }
                this.reports = reports;
                this.selected = Math.min(this.selected, Math.max(0, reports.length - 1));
                this.error = roots.length && !reports.length ? 'Git analysis failed. See the TruthMeter output channel for details.' : undefined;
                this.output.info(`Analysed ${reports.length} repo(s) in ${Date.now() - started} ms`);
            } catch (e) {
                this.error = String(e);
                this.output.error(String(e));
            } finally {
                this.lastRun = Date.now();
                this.running = undefined;
                this.updateStatus();
                this.render(false);
            }
        })();
        return this.running;
    }

    refreshIfStale(): void {
        if (Date.now() - this.lastRun > STALE_MS) { void this.refresh(); }
    }

    private updateStatus(): void {
        const r = this.reports[this.selected];
        if (!this.config().get<boolean>('statusBar.enabled', true) || !r) {
            this.status.hide();
            return;
        }
        const s = share(r.totals.aiCommits, r.totals.commits);
        this.status.text = `$(beaker) AI ${s === null ? '–' : pct(s)}`;
        const tip = new vscode.MarkdownString(
            `**TruthMeter — ${r.repoName}** (last ${r.windowDays} days)\n\n` +
            `- AI-attributed commits: ${r.totals.aiCommits}/${r.totals.commits}\n` +
            `- AI line survival: ${pct(r.ai.survivalRate)} (other: ${pct(r.other.survivalRate)})\n\n` +
            'Click to open the dashboard.'
        );
        this.status.tooltip = tip;
        this.status.show();
    }

    private state(loading: boolean): DashboardState {
        return {
            reports: this.reports,
            selected: this.selected,
            windowDays: this.config().get<number>('windowDays', 90),
            agentLogsEnabled: this.config().get<boolean>('agentLogs.enabled', false),
            error: this.error,
            loading,
        };
    }

    private render(loading: boolean): void {
        if (this.panel) {
            this.panel.webview.html = renderDashboard(this.state(loading), this.panel.webview.cspSource);
        }
    }

    showDashboard(): void {
        if (this.panel) {
            this.panel.reveal();
        } else {
            this.panel = vscode.window.createWebviewPanel('truthmeter.dashboard', 'TruthMeter', vscode.ViewColumn.Active, {
                enableScripts: true,
                localResourceRoots: [],
            });
            this.panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'icon.png');
            this.panel.onDidDispose(() => (this.panel = undefined), null, this.disposables);
            this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m), null, this.disposables);
            this.render(!!this.running);
        }
        this.refreshIfStale();
    }

    private async onMessage(m: { type: string; index?: number; days?: number }): Promise<void> {
        switch (m.type) {
            case 'refresh':
                await this.refresh();
                break;
            case 'export':
                await this.exportReport();
                break;
            case 'enableAgent':
                await this.enableAgentLogs();
                break;
            case 'selectRepo':
                this.selected = m.index ?? 0;
                this.updateStatus();
                this.render(false);
                break;
            case 'setWindow':
                // Configuration change listener triggers the refresh.
                await this.config().update('windowDays', m.days, vscode.ConfigurationTarget.Global);
                break;
        }
    }

    async exportReport(): Promise<void> {
        if (!this.reports.length) { await this.refresh(); }
        const r = this.reports[this.selected];
        if (!r) {
            void vscode.window.showWarningMessage('TruthMeter: no git repository found in this workspace.');
            return;
        }
        const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: toMarkdown(r) });
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    async enableAgentLogs(): Promise<void> {
        const choice = await vscode.window.showInformationMessage(
            'TruthMeter will read local Claude Code (~/.claude/projects) and Codex (~/.codex/sessions) session logs to find files an agent edited. Only file paths and timestamps inside this workspace are used, and nothing leaves your machine.',
            { modal: true },
            'Turn on'
        );
        if (choice === 'Turn on') {
            await this.config().update('agentLogs.enabled', true, vscode.ConfigurationTarget.Global);
        }
    }

    /** For tests: the latest reports. */
    get latest(): readonly RepoReport[] {
        return this.reports;
    }

    dispose(): void {
        this.panel?.dispose();
        vscode.Disposable.from(...this.disposables).dispose();
    }
}

export interface TruthMeterApi {
    refresh(): Promise<void>;
    reports(): readonly RepoReport[];
}

export function activate(ctx: vscode.ExtensionContext): TruthMeterApi {
    const tm = new TruthMeter(ctx);
    ctx.subscriptions.push(
        tm,
        vscode.commands.registerCommand('truthmeter.showDashboard', () => tm.showDashboard()),
        vscode.commands.registerCommand('truthmeter.refresh', () => tm.refresh()),
        vscode.commands.registerCommand('truthmeter.exportReport', () => tm.exportReport()),
        vscode.commands.registerCommand('truthmeter.enableAgentLogs', () => tm.enableAgentLogs()),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('truthmeter')) { void tm.refresh(); }
        }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => void tm.refresh()),
        vscode.window.onDidChangeWindowState((s) => {
            if (s.focused) { tm.refreshIfStale(); }
        })
    );
    // Defer the first analysis so it never competes with editor startup.
    const t = setTimeout(() => void tm.refresh(), 3000);
    ctx.subscriptions.push({ dispose: () => clearTimeout(t) });
    return { refresh: () => tm.refresh(), reports: () => tm.latest };
}

export function deactivate(): void {
    /* disposables handle cleanup */
}
