import { RepoReport, CohortStats } from './core/analyze';
import { pct, share, fmtDate } from './core/report';

function esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function nonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let n = '';
    for (let i = 0; i < 32; i++) { n += chars[Math.floor(Math.random() * chars.length)]; }
    return n;
}

function stat(label: string, value: string, sub: string): string {
    return `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`;
}

function compare(label: string, ai: number | null, other: number | null, betterHigh: boolean, hint: string): string {
    const bar = (v: number | null, cls: string) =>
        v === null
            ? `<div class="bar-row"><span class="who">${cls === 'ai' ? 'AI' : 'Other'}</span><span class="na">not enough data</span></div>`
            : `<div class="bar-row"><span class="who">${cls === 'ai' ? 'AI' : 'Other'}</span><span class="track"><span class="fill ${cls}" style="width:${Math.max(1, Math.round(v * 100))}%"></span></span><span class="num">${pct(v)}</span></div>`;
    let verdict = '';
    if (ai !== null && other !== null) {
        const diff = (ai - other) * 100;
        if (Math.abs(diff) < 3) {
            verdict = 'About the same';
        } else {
            const good = betterHigh ? diff > 0 : diff < 0;
            verdict = `${Math.abs(diff).toFixed(0)} points ${diff > 0 ? 'higher' : 'lower'} for AI ${good ? '(better)' : '(worse)'}`;
        }
    }
    return `<section class="card"><h3>${esc(label)}</h3><p class="hint">${esc(hint)}</p>${bar(ai, 'ai')}${bar(other, 'other')}${verdict ? `<p class="verdict">${esc(verdict)}</p>` : ''}</section>`;
}

function cohortCells(c: CohortStats): string {
    return `<td>${c.commits}</td><td>${c.linesAdded.toLocaleString('en-US')}</td><td>${c.matureCommits}</td><td>${pct(c.survivalRate)}</td><td>${pct(c.followUpFixRate)}</td><td>${c.revertedCommits}</td>`;
}

function weekly(r: RepoReport): string {
    const max = Math.max(1, ...r.weekly.map((w) => w.aiCommits + w.otherCommits));
    const cols = r.weekly
        .map((w) => {
            const total = w.aiCommits + w.otherCommits;
            const h = Math.round((total / max) * 100);
            const aiH = total ? Math.round((w.aiCommits / total) * 100) : 0;
            return `<div class="wk" title="Week of ${fmtDate(w.weekStart)}: ${w.aiCommits} AI-attributed, ${w.otherCommits} other"><div class="col" style="height:${h}%"><div class="col-ai" style="height:${aiH}%"></div></div></div>`;
        })
        .join('');
    return `<section class="card wide"><h3>Commits per week</h3><p class="hint"><span class="key ai"></span>AI-attributed <span class="key other"></span>other · hover a bar for numbers</p><div class="weeks">${cols}</div></section>`;
}

export interface DashboardState {
    reports: RepoReport[];
    selected: number;
    windowDays: number;
    agentLogsEnabled: boolean;
    error?: string;
    loading?: boolean;
}

