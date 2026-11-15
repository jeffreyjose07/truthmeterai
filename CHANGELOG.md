# Changelog

## 2.0.1 — 2026-11-15

- Releases are now published to the VS Code Marketplace through trusted publishing (GitHub
  OIDC) instead of a stored access token. No changes to the extension itself.

## 2.0.0 — 2026-11-15

A ground-up rewrite. Version 1.x guessed which code was AI-written from typing speed and regular
expressions. Those heuristics matched almost any ordinary code (an `import` line, `items.map(`,
any three lines of text), so its percentages and ROI figures were not meaningful. 2.0 only
counts what can be verified.

### New
- **Git attribution.** Commits count as AI-attributed when they record it: `Co-authored-by`
  trailers (Claude Code, Copilot, Cursor, Codex, Gemini, Aider, Devin, Windsurf, Amazon Q/Kiro),
  agent bot authors (`copilot-swe-agent[bot]`, `google-labs-jules[bot]`, …), or tool footers
  such as “Generated with Claude Code”. Custom rules supported.
- **Line survival.** `git blame` at HEAD shows how much AI-attributed code is still there after
  14+ days, compared with your other commits.
- **Fix within 72h.** Share of commits followed by a fix or revert touching the same files.
- **Agent session evidence (opt-in).** Reads local Claude Code and Codex session logs (paths and
  timestamps only) to find AI-edited commits that lack a trailer.
- **Small-sample guard.** Rates are hidden until each group has at least 5 mature commits.
- **Markdown export** of the full report.
- Copilot trailers are flagged as medium confidence, because VS Code can add them automatically.

### Removed
- Keystroke and regex “AI detection”, the no-op inline completion provider that ran on every
  keystroke, dollar ROI estimates, burnout warnings, and the license manager stub.
- Runtime dependencies (Chart.js, date-fns, lodash, simple-git). The extension now has none.

### Changed
- Settings and commands moved from `aiMetrics.*` to `truthmeter.*`.
- Built with esbuild, TypeScript 5.9 and ESLint flat config. Tested end-to-end in VS Code 1.90
  and the latest stable release.
- Publishing moves to Marketplace trusted publishing (OIDC). Personal access tokens stop working
  for the Marketplace on 2026-12-01.

## 1.1.6 and earlier

See the git history. These versions used heuristic detection that 2.0 replaces.
