/**
 * Development CLI: runs the same analysis as the extension against any repo and prints
 * the Markdown report. Usage: npm run analyze -- <repo> [--days 90] [--agent-logs] [--json]
 */
import { analyzeRepo } from './core/analyze';
import { findRepoRoot } from './core/git';
import { toMarkdown } from './core/report';

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const flag = (n: string) => args.includes(n);
    const val = (n: string, d: string) => {
        const i = args.indexOf(n);
        return i >= 0 && args[i + 1] ? args[i + 1] : d;
    };
    const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--days') ?? process.cwd();
    const root = await findRepoRoot(target);
    if (!root) {
        console.error(`Not a git repository: ${target}`);
        process.exit(1);
    }
    const t0 = Date.now();
    const report = await analyzeRepo(root, {
        windowDays: Number(val('--days', '90')),
        minAgeDays: Number(val('--min-age', '14')),
        agentLogs: { enabled: flag('--agent-logs') },
    });
    if (flag('--json')) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(toMarkdown(report));
        console.error(`(analysed in ${Date.now() - t0} ms)`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
