/**
 * Commit attribution: decides whether a commit carries *verifiable* evidence that an
 * AI tool was involved, and which tool. Nothing here guesses from code style or typing
 * speed — only from what the commit itself records.
 */

export type Signal = 'trailer' | 'agent-author' | 'message';
export type Confidence = 'high' | 'medium';

export interface Attribution {
    tool: string;
    signal: Signal;
    confidence: Confidence;
    /** The exact text that matched, for display as evidence. */
    evidence: string;
}

export interface CommitIdentity {
    authorName: string;
    authorEmail: string;
    committerName: string;
    committerEmail: string;
    message: string;
}

export interface CustomRule {
    tool: string;
    /** Regular expression tested against author, committer and full message. */
    pattern: string;
}

interface ToolRule {
    tool: string;
    /** Matches the name/email inside a Co-authored-by trailer. */
    coauthor?: RegExp;
    /** Matches the author or committer identity ("Name <email>") of an agent bot. */
    author?: RegExp;
    /** Matches a line in the message body. */
    message?: RegExp;
    confidence?: Confidence;
}

/**
 * Known tool fingerprints. Copilot is medium confidence: VS Code's
 * `git.addAICoAuthor` setting can stamp the trailer even when Copilot wrote nothing.
 */
const RULES: ToolRule[] = [
    {
        tool: 'Claude Code',
        coauthor: /@anthropic\.com|^claude (opus|sonnet|haiku|code)\b/i,
        author: /claude\[bot\]/i,
        message: /generated with \[?claude code\]?/i,
    },
    {
        tool: 'GitHub Copilot',
        coauthor: /copilot/i,
        author: /copilot-swe-agent\[bot\]|^copilot </i,
        confidence: 'medium',
    },
    {
        tool: 'Cursor',
        coauthor: /cursor ?agent|@cursor\.(com|sh)/i,
        author: /cursor ?agent|cursor\[bot\]|@cursor\.(com|sh)/i,
        message: /generated (with|by) cursor/i,
    },
    {
        tool: 'OpenAI Codex',
        coauthor: /\bcodex\b|@openai\.com/i,
        author: /chatgpt-codex-connector\[bot\]|codex\[bot\]/i,
        message: /generated (with|by) (openai )?codex/i,
    },
    {
        tool: 'Gemini / Jules',
        coauthor: /\bgemini\b|google-labs-jules/i,
        author: /google-labs-jules\[bot\]|gemini-code-assist\[bot\]/i,
        message: /generated (with|by) gemini/i,
    },
    {
        tool: 'Aider',
        coauthor: /aider\.chat|^aider\b/i,
        message: /^aider: /im,
    },
    {
        tool: 'Devin',
        coauthor: /devin-ai-integration|@cognition(-labs)?\.(ai|com)/i,
        author: /devin-ai-integration\[bot\]/i,
    },
    {
        tool: 'Windsurf',
        coauthor: /windsurf|codeium/i,
        message: /generated (with|by) (windsurf|cascade)/i,
    },
    {
        tool: 'Amazon Q / Kiro',
        coauthor: /amazon q|\bkiro\b/i,
        author: /amazon-q-developer\[bot\]/i,
    },
];

const COAUTHOR_RE = /^co-authored-by:\s*(.+)$/gim;

/** Extracts all Co-authored-by trailer values from a commit message. */
export function coAuthors(message: string): string[] {
    const out: string[] = [];
    for (const m of message.matchAll(COAUTHOR_RE)) {
        out.push(m[1].trim());
    }
    return out;
}

/**
 * Returns the attribution for a commit, or undefined if there is no recorded evidence of
 * AI involvement. Custom rules are checked first so users can override built-ins.
 */
export function classifyCommit(c: CommitIdentity, customRules: CustomRule[] = []): Attribution | undefined {
    const author = `${c.authorName} <${c.authorEmail}>`;
    const committer = `${c.committerName} <${c.committerEmail}>`;

    for (const rule of customRules) {
        let re: RegExp;
        try {
            re = new RegExp(rule.pattern, 'im');
        } catch {
            continue; // invalid user regex: ignore rather than crash
        }
        for (const hay of [author, committer, c.message]) {
            const m = hay.match(re);
            if (m) {
                return { tool: rule.tool, signal: 'message', confidence: 'high', evidence: m[0] };
            }
        }
    }

    // 1. Agent bot as author/committer: the strongest signal.
    for (const rule of RULES) {
        if (!rule.author) { continue; }
        for (const id of [author, committer]) {
            if (rule.author.test(id)) {
                return { tool: rule.tool, signal: 'agent-author', confidence: rule.confidence ?? 'high', evidence: id };
            }
        }
    }

    // 2. Co-authored-by trailers.
    const trailers = coAuthors(c.message);
    for (const rule of RULES) {
        if (!rule.coauthor) { continue; }
        const hit = trailers.find((t) => rule.coauthor!.test(t));
        if (hit) {
            return { tool: rule.tool, signal: 'trailer', confidence: rule.confidence ?? 'high', evidence: `Co-authored-by: ${hit}` };
        }
    }

    // 3. Tool footers in the message ("Generated with Claude Code", "aider: ...").
    for (const rule of RULES) {
        if (!rule.message) { continue; }
        const m = c.message.match(rule.message);
        if (m) {
            return { tool: rule.tool, signal: 'message', confidence: rule.confidence ?? 'high', evidence: m[0].trim() };
        }
    }

    return undefined;
}

export const KNOWN_TOOLS = RULES.map((r) => r.tool);
