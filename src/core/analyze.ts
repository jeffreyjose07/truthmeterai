import * as path from 'path';
import * as fs from 'fs';
import { GitOptions } from './git';
import { Commit, readCommits, DEFAULT_EXCLUDES } from './gitLog';
import { CustomRule, Signal } from './attribution';
import { survivingLines, measuredAdded } from './survival';
import { AgentEdit, AgentLogSource, scanAgentEdits } from './agentLogs';

const DAY = 86_400_000;

export interface AnalyzeOptions {
    windowDays: number;
    /** Commits younger than this are excluded from survival/follow-up stats (not enough time has passed). */
    minAgeDays: number;
    excludes?: string[];
    customRules?: CustomRule[];
    /** Treat Copilot co-author trailers as evidence (VS Code can add them automatically). */
    trustCopilotTrailer?: boolean;
    agentLogs?: { enabled: boolean; sources?: AgentLogSource[] };
    git?: GitOptions;
    maxBlameFiles?: number;
    /** Injected for tests. */
    now?: number;
}

export interface CohortStats {
    commits: number;
    linesAdded: number;
    /** Commits old enough to judge survival / follow-ups. */
    matureCommits: number;
    measuredLines: number;
    survivingLines: number;
    /** survivingLines / measuredLines, or null when there's too little data. */
    survivalRate: number | null;
    /** Share of mature commits followed within 72h by a fix/revert touching the same files. */
    followUpFixRate: number | null;
    revertedCommits: number;
}

export interface ToolStats {
    tool: string;
    commits: number;
    linesAdded: number;
    signals: Record<Signal, number>;
    mediumConfidence: number;
}

export interface WeekBucket {
    weekStart: number;
    aiCommits: number;
    otherCommits: number;
    aiLines: number;
    otherLines: number;
}

export interface AgentSummary {
    tool: string;
    sessions: number;
    edits: number;
    files: number;
}

export interface EvidenceCommit {
    sha: string;
    date: number;
    subject: string;
    tool: string;
    signal: Signal | 'session';
    evidence: string;
    added: number;
    /** Surviving share, or null if the commit is too recent or added no measurable lines. */
    survival: number | null;
    tooRecent: boolean;
}

export interface RepoReport {
    repoName: string;
    root: string;
    generatedAt: number;
    windowDays: number;
    minAgeDays: number;
    totals: { commits: number; linesAdded: number; aiCommits: number; aiLinesAdded: number };
    ai: CohortStats;
    other: CohortStats;
    byTool: ToolStats[];
    weekly: WeekBucket[];
    agent?: {
        enabled: true;
        summaries: AgentSummary[];
        /** Commits with no trailer whose files an agent edited in the 24h before the commit. */
        untrailedAgentCommits: number;
        untrailedAgentLines: number;
    };
    recentAiCommits: EvidenceCommit[];
    blame: { filesSkipped: number };
    caveats: string[];
}

/** Minimum mature commits in a cohort before rates are shown. Below this they are noise. */
export const MIN_SAMPLE = 5;

/**
 * Files nearly every commit touches (manifests, changelogs, READMEs). Overlap on these
 * says nothing about whether a later fix was fixing *this* commit, so they're ignored.
 */
const HUB_FILE_RE = /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml|build\.gradle(\.kts)?|CHANGELOG[^/]*|README[^/]*|\.gitignore)$/i;

const FIX_RE = /\b(fix(es|ed)?|bug|revert|hotfix|oops|typo|broken|regression|patch(es|ed)?)\b/i;

function isAi(c: Commit): boolean {
    return !!c.attribution;
}

/**
 * For each commit, true if a later commit within 72h touches one of its files and
 * looks like a fix or revert. Commits are newest-first.
 */