export function renderDashboard(state: DashboardState, cspSource: string): string {
    const n = nonce();
    const r = state.reports[state.selected];
    const head = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${n}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>TruthMeter</title>
<style>${CSS}</style></head><body>`;

    const repoPicker = state.reports.length > 1
        ? `<select id="repo">${state.reports.map((x, i) => `<option value="${i}"${i === state.selected ? ' selected' : ''}>${esc(x.repoName)}</option>`).join('')}</select>`
        : '';
    const windowPicker = `<select id="window">${[30, 90, 180, 365].map((d) => `<option value="${d}"${d === state.windowDays ? ' selected' : ''}>Last ${d} days</option>`).join('')}</select>`;
    const toolbar = `<header><div><h1>TruthMeter</h1><p class="tag">What your git history says about AI-written code</p></div>
<div class="tools">${repoPicker}${windowPicker}<button id="refresh">Refresh</button><button id="export" class="secondary">Export report</button></div></header>`;

    let body: string;
    if (state.error) {
        body = `<section class="card wide"><h3>Couldn't analyse this workspace</h3><p>${esc(state.error)}</p></section>`;
    } else if (!r) {
        body = `<section class="card wide"><p>${state.loading ? 'Reading git history…' : 'Open a folder that is a git repository to see metrics.'}</p></section>`;
    } else {
        const aiShare = share(r.totals.aiCommits, r.totals.commits);
        const lineShare = share(r.totals.aiLinesAdded, r.totals.linesAdded);
        const stats = `<div class="stats">
${stat('AI-attributed commits', pct(aiShare), `${r.totals.aiCommits} of ${r.totals.commits} commits`)}
${stat('AI-attributed lines', pct(lineShare), `${r.totals.aiLinesAdded.toLocaleString('en-US')} of ${r.totals.linesAdded.toLocaleString('en-US')} lines added`)}
${stat('AI line survival', pct(r.ai.survivalRate), `other code: ${pct(r.other.survivalRate)}`)}
${stat('AI fixed within 72h', pct(r.ai.followUpFixRate), `other code: ${pct(r.other.followUpFixRate)}`)}
</div>`;
        const compares = `<div class="grid">
${compare('Line survival', r.ai.survivalRate, r.other.survivalRate, true, `Share of added lines still in HEAD (commits older than ${r.minAgeDays} days). Higher means the code stuck.`)}
${compare('Needed a fix within 72h', r.ai.followUpFixRate, r.other.followUpFixRate, false, 'Share of commits followed by a fix/revert touching the same files. Lower is better.')}
</div>`;
        const tools = r.byTool.length
            ? `<section class="card wide"><h3>By tool</h3><table><thead><tr><th>Tool</th><th>Commits</th><th>Lines added</th><th>Evidence</th></tr></thead><tbody>${r.byTool
                .map((t) => `<tr><td>${esc(t.tool)}${t.mediumConfidence ? ' <span class="pill">medium confidence</span>' : ''}</td><td>${t.commits}</td><td>${t.linesAdded.toLocaleString('en-US')}</td><td>${Object.entries(t.signals).filter(([, k]) => k > 0).map(([s, k]) => `${esc(s)} ×${k}`).join(', ')}</td></tr>`)
                .join('')}</tbody></table></section>`
            : '';
        const cohorts = `<section class="card wide"><h3>Side by side</h3><table><thead><tr><th>Group</th><th>Commits</th><th>Lines added</th><th>Mature</th><th>Survival</th><th>Fix ≤72h</th><th>Reverted</th></tr></thead>
<tbody><tr><td>AI-attributed</td>${cohortCells(r.ai)}</tr><tr><td>Other</td>${cohortCells(r.other)}</tr></tbody></table></section>`;
        const agent = r.agent
            ? `<section class="card wide"><h3>Agent session evidence</h3>${r.agent.summaries.length
                ? `<ul>${r.agent.summaries.map((s) => `<li><strong>${esc(s.tool)}</strong>: ${s.sessions} session(s), ${s.edits} edits across ${s.files} files</li>`).join('')}</ul><p><strong>${r.agent.untrailedAgentCommits}</strong> commit(s) carry no AI trailer even though an agent edited their files shortly before (${r.agent.untrailedAgentLines.toLocaleString('en-US')} lines).</p>`
                : '<p>No local Claude Code or Codex sessions edited files in this repository during the window.</p>'}</section>`
            : `<section class="card wide muted"><h3>Agent session evidence is off</h3><p>TruthMeter can also read local Claude Code and Codex session logs (file paths and times only, nothing leaves your machine) to find AI commits that lack a trailer.</p><button id="enableAgent" class="secondary">Turn on agent session evidence</button></section>`;
        const recent = r.recentAiCommits.length
            ? `<section class="card wide"><h3>Recent AI-attributed commits</h3><table><thead><tr><th>Date</th><th>Commit</th><th>Tool</th><th>Evidence</th><th>Lines</th><th>Survival</th></tr></thead><tbody>${r.recentAiCommits
                .map((c) => `<tr><td class="nowrap">${fmtDate(c.date)}</td><td><code>${c.sha.slice(0, 7)}</code> ${esc(c.subject.slice(0, 80))}</td><td>${esc(c.tool)}</td><td class="ev">${esc(c.evidence)}</td><td>${c.added}</td><td>${c.tooRecent ? 'too recent' : c.survival === null ? 'n/a' : pct(c.survival)}</td></tr>`)
                .join('')}</tbody></table></section>`
            : '';
        const caveats = r.caveats.length
            ? `<section class="card wide caveats"><h3>Read before quoting these numbers</h3><ul>${r.caveats.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>`
            : '';
        const method = `<section class="card wide muted"><h3>How this is measured</h3><ul>
<li>A commit is AI-attributed only when it records it: a <code>Co-authored-by</code> trailer, an agent bot as author, or a tool footer such as “Generated with Claude Code”. Nothing is inferred from code style or typing speed.</li>
<li>Survival uses <code>git blame -w</code> at HEAD. Fix-within-72h looks for later fix/revert commits touching the same files.</li>
<li>These are correlations in your own history, not causal proof.</li></ul></section>`;
        body = stats + compares + weekly(r) + tools + cohorts + agent + recent + caveats + method;
    }

    const script = `<script nonce="${n}">
const vscode = acquireVsCodeApi();
const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
on('refresh', 'click', () => vscode.postMessage({ type: 'refresh' }));
on('export', 'click', () => vscode.postMessage({ type: 'export' }));
on('enableAgent', 'click', () => vscode.postMessage({ type: 'enableAgent' }));
on('repo', 'change', (e) => vscode.postMessage({ type: 'selectRepo', index: Number(e.target.value) }));
on('window', 'change', (e) => vscode.postMessage({ type: 'setWindow', days: Number(e.target.value) }));
</script>`;
    return `${head}${toolbar}${state.loading && r ? '<p class="loading">Refreshing…</p>' : ''}${body}${script}</body></html>`;
}

