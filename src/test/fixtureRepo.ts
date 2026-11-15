import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const DAY = 86_400_000;
export const CLAUDE = 'Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>';

/** A throwaway git repo whose commits are back-dated, for end-to-end tests. */
export class FixtureRepo {
    readonly root: string;

    constructor() {
        this.root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'truthmeter-fixture-')));
        this.git(['init', '-q', '-b', 'main']);
        this.git(['config', 'user.name', 'Test Human']);
        this.git(['config', 'user.email', 'human@example.com']);
        this.git(['config', 'commit.gpgsign', 'false']);
    }

    git(args: string[], env: NodeJS.ProcessEnv = {}): string {
        return execFileSync('git', args, { cwd: this.root, env: { ...process.env, ...env }, encoding: 'utf8' });
    }

    write(file: string, lines: string[]): void {
        const full = path.join(this.root, file);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, lines.join('\n') + '\n');
    }

    read(file: string): string[] {
        return fs.readFileSync(path.join(this.root, file), 'utf8').trimEnd().split('\n');
    }

    /** Commits everything, dated `daysAgo` days before now. Returns the sha. */
    commit(message: string, daysAgo: number): string {
        const when = Math.floor((Date.now() - daysAgo * DAY) / 1000);
        const date = `@${when} +0000`;
        this.git(['add', '-A']);
        const msgFile = path.join(this.root, '.git', 'MSG');
        fs.writeFileSync(msgFile, message);
        this.git(['commit', '-q', '-F', msgFile], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
        return this.git(['rev-parse', 'HEAD']).trim();
    }

    dispose(): void {
        fs.rmSync(this.root, { recursive: true, force: true });
    }
}

export const lines = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `const ${prefix}_${i} = ${i};`);

/**
 * Builds the standard scenario used by the integration and e2e tests:
 * - 6 AI commits (40-35 days old) each adding 10 lines; 3 of those files later get 5 lines rewritten
 * - 6 human commits (40-35 days old) each adding 10 lines, untouched
 * - a human "fix:" commit 1h after AI commit #3, changing 1 of its lines
 * - a human refactor 20 days ago rewriting the 15 lines
 * - 1 recent AI commit (2 days old), too young for survival
 * - a lock file change that must be excluded
 */
export function buildScenario(repo: FixtureRepo): { aiShas: string[]; humanTouchedByAgent: string } {
    const aiShas: string[] = [];
    for (let i = 0; i < 6; i++) {
        repo.write(`src/human_${i}.ts`, lines(`h${i}`, 10));
        repo.commit(`feat: human module ${i}`, 40 - i);
        repo.write(`src/ai_${i}.ts`, lines(`a${i}`, 10));
        aiShas.push(repo.commit(`feat: ai module ${i}\n\n${CLAUDE}\n`, 40 - i - 0.5));
    }
    // fix 1h after AI commit #3 (which is 36.5 days old)
    const ai3 = repo.read('src/ai_3.ts');
    ai3[0] = 'const a3_0 = 100; // fixed';
    repo.write('src/ai_3.ts', ai3);
    repo.commit('fix: off-by-one in ai module 3', 36.5 - 1 / 24);

    // refactor 20 days ago: rewrite 5 lines in ai_0..ai_2
    for (let i = 0; i < 3; i++) {
        const l = repo.read(`src/ai_${i}.ts`);
        for (let k = 5; k < 10; k++) { l[k] = `export const a${i}_${k}_v2 = ${k * 2};`; }
        repo.write(`src/ai_${i}.ts`, l);
    }
    repo.write('package-lock.json', lines('lock', 500));
    repo.commit('refactor: tidy ai modules', 20);

    // a human-committed file that an agent edited (for session evidence)
    repo.write('src/agent_touched.ts', lines('ag', 4));
    const humanTouchedByAgent = repo.commit('feat: agent touched but no trailer', 10);

    repo.write('src/recent_ai.ts', lines('r', 8));
    aiShas.push(repo.commit(`feat: recent ai\n\n${CLAUDE}\n`, 2));
    return { aiShas, humanTouchedByAgent };
}