export function followUpFixes(commits: Commit[]): Map<string, { fixed: boolean; reverted: boolean }> {
    const result = new Map<string, { fixed: boolean; reverted: boolean }>();
    const byAge = [...commits].sort((a, b) => a.date - b.date);
    for (let i = 0; i < byAge.length; i++) {
        const c = byAge[i];
        const files = new Set(c.files.map((f) => f.path).filter((p) => !HUB_FILE_RE.test(p)));
        let fixed = false;
        let reverted = false;
        for (let j = i + 1; j < byAge.length; j++) {
            const later = byAge[j];
            if (later.date - c.date > 3 * DAY) { break; }
            if (later.message.includes(`This reverts commit ${c.sha}`)) {
                reverted = true;
                fixed = true;
                break;
            }
            if (FIX_RE.test(later.subject) && later.files.some((f) => files.has(f.path))) {
                fixed = true;
            }
        }
        result.set(c.sha, { fixed, reverted });
    }
    return result;
}

function weekStart(ms: number): number {
    const d = new Date(ms);
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

function rate(num: number, den: number, sampleOk: boolean): number | null {
    return sampleOk && den > 0 ? num / den : null;
}

export async function analyzeRepo(root: string, opts: AnalyzeOptions): Promise<RepoReport> {
    const now = opts.now ?? Date.now();
    const git = opts.git ?? {};
    const caveats: string[] = [];

    let commits = await readCommits(
        root,
        { sinceDays: opts.windowDays, excludes: opts.excludes ?? DEFAULT_EXCLUDES, customRules: opts.customRules },
        git
    );

    if (opts.trustCopilotTrailer === false) {
        commits = commits.map((c) =>
            c.attribution?.tool === 'GitHub Copilot' && c.attribution.signal === 'trailer' ? { ...c, attribution: undefined } : c
        );
    } else if (commits.some((c) => c.attribution?.tool === 'GitHub Copilot' && c.attribution.signal === 'trailer')) {
        caveats.push(
            'Copilot co-author trailers are counted at medium confidence: VS Code can add them automatically (git.addAICoAuthor) even when Copilot wrote little or nothing. Turn off truthmeter.attribution.trustCopilotTrailer to exclude them.'
        );
    }

    // Agent session evidence (opt-in).
    let agentEdits: AgentEdit[] = [];
    if (opts.agentLogs?.enabled) {
        agentEdits = await scanAgentEdits(root, now - opts.windowDays * DAY, opts.agentLogs.sources);
    }
    const realRoot = await fs.promises.realpath(root).catch(() => root);
    const relEdits = agentEdits.map((e) => {
        let rel = path.relative(realRoot, e.file);
        if (rel.startsWith('..')) { rel = path.relative(root, e.file); }
        return { ...e, rel: rel.split(path.sep).join('/') };
    });
    const editsByFile = new Map<string, typeof relEdits>();
    for (const e of relEdits) {
        const arr = editsByFile.get(e.rel) ?? [];
        arr.push(e);
        editsByFile.set(e.rel, arr);
    }
    const sessionHit = (c: Commit): string | undefined => {
        for (const f of c.files) {
            const hit = editsByFile.get(f.path)?.find((e) => e.time <= c.date + 60_000 && c.date - e.time <= DAY);
            if (hit) { return hit.tool; }
        }
        return undefined;
    };

    const mature = commits.filter((c) => now - c.date >= opts.minAgeDays * DAY);
    const survival = await survivingLines(root, mature, git, { maxFiles: opts.maxBlameFiles });
    const followUps = followUpFixes(commits);

    const cohort = (list: Commit[]): CohortStats => {
        const m = list.filter((c) => now - c.date >= opts.minAgeDays * DAY);
        let measured = 0;
        let surviving = 0;
        let fixed = 0;
        let reverted = 0;
        for (const c of m) {
            const den = measuredAdded(c, survival);
            measured += den;
            surviving += Math.min(survival.survivors.get(c.sha) ?? 0, den);
            const f = followUps.get(c.sha);
            if (f?.fixed) { fixed++; }
            if (f?.reverted) { reverted++; }
        }
        const ok = m.length >= MIN_SAMPLE;
        return {
            commits: list.length,
            linesAdded: list.reduce((s, c) => s + c.added, 0),
            matureCommits: m.length,
            measuredLines: measured,
            survivingLines: surviving,
            survivalRate: rate(surviving, measured, ok && measured > 0),
            followUpFixRate: rate(fixed, m.length, ok),
            revertedCommits: reverted,
        };
    };

    const aiCommits = commits.filter(isAi);
    const otherCommits = commits.filter((c) => !isAi(c));

    const toolMap = new Map<string, ToolStats>();
    for (const c of aiCommits) {
        const a = c.attribution!;
        const t = toolMap.get(a.tool) ?? {
            tool: a.tool, commits: 0, linesAdded: 0, signals: { trailer: 0, 'agent-author': 0, message: 0 }, mediumConfidence: 0,
        };
        t.commits++;
        t.linesAdded += c.added;
        t.signals[a.signal]++;
        if (a.confidence === 'medium') { t.mediumConfidence++; }
        toolMap.set(a.tool, t);
    }

    const weeks = new Map<number, WeekBucket>();
    for (let t = weekStart(now - opts.windowDays * DAY); t <= now; t += 7 * DAY) {
        weeks.set(t, { weekStart: t, aiCommits: 0, otherCommits: 0, aiLines: 0, otherLines: 0 });
    }
    for (const c of commits) {
        const w = weeks.get(weekStart(c.date));
        if (!w) { continue; }
        if (isAi(c)) { w.aiCommits++; w.aiLines += c.added; } else { w.otherCommits++; w.otherLines += c.added; }
    }

    const survivalOf = (c: Commit): number | null => {
        if (now - c.date < opts.minAgeDays * DAY) { return null; }
        const den = measuredAdded(c, survival);
        return den > 0 ? Math.min(survival.survivors.get(c.sha) ?? 0, den) / den : null;
    };

    let agent: RepoReport['agent'];
    if (opts.agentLogs?.enabled) {
        const byTool = new Map<string, { sessions: Set<string>; edits: number; files: Set<string> }>();
        for (const e of relEdits) {
            const s = byTool.get(e.tool) ?? { sessions: new Set(), edits: 0, files: new Set() };
            s.sessions.add(e.session);
            s.edits++;
            s.files.add(e.rel);
            byTool.set(e.tool, s);
        }
        const untrailed = otherCommits.filter((c) => sessionHit(c));
        agent = {
            enabled: true,
            summaries: [...byTool.entries()].map(([tool, s]) => ({ tool, sessions: s.sessions.size, edits: s.edits, files: s.files.size })),
            untrailedAgentCommits: untrailed.length,
            untrailedAgentLines: untrailed.reduce((s, c) => s + c.added, 0),
        };
        if (untrailed.length) {
            caveats.push(
                `${untrailed.length} commit(s) have no AI trailer, but an agent edited their files in the 24h before they were committed. They are counted as "other" above; the true AI share is likely higher.`
            );
        }
    }

    const ai = cohort(aiCommits);
    const other = cohort(otherCommits);
    if (ai.matureCommits < MIN_SAMPLE || other.matureCommits < MIN_SAMPLE) {
        caveats.push(
            `Survival and follow-up rates need at least ${MIN_SAMPLE} commits older than ${opts.minAgeDays} days in each group; groups below that show "not enough data".`
        );
    }
    if (survival.filesSkipped > 0) {
        caveats.push(`Blame was capped: ${survival.filesSkipped} rarely-touched file(s) were not blamed and are excluded from survival.`);
    }
    if (!aiCommits.length) {
        caveats.push('No commit in this window carries AI attribution. If you use AI tools, check that their co-author trailers are enabled, or turn on agent session evidence.');
    }

    return {
        repoName: path.basename(root),
        root,
        generatedAt: now,
        windowDays: opts.windowDays,
        minAgeDays: opts.minAgeDays,
        totals: {
            commits: commits.length,
            linesAdded: commits.reduce((s, c) => s + c.added, 0),
            aiCommits: aiCommits.length,
            aiLinesAdded: ai.linesAdded,
        },
        ai,
        other,
        byTool: [...toolMap.values()].sort((a, b) => b.commits - a.commits),
        weekly: [...weeks.values()],
        agent,
        recentAiCommits: aiCommits.slice(0, 15).map((c) => ({
            sha: c.sha,
            date: c.date,
            subject: c.subject,
            tool: c.attribution!.tool,
            signal: c.attribution!.signal,
            evidence: c.attribution!.evidence,
            added: c.added,
            survival: survivalOf(c),
            tooRecent: now - c.date < opts.minAgeDays * DAY,
        })),
        blame: { filesSkipped: survival.filesSkipped },
        caveats,
    };
}
