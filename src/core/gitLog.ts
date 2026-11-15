import { runGit, GitOptions } from './git';
import { Attribution, classifyCommit, CustomRule } from './attribution';

export interface FileStat {
    path: string;
    added: number;
    deleted: number;
}

export interface Commit {
    sha: string;
    authorName: string;
    authorEmail: string;
    committerName: string;
    committerEmail: string;
    /** Author date (ms since epoch). */
    date: number;
    subject: string;
    message: string;
    files: FileStat[];
    added: number;
    deleted: number;
    attribution?: Attribution;
}

const RS = '\x1e'; // record separator between commits
const US = '\x1f'; // unit separator between fields

/** `git log` format: header fields separated by US, numstat lines follow the final US. */
export const LOG_FORMAT = `${RS}%H${US}%an${US}%ae${US}%cn${US}%ce${US}%at${US}%B${US}`;

/** Lock files and build output inflate line counts without telling you anything. */
export const DEFAULT_EXCLUDES = [
    '(^|/)package-lock\\.json$',
    '(^|/)yarn\\.lock$',
    '(^|/)pnpm-lock\\.yaml$',
    '(^|/)bun\\.lockb?$',
    '(^|/)Cargo\\.lock$',
    '(^|/)poetry\\.lock$',
    '(^|/)uv\\.lock$',
    '(^|/)go\\.sum$',
    '(^|/)composer\\.lock$',
    '(^|/)Gemfile\\.lock$',
    '\\.min\\.(js|css)$',
    '(^|/)(dist|out|build|vendor|node_modules)/',
];

/**
 * Resolves git's rename notation in numstat paths to the new path:
 *   "src/{old => new}/file.ts" -> "src/new/file.ts"
 *   "old.ts => new.ts"         -> "new.ts"
 */
export function resolveRenamePath(p: string): string {
    const brace = p.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
    if (brace) {
        return (brace[1] + brace[3] + brace[4]).replace(/\/\//g, '/');
    }
    const plain = p.match(/^(.*) => (.*)$/);
    return plain ? plain[2] : p;
}

export function parseLog(raw: string, excludes: RegExp[] = [], customRules: CustomRule[] = []): Commit[] {
    const commits: Commit[] = [];
    for (const rec of raw.split(RS)) {
        if (!rec.trim()) { continue; }
        const parts = rec.split(US);
        if (parts.length < 8) { continue; }
        const [sha, authorName, authorEmail, committerName, committerEmail, at, message] = parts;
        const statBlock = parts.slice(7).join(US);
        const files: FileStat[] = [];
        for (const line of statBlock.split('\n')) {
            const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
            if (!m) { continue; }
            if (m[1] === '-' || m[2] === '-') { continue; } // binary
            const path = resolveRenamePath(m[3]);
            if (excludes.some((re) => re.test(path))) { continue; }
            files.push({ path, added: Number(m[1]), deleted: Number(m[2]) });
        }
        const msg = message.trim();
        const c: Commit = {
            sha: sha.trim(),
            authorName,
            authorEmail,
            committerName,
            committerEmail,
            date: Number(at) * 1000,
            subject: msg.split('\n')[0],
            message: msg,
            files,
            added: files.reduce((s, f) => s + f.added, 0),
            deleted: files.reduce((s, f) => s + f.deleted, 0),
        };
        c.attribution = classifyCommit(c, customRules);
        commits.push(c);
    }
    return commits;
}

export interface LogQuery {
    sinceDays: number;
    excludes?: string[];
    customRules?: CustomRule[];
    /** Hard cap on commits read, to bound work on huge monorepos. */
    maxCommits?: number;
}

/** Reads non-merge commits reachable from HEAD within the window, newest first. */
export async function readCommits(root: string, q: LogQuery, git: GitOptions = {}): Promise<Commit[]> {
    const args = [
        'log',
        'HEAD',
        '--no-merges',
        `--since=${q.sinceDays}.days.ago`,
        `--max-count=${q.maxCommits ?? 5000}`,
        '--numstat',
        '-M',
        `--format=${LOG_FORMAT}`,
    ];
    let raw: string;
    try {
        raw = await runGit(root, args, git);
    } catch (e) {
        // A repo with no commits yet has no HEAD: that is an empty history, not an error.
        if (/does not have any commits|unknown revision|bad default revision/i.test(String(e))) {
            return [];
        }
        throw e;
    }
    const excludes = (q.excludes ?? DEFAULT_EXCLUDES).flatMap((p) => {
        try { return [new RegExp(p)]; } catch { return []; }
    });
    return parseLog(raw, excludes, q.customRules ?? []);
}
