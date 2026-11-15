import * as assert from 'assert';
import { classifyCommit, coAuthors, CommitIdentity } from '../../core/attribution';

const human = (message: string, extra: Partial<CommitIdentity> = {}): CommitIdentity => ({
    authorName: 'Ada Lovelace',
    authorEmail: 'ada@example.com',
    committerName: 'Ada Lovelace',
    committerEmail: 'ada@example.com',
    message,
    ...extra,
});

describe('attribution', () => {
    it('extracts co-author trailers', () => {
        assert.deepStrictEqual(coAuthors('feat: x\n\nCo-authored-by: A <a@x>\nco-authored-by:  B <b@x>'), ['A <a@x>', 'B <b@x>']);
    });

    it('detects Claude Code via trailer', () => {
        const a = classifyCommit(human('fix: thing\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>'));
        assert.strictEqual(a?.tool, 'Claude Code');
        assert.strictEqual(a?.signal, 'trailer');
        assert.strictEqual(a?.confidence, 'high');
    });

    it('detects Claude Code via footer alone', () => {
        const a = classifyCommit(human('feat: y\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'));
        assert.strictEqual(a?.tool, 'Claude Code');
        assert.strictEqual(a?.signal, 'message');
    });

    it('does not flag a human co-author named Claude', () => {
        assert.strictEqual(classifyCommit(human('docs\n\nCo-authored-by: Claude Monet <claude@monet.fr>')), undefined);
    });

    it('does not flag human co-authors named Jules or Devin', () => {
        assert.strictEqual(classifyCommit(human('x\n\nCo-authored-by: Jules Verne <jv@example.com>')), undefined);
        assert.strictEqual(classifyCommit(human('x\n\nCo-authored-by: Devin Smith <devin@example.com>')), undefined);
    });

    it('marks Copilot trailers as medium confidence', () => {
        const a = classifyCommit(human('x\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>'));
        assert.strictEqual(a?.tool, 'GitHub Copilot');
        assert.strictEqual(a?.confidence, 'medium');
    });

    it('detects agent bots as author', () => {
        const a = classifyCommit(human('Initial plan', { authorName: 'copilot-swe-agent[bot]', authorEmail: '198982749+Copilot@users.noreply.github.com' }));
        assert.strictEqual(a?.tool, 'GitHub Copilot');
        assert.strictEqual(a?.signal, 'agent-author');
        const j = classifyCommit(human('x', { authorName: 'google-labs-jules[bot]', authorEmail: 'jules@google.com' }));
        assert.strictEqual(j?.tool, 'Gemini / Jules');
    });

    it('detects Cursor, Codex, Aider', () => {
        assert.strictEqual(classifyCommit(human('x\n\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>'))?.tool, 'Cursor');
        assert.strictEqual(classifyCommit(human('x\n\nCo-authored-by: Codex <codex@openai.com>'))?.tool, 'OpenAI Codex');
        assert.strictEqual(classifyCommit(human('aider: add retry loop'))?.tool, 'Aider');
        assert.strictEqual(classifyCommit(human('x\n\nCo-authored-by: aider (gpt-5) <noreply@aider.chat>'))?.tool, 'Aider');
    });

    it('ignores ordinary commits', () => {
        assert.strictEqual(classifyCommit(human('refactor: extract method\n\nReviewed-by: Bob <bob@x>')), undefined);
    });

    it('applies custom rules first and survives invalid regex', () => {
        const rules = [{ tool: 'Broken', pattern: '([' }, { tool: 'Internal Bot', pattern: '\\[ai-assisted\\]' }];
        assert.strictEqual(classifyCommit(human('feat: z [ai-assisted]'), rules)?.tool, 'Internal Bot');
        assert.strictEqual(classifyCommit(human('plain'), rules), undefined);
    });
});
