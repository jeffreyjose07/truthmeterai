import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { analyzeRepo } from '../../core/analyze';
import { toMarkdown } from '../../core/report';
import { FixtureRepo, buildScenario } from '../fixtureRepo';

describe('analyzeRepo (real git, back-dated fixture repo)', function () {
    this.timeout(30_000);
    let repo: FixtureRepo;
    let logsDir: string;

    before(() => {
        repo = new FixtureRepo();
        buildScenario(repo);
        // Fake Claude Code transcript: agent edited src/agent_touched.ts 2h before the human commit (10 days ago).
        logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'truthmeter-logs-'));
        const proj = path.join(logsDir, '-fixture');
        fs.mkdirSync(proj);
        const t = new Date(Date.now() - 10 * 86_400_000 - 2 * 3_600_000).toISOString();
        fs.writeFileSync(path.join(proj, 'sess-1.jsonl'), [
            JSON.stringify({ type: 'user', timestamp: t, message: { content: 'please add it' } }),
            JSON.stringify({ type: 'assistant', timestamp: t, sessionId: 'sess-1', message: { content: [
                { type: 'tool_use', name: 'Write', input: { file_path: path.join(repo.root, 'src/agent_touched.ts'), content: '' } },
                { type: 'tool_use', name: 'Edit', input: { file_path: '/somewhere/else/x.ts' } },
            ] } }),
        ].join('\n'));
    });

    after(() => {
        repo.dispose();
        fs.rmSync(logsDir, { recursive: true, force: true });
    });

    it('counts AI-attributed commits and lines, excluding lock files', async () => {
        const r = await analyzeRepo(repo.root, { windowDays: 90, minAgeDays: 14 });
        assert.strictEqual(r.totals.commits, 16);
        assert.strictEqual(r.totals.aiCommits, 7);
        assert.strictEqual(r.ai.linesAdded, 68); // 6×10 + 8
        assert.strictEqual(r.byTool[0].tool, 'Claude Code');
        assert.strictEqual(r.byTool[0].signals.trailer, 7);
        // lock file (500 lines) excluded: humans added 60 + 1 + 15 + 4
        assert.strictEqual(r.other.linesAdded, 80);
    });

    it('measures line survival from blame at HEAD', async () => {
        const r = await analyzeRepo(repo.root, { windowDays: 90, minAgeDays: 14 });
        // AI: 60 lines in mature commits, 15 rewritten by refactor, 1 by the fix -> 44 survive
        assert.strictEqual(r.ai.matureCommits, 6);
        assert.strictEqual(r.ai.measuredLines, 60);
        assert.strictEqual(r.ai.survivingLines, 44);
        assert.ok(Math.abs((r.ai.survivalRate ?? 0) - 44 / 60) < 1e-9);
        // Humans: all 80 mature lines survive
        assert.strictEqual(r.other.survivalRate, 1);
        // The recent AI commit is shown but marked too recent
        assert.strictEqual(r.recentAiCommits[0].survival, null);
    });

    it('computes fix-within-72h rates per cohort', async () => {
        const r = await analyzeRepo(repo.root, { windowDays: 90, minAgeDays: 14 });
        assert.ok(Math.abs((r.ai.followUpFixRate ?? 0) - 1 / 6) < 1e-9);
        assert.strictEqual(r.other.followUpFixRate, 0);
    });

    it('withholds rates when the sample is too small', async () => {
        const r = await analyzeRepo(repo.root, { windowDays: 90, minAgeDays: 39 });
        assert.strictEqual(r.ai.survivalRate, null);
        assert.ok(r.caveats.some((c) => c.includes('at least 5 commits')));
    });

    it('uses agent session logs to find untrailed AI commits', async () => {
        const r = await analyzeRepo(repo.root, {
            windowDays: 90,
            minAgeDays: 14,
            agentLogs: { enabled: true, sources: [{ tool: 'Claude Code', dir: logsDir }] },
        });
        assert.ok(r.agent);
        assert.deepStrictEqual(r.agent!.summaries, [{ tool: 'Claude Code', sessions: 1, edits: 1, files: 1 }]);
        assert.strictEqual(r.agent!.untrailedAgentCommits, 1);
        assert.strictEqual(r.agent!.untrailedAgentLines, 4);
    });

    it('renders a markdown report', async () => {
        const r = await analyzeRepo(repo.root, { windowDays: 90, minAgeDays: 14 });
        const md = toMarkdown(r);
        assert.ok(md.includes('AI-attributed commits:** 7 of 16'));
        assert.ok(md.includes('| Claude Code | 7 |'));
    });

    it('handles an empty repository', async () => {
        const empty = new FixtureRepo();
        try {
            const r = await analyzeRepo(empty.root, { windowDays: 90, minAgeDays: 14 });
            assert.strictEqual(r.totals.commits, 0);
            assert.strictEqual(r.ai.survivalRate, null);
        } finally {
            empty.dispose();
        }
    });
});
