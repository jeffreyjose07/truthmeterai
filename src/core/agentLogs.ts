import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

/**
 * Agent session evidence: coding agents that run locally keep session transcripts on
 * disk. Those transcripts record exactly which files the agent edited and when, which
 * is ground truth that git trailers can miss (trailers can be turned off or squashed away).
 *
 * Privacy: only file paths and timestamps are extracted, only for paths inside the
 * repository being analysed, and nothing leaves the machine. Opt-in via settings.
 */

export interface AgentEdit {
    tool: string;
    /** Absolute path of the edited file. */
    file: string;
    /** ms since epoch. */
    time: number;
    session: string;
}

export interface AgentLogSource {
    tool: string;
    dir: string;
}

export function defaultSources(home: string = os.homedir()): AgentLogSource[] {
    const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
    const codexDir = process.env.CODEX_HOME || path.join(home, '.codex');
    return [
        { tool: 'Claude Code', dir: path.join(claudeDir, 'projects') },
        { tool: 'OpenAI Codex', dir: path.join(codexDir, 'sessions') },
    ];
}

const CLAUDE_EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

/** Parses one Claude Code transcript line; returns edited file paths (absolute) with timestamp. */
export function parseClaudeLine(line: string): { files: string[]; time: number; session?: string } | undefined {
    // Cheap prefilter: most lines are not edit tool calls.
    if (!line.includes('"tool_use"')) { return undefined; }
    let d: any;
    try { d = JSON.parse(line); } catch { return undefined; }
    const content = d?.message?.content;
    if (!Array.isArray(content)) { return undefined; }
    const files: string[] = [];
    for (const b of content) {
        if (b?.type === 'tool_use' && CLAUDE_EDIT_TOOLS.has(b.name)) {
            const p = b.input?.file_path ?? b.input?.notebook_path;
            if (typeof p === 'string') { files.push(p); }
        }
    }
    const time = Date.parse(d.timestamp);
    if (!files.length || Number.isNaN(time)) { return undefined; }
    return { files, time, session: d.sessionId };
}

const PATCH_FILE_RE = /\*\*\* (?:Add|Update|Delete) File: ([^\n\\"]+)/g;

/**
 * Parses one Codex transcript line. Codex edits files through `apply_patch`, whose
 * payload contains "*** Update File: <path>" headers. Paths may be relative to the
 * session's working directory, which is recorded in the session_meta / turn_context lines.
 */
export function parseCodexLine(line: string, state: { cwd?: string }): { files: string[]; time: number } | undefined {
    const cwdMatch = line.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (cwdMatch) {
        try { state.cwd = JSON.parse(`"${cwdMatch[1]}"`); } catch { /* keep previous */ }
    }
    if (!line.includes('*** ')) { return undefined; }
    const files: string[] = [];
    for (const m of line.matchAll(PATCH_FILE_RE)) {
        const p = m[1].trim();
        files.push(path.isAbsolute(p) || !state.cwd ? p : path.join(state.cwd, p));
    }
    const ts = line.match(/"timestamp"\s*:\s*"([^"]+)"/);
    const time = ts ? Date.parse(ts[1]) : NaN;
    if (!files.length || Number.isNaN(time)) { return undefined; }
    return { files, time };
}

async function* walkJsonl(dir: string, sinceMs: number, depth = 0): AsyncGenerator<string> {
    if (depth > 5) { return; }
    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            yield* walkJsonl(full, sinceMs, depth + 1);
        } else if (e.isFile() && e.name.endsWith('.jsonl')) {
            try {
                // A transcript untouched since the window start can't contain edits inside it.
                if ((await fs.promises.stat(full)).mtimeMs >= sinceMs) { yield full; }
            } catch { /* vanished */ }
        }
    }
}

function isInside(file: string, root: string): boolean {
    const rel = path.relative(root, file);
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Scans agent transcripts for edits to files inside `repoRoot` since `sinceMs`. */
export async function scanAgentEdits(
    repoRoot: string,
    sinceMs: number,
    sources: AgentLogSource[] = defaultSources()
): Promise<AgentEdit[]> {
    const root = await fs.promises.realpath(repoRoot).catch(() => repoRoot);
    const edits: AgentEdit[] = [];
    for (const src of sources) {
        for await (const file of walkJsonl(src.dir, sinceMs)) {
            const session = path.basename(file, '.jsonl');
            const state: { cwd?: string } = {};
            const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
            for await (const line of rl) {
                const hit = src.tool === 'Claude Code' ? parseClaudeLine(line) : parseCodexLine(line, state);
                if (!hit || hit.time < sinceMs) { continue; }
                for (const f of hit.files) {
                    if (isInside(f, root) || isInside(f, repoRoot)) {
                        edits.push({ tool: src.tool, file: f, time: hit.time, session });
                    }
                }
            }
        }
    }
    return edits;
}
