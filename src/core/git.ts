import { execFile } from 'child_process';

export interface GitOptions {
    /** Path to the git binary. Defaults to `git` on PATH. */
    gitPath?: string;
    /** Per-call timeout in milliseconds. */
    timeoutMs?: number;
}

/**
 * Runs a git command in `cwd` and resolves with stdout.
 * Uses execFile (no shell), so arguments are never interpreted by a shell.
 */
export function runGit(cwd: string, args: string[], opts: GitOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            opts.gitPath || 'git',
            args,
            {
                cwd,
                timeout: opts.timeoutMs ?? 60_000,
                maxBuffer: 256 * 1024 * 1024,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
                windowsHide: true,
            },
            (err, stdout, stderr) => {
                if (err) {
                    const msg = (stderr || err.message || '').toString().trim();
                    reject(new Error(`git ${args[0]} failed: ${msg}`));
                    return;
                }
                resolve(stdout.toString());
            }
        );
    });
}

/** Returns the repository top-level directory, or undefined if `dir` is not inside a git work tree. */
export async function findRepoRoot(dir: string, opts: GitOptions = {}): Promise<string | undefined> {
    try {
        const out = await runGit(dir, ['rev-parse', '--show-toplevel'], opts);
        return out.trim() || undefined;
    } catch {
        return undefined;
    }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i]);
        }
    });
    await Promise.all(workers);
    return results;
}
