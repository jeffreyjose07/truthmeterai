import { runGit, mapLimit, GitOptions } from './git';
import { Commit } from './gitLog';

/**
 * Line survival: of the lines a commit added, how many are still attributed to that
 * commit by `git blame` at HEAD? This is the GitClear-style "did the code stick" signal,
 * computed from your own history rather than an industry average.
 */

/** Counts, per origin commit sha, how many lines of `path` at HEAD it still owns. */
export function countBlameOwners(porcelain: string): Map<string, number> {
    const counts = new Map<string, number>();
    // With --line-porcelain every line starts with "<40-hex sha> <orig> <final>[ <n>]".
    for (const line of porcelain.split('\n')) {
        const m = line.match(/^([0-9a-f]{40}) \d+ \d+/);
        if (m) {
            counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
        }
    }
    return counts;
}

export interface SurvivalResult {
    survivors: Map<string, number>;
    /** Paths that were blamed. */
    blamed: Set<string>;
    /** Paths tracked at HEAD. Lines in untracked (deleted) paths count as not surviving. */
    tracked: Set<string>;
    filesSkipped: number;
}

/**
 * Lines added by `c` that the survival measurement actually covers: files we blamed,
 * plus files that no longer exist (their lines definitively did not survive).
 * Files skipped because of the cap are left out of the denominator so they don't bias it.
 */
export function measuredAdded(c: Commit, r: SurvivalResult): number {
    return c.files
        .filter((f) => r.blamed.has(f.path) || !r.tracked.has(f.path))
        .reduce((s, f) => s + f.added, 0);
}

export interface SurvivalOptions {
    maxFiles?: number;
    concurrency?: number;
}

/**
 * Blames every file at HEAD that was touched by `commits` and returns, per sha, the number
 * of surviving lines. Files deleted (or renamed away) since contribute zero survivors.
 */
export async function survivingLines(
    root: string,
    commits: Commit[],
    git: GitOptions = {},
    opts: SurvivalOptions = {}
): Promise<SurvivalResult> {
    const wanted = new Set(commits.map((c) => c.sha));
    const tracked = new Set(
        (await runGit(root, ['ls-files', '-z'], git)).split('\0').filter(Boolean)
    );

    // Prioritise files touched by the most commits so a cap loses the least signal.
    const touchCount = new Map<string, number>();
    for (const c of commits) {
        for (const f of c.files) {
            if (tracked.has(f.path)) {
                touchCount.set(f.path, (touchCount.get(f.path) ?? 0) + 1);
            }
        }
    }
    const files = [...touchCount.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
    const maxFiles = opts.maxFiles ?? 400;
    const toBlame = files.slice(0, maxFiles);

    const survivors = new Map<string, number>();
    const blamed = new Set<string>();
    await mapLimit(toBlame, opts.concurrency ?? 6, async (path) => {
        try {
            const out = await runGit(root, ['blame', '--line-porcelain', '-w', 'HEAD', '--', path], git);
            blamed.add(path);
            for (const [sha, n] of countBlameOwners(out)) {
                if (wanted.has(sha)) {
                    survivors.set(sha, (survivors.get(sha) ?? 0) + n);
                }
            }
        } catch {
            // Unblameable file (e.g. submodule, binary misdetected): skip it.
        }
    });

    return { survivors, blamed, tracked, filesSkipped: files.length - toBlame.length };
}
