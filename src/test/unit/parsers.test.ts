import * as assert from 'assert';
import { parseLog, resolveRenamePath, LOG_FORMAT } from '../../core/gitLog';
import { countBlameOwners } from '../../core/survival';
import { parseClaudeLine, parseCodexLine } from '../../core/agentLogs';
import { followUpFixes } from '../../core/analyze';
import { Commit } from '../../core/gitLog';

describe('git log parsing', () => {
    it('resolves rename notation', () => {
        assert.strictEqual(resolveRenamePath('src/{old => new}/a.ts'), 'src/new/a.ts');
        assert.strictEqual(resolveRenamePath('src/{ => lib}/a.ts'), 'src/lib/a.ts');
        assert.strictEqual(resolveRenamePath('a.ts => b.ts'), 'b.ts');
        assert.strictEqual(resolveRenamePath('plain/path.ts'), 'plain/path.ts');
    });

    it('parses records, numstat, binaries and excludes', () => {
        const rec = (sha: string, msg: string, stats: string) =>
            LOG_FORMAT.replace('%H', sha).replace('%an', 'A').replace('%ae', 'a@x').replace('%cn', 'A').replace('%ce', 'a@x').replace('%at', '1700000000').replace('%B', msg) + '\n\n' + stats + '\n';
        const raw =
            rec('a'.repeat(40), 'feat: one\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n', '10\t2\tsrc/a.ts\n-\t-\timg.png\n500\t0\tpackage-lock.json') +
            rec('b'.repeat(40), 'chore: two\n', '3\t1\tREADME.md');
        const commits = parseLog(raw, [/(^|\/)package-lock\.json$/]);
        assert.strictEqual(commits.length, 2);
        assert.strictEqual(commits[0].added, 10);
        assert.strictEqual(commits[0].files.length, 1);
        assert.strictEqual(commits[0].attribution?.tool, 'Claude Code');
        assert.strictEqual(commits[0].date, 1700000000000);
        assert.strictEqual(commits[1].attribution, undefined);
        assert.strictEqual(commits[1].subject, 'chore: two');
    });
});

describe('blame porcelain', () => {
    it('counts owning commits per line', () => {
        const a = 'a'.repeat(40);
        const b = 'b'.repeat(40);
        const out = [`${a} 1 1 2`, 'author X', '\tline1', `${a} 2 2`, 'author X', '\tline2', `${b} 5 3 1`, '\tline3'].join('\n');
        const m = countBlameOwners(out);
        assert.strictEqual(m.get(a), 2);
        assert.strictEqual(m.get(b), 1);
    });

    it('does not count content lines that look like hashes', () => {
        const a = 'a'.repeat(40);
        const out = [`${a} 1 1 1`, `\t${'c'.repeat(40)} 1 1`].join('\n');
        assert.strictEqual(countBlameOwners(out).size, 1);
    });
});

describe('agent log parsing', () => {
    it('extracts Claude Code edit tool calls', () => {
        const line = JSON.stringify({
            type: 'assistant',
            timestamp: '2026-11-01T10:00:00.000Z',
            sessionId: 's1',
            message: { content: [
                { type: 'text', text: 'editing' },
                { type: 'tool_use', name: 'Edit', input: { file_path: '/repo/src/a.ts', old_string: 'x', new_string: 'y' } },
                { type: 'tool_use', name: 'Read', input: { file_path: '/repo/src/b.ts' } },
                { type: 'tool_use', name: 'Write', input: { file_path: '/repo/src/c.ts', content: '' } },
            ] },
        });
        const hit = parseClaudeLine(line);
        assert.deepStrictEqual(hit?.files, ['/repo/src/a.ts', '/repo/src/c.ts']);
        assert.strictEqual(hit?.time, Date.parse('2026-11-01T10:00:00.000Z'));
    });

    it('ignores non-edit Claude lines and junk', () => {
        assert.strictEqual(parseClaudeLine('{"type":"user","message":{"content":"hi"}}'), undefined);
        assert.strictEqual(parseClaudeLine('not json "tool_use"'), undefined);
    });

    it('extracts Codex apply_patch files relative to session cwd', () => {
        const state: { cwd?: string } = {};
        parseCodexLine(JSON.stringify({ type: 'session_meta', payload: { cwd: '/repo' } }), state);
        const line = JSON.stringify({
            timestamp: '2026-11-02T09:00:00Z',
            type: 'response_item',
            payload: { type: 'custom_tool_call', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: src/a.ts\n@@\n-x\n+y\n*** Add File: /abs/b.ts\n+z\n*** End Patch' },
        });
        const hit = parseCodexLine(line, state);
        assert.deepStrictEqual(hit?.files, ['/repo/src/a.ts', '/abs/b.ts']);
    });
});

describe('follow-up fixes', () => {
    const mk = (sha: string, hoursAgo: number, subject: string, files: string[], message = subject): Commit => ({
        sha, authorName: '', authorEmail: '', committerName: '', committerEmail: '',
        date: 1_800_000_000_000 - hoursAgo * 3_600_000, subject, message,
        files: files.map((p) => ({ path: p, added: 1, deleted: 0 })), added: files.length, deleted: 0,
    });

    it('flags commits fixed within 72h on the same files', () => {
        const commits = [
            mk('c3', 0, 'fix: null check', ['a.ts']),
            mk('c2', 10, 'feat: other', ['b.ts']),
            mk('c1', 20, 'feat: add a', ['a.ts']),
        ];
        const r = followUpFixes(commits);
        assert.strictEqual(r.get('c1')?.fixed, true);
        assert.strictEqual(r.get('c2')?.fixed, false);
    });

    it('ignores overlap on manifest/readme files', () => {
        const r = followUpFixes([mk('f', 1, 'fix: bump', ['package.json', 'README.md']), mk('c', 5, 'feat: x', ['src/x.ts', 'package.json'])]);
        assert.strictEqual(r.get('c')?.fixed, false);
    });

    it('ignores fixes after 72h or on other files, and detects reverts', () => {
        const c1 = mk('c1'.padEnd(40, '0'), 200, 'feat: add', ['a.ts']);
        const commits = [
            mk('r', 190, 'Revert "feat: add"', ['a.ts'], `Revert "feat: add"\n\nThis reverts commit ${c1.sha}.`),
            mk('late', 0, 'fix: late', ['z.ts']),
            c1,
        ];
        const r = followUpFixes(commits);
        assert.strictEqual(r.get(c1.sha)?.reverted, true);
        const lateOnly = followUpFixes([mk('f', 0, 'fix: a', ['a.ts']), mk('old', 100, 'feat', ['a.ts'])]);
        assert.strictEqual(lateOnly.get('old')?.fixed, false);
    });
});
