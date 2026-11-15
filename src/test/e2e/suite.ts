import * as assert from 'assert';
import * as vscode from 'vscode';
import Mocha from 'mocha';

/** Entry point VS Code calls inside the extension host. */
export function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 60_000 });
    mocha.suite.emit('pre-require', globalThis, 'e2e', mocha);

    describe('TruthMeter in a real VS Code', () => {
        let api: { refresh(): Promise<void>; reports(): readonly any[] };

        before(async () => {
            const ext = vscode.extensions.getExtension('JeffreyJose.truthmeter-ai');
            assert.ok(ext, 'extension is installed');
            api = await ext!.activate();
        });

        it('activates in a git workspace and registers its commands', async () => {
            const cmds = await vscode.commands.getCommands(true);
            for (const c of ['truthmeter.showDashboard', 'truthmeter.refresh', 'truthmeter.exportReport', 'truthmeter.enableAgentLogs']) {
                assert.ok(cmds.includes(c), `${c} registered`);
            }
        });

        it('analyses the workspace repository', async () => {
            await vscode.commands.executeCommand('truthmeter.refresh');
            const reports = api.reports();
            assert.strictEqual(reports.length, 1);
            const r = reports[0];
            assert.strictEqual(r.root, process.env.TRUTHMETER_FIXTURE);
            assert.strictEqual(r.totals.aiCommits, 7);
            assert.strictEqual(r.totals.commits, 16);
            assert.ok(Math.abs(r.ai.survivalRate - 44 / 60) < 1e-9);
        });

        it('opens the dashboard webview', async () => {
            await vscode.commands.executeCommand('truthmeter.showDashboard');
            await new Promise((res) => setTimeout(res, 500));
            const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
            const tab = tabs.find((t) => t.label === 'TruthMeter');
            assert.ok(tab, 'dashboard tab is open');
            assert.ok(tab!.input instanceof vscode.TabInputWebview);
        });

        it('exports a markdown report', async () => {
            await vscode.commands.executeCommand('truthmeter.exportReport');
            const doc = vscode.window.activeTextEditor?.document;
            assert.ok(doc, 'an editor opened');
            assert.strictEqual(doc!.languageId, 'markdown');
            assert.ok(doc!.getText().includes('AI-attributed commits:** 7 of 16'));
        });

        it('re-analyses when the window setting changes', async () => {
            const cfg = vscode.workspace.getConfiguration('truthmeter');
            await cfg.update('windowDays', 30, vscode.ConfigurationTarget.Global);
            await api.refresh();
            // Only the refactor (20d), agent-touched (10d) and recent AI (2d) commits are inside 30 days.
            assert.strictEqual(api.reports()[0].totals.commits, 3);
            await cfg.update('windowDays', undefined, vscode.ConfigurationTarget.Global);
        });
    });

    return new Promise((resolve, reject) => {
        mocha.run((failures) => (failures ? reject(new Error(`${failures} e2e test(s) failed`)) : resolve()));
    });
}