const CSS = `
:root { --ai: var(--vscode-charts-purple, #a371f7); --other: var(--vscode-charts-blue, #3794ff); }
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px 24px 40px; max-width: 1100px; }
header { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; }
h1 { margin: 0; font-size: 1.6em; } .tag { margin: 2px 0 0; opacity: .75; }
.tools { display: flex; gap: 8px; flex-wrap: wrap; }
select, button { font: inherit; padding: 4px 10px; border-radius: 2px; }
select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border, transparent); }
button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; }
button:hover { background: var(--vscode-button-hoverBackground); }
button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 12px; }
.stat, .card { background: var(--vscode-editorWidget-background, rgba(127,127,127,.08)); border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.2)); border-radius: 6px; padding: 12px 14px; }
.label { font-size: .85em; opacity: .8; } .value { font-size: 1.9em; font-weight: 600; margin: 4px 0; } .sub { font-size: .85em; opacity: .7; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; margin-bottom: 12px; }
.card { margin-bottom: 12px; } .card h3 { margin: 0 0 6px; font-size: 1.05em; }
.hint { margin: 0 0 10px; opacity: .75; font-size: .9em; }
.bar-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.who { width: 44px; font-size: .9em; } .num { width: 48px; text-align: right; font-variant-numeric: tabular-nums; }
.track { flex: 1; height: 12px; background: rgba(127,127,127,.18); border-radius: 6px; overflow: hidden; }
.fill { display: block; height: 100%; border-radius: 6px; } .fill.ai { background: var(--ai); } .fill.other { background: var(--other); }
.na { opacity: .6; font-style: italic; font-size: .9em; }
.verdict { margin: 8px 0 0; font-weight: 600; }
.weeks { display: flex; align-items: flex-end; gap: 3px; height: 120px; }
.wk { flex: 1; height: 100%; display: flex; align-items: flex-end; }
.col { width: 100%; background: var(--other); border-radius: 2px 2px 0 0; display: flex; flex-direction: column-reverse; min-height: 1px; overflow: hidden; }
.col-ai { background: var(--ai); width: 100%; }
.key { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin: 0 4px 0 8px; vertical-align: middle; } .key.ai { background: var(--ai); margin-left: 0; } .key.other { background: var(--other); }
table { width: 100%; border-collapse: collapse; font-size: .92em; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.2)); vertical-align: top; }
th { font-weight: 600; opacity: .85; }
td.ev { font-family: var(--vscode-editor-font-family); font-size: .88em; opacity: .85; word-break: break-word; }
.pill { font-size: .78em; padding: 1px 6px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.muted { opacity: .9; } .caveats { border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700); }
.nowrap { white-space: nowrap; }
.loading { opacity: .7; font-style: italic; }
code { font-family: var(--vscode-editor-font-family); }
`;
