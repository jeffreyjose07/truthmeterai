import { RepoReport, CohortStats } from './analyze';

export function pct(v: number | null, digits = 0): string {
    return v === null ? 'not enough data' : `${(v * 100).toFixed(digits)}%`;
}

export function share(part: number, whole: number): number | null {
    return whole > 0 ? part / whole : null;
}

export function fmtDate(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

function cohortRow(label: string, c: CohortStats): string {
    return `| ${label} | ${c.commits} | ${c.linesAdded.toLocaleString('en-US')} | ${c.matureCommits} | ${pct(c.survivalRate)} | ${pct(c.followUpFixRate)} | ${c.revertedCommits} |`;
}

/** Renders a report as Markdown, suitable for a PR description, wiki, or retro doc. */
export function toMarkdown(r: RepoReport): string {
    const lines: string[] = [];
    lines.push(`# TruthMeter report: ${r.repoName}`);
    lines.push('');
    lines.push(`Generated ${fmtDate(r.generatedAt)} · last ${r.windowDays} days · survival measured on commits older than ${r.minAgeDays} days`);
    lines.push('');
    lines.push('## Headline');
    lines.push('');
    lines.push(`- **AI-attributed commits:** ${r.totals.aiCommits} of ${r.totals.commits} (${pct(share(r.totals.aiCommits, r.totals.commits))})`);
    lines.push(`- **AI-attributed lines added:** ${r.totals.aiLinesAdded.toLocaleString('en-US')} of ${r.totals.linesAdded.toLocaleString('en-US')} (${pct(share(r.totals.aiLinesAdded, r.totals.linesAdded))})`);
    lines.push(`- **Line survival:** AI ${pct(r.ai.survivalRate)} vs other ${pct(r.other.survivalRate)}`);
    lines.push(`- **Followed by a fix within 72h:** AI ${pct(r.ai.followUpFixRate)} vs other ${pct(r.other.followUpFixRate)}`);
    lines.push('');
    lines.push('## AI-attributed vs other commits');
    lines.push('');
    lines.push('| Group | Commits | Lines added | Mature commits | Line survival | Fix within 72h | Reverted |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|');
    lines.push(cohortRow('AI-attributed', r.ai));
    lines.push(cohortRow('Other', r.other));
    lines.push('');
    if (r.byTool.length) {
        lines.push('## By tool');
        lines.push('');
        lines.push('| Tool | Commits | Lines added | Evidence |');
        lines.push('|---|---:|---:|---|');
        for (const t of r.byTool) {
            const ev = Object.entries(t.signals).filter(([, n]) => n > 0).map(([s, n]) => `${s} ×${n}`).join(', ');
            lines.push(`| ${t.tool}${t.mediumConfidence ? ' (medium confidence)' : ''} | ${t.commits} | ${t.linesAdded.toLocaleString('en-US')} | ${ev} |`);
        }
        lines.push('');
    }
    if (r.agent) {
        lines.push('## Agent session evidence');
        lines.push('');
        if (!r.agent.summaries.length) {
            lines.push('No local agent sessions edited files in this repository during the window.');
        } else {
            for (const s of r.agent.summaries) {
                lines.push(`- **${s.tool}:** ${s.sessions} session(s), ${s.edits} edit(s) across ${s.files} file(s)`);
            }
            lines.push(`- Commits with no AI trailer whose files an agent had just edited: **${r.agent.untrailedAgentCommits}** (${r.agent.untrailedAgentLines.toLocaleString('en-US')} lines)`);
        }
        lines.push('');
    }
    if (r.recentAiCommits.length) {
        lines.push('## Recent AI-attributed commits');
        lines.push('');
        lines.push('| Date | Commit | Tool | Evidence | Lines | Survival |');
        lines.push('|---|---|---|---|---:|---:|');
        for (const c of r.recentAiCommits) {
            const subj = c.subject.replace(/\|/g, '\\|').slice(0, 70);
            lines.push(`| ${fmtDate(c.date)} | \`${c.sha.slice(0, 7)}\` ${subj} | ${c.tool} | ${c.evidence.replace(/\|/g, '\\|')} | ${c.added} | ${c.tooRecent ? 'too recent' : c.survival === null ? 'n/a' : pct(c.survival)} |`);
        }
        lines.push('');
    }
    lines.push('## How to read this');
    lines.push('');
    lines.push('- A commit counts as AI-attributed only if it records it: a co-author trailer, an agent bot as author, or a tool footer. Nothing is guessed from code style or typing speed.');
    lines.push('- *Line survival* is the share of lines a commit added that `git blame` still attributes to it at HEAD.');
    lines.push('- *Fix within 72h* means a later commit touching the same files had a fix/revert-style subject.');
    lines.push('- These are correlations in your own history, not causal proof. AI commits may differ in kind (tests, scaffolding) from other commits.');
    if (r.caveats.length) {
        lines.push('');
        lines.push('### Caveats for this report');
        lines.push('');
        for (const c of r.caveats) { lines.push(`- ${c}`); }
    }
    lines.push('');
    return lines.join('\n');
}
