# Project Rules — Non-Negotiable

## Push & Version Workflow

**The complete required sequence — no shortcuts, no exceptions:**

1. Make code changes
2. Build Docker image
3. Bump version (`umbrel-app.yml`, `docker-compose.yml`, sidebar label)
4. Commit
5. **Present the confirmation dialog and WAIT:**

> Ready to push v1.X.Y — what would you like to do?
> - **Yes** — build, bump, commit, and push
> - **No** — discard and stay here
> - **Add more changes** — keep working first

6. Push git + Docker **ONLY after explicit "Yes"**

**A hook in `~/.claude/settings.json` will block any `git push`, `docker push`, or version-bump `sed` command if this dialog was skipped.**

## Commit Rules

- Never add `Co-Authored-By` trailers — user does not want Claude on GitHub contributors
- Format: `v1.X.Y: <what changed>` (short, present-tense summary)
- Stage specific files — never `git add -A` or `git add .`

## Shell

- Fish shell only — no bash heredocs, no `VAR=value` assignment syntax
- Use `set VAR value` for variables in fish scripts

## Code Rules

- Node.js 10.24.1 in nomp image: no `fs.rm()` — use `execFile('rm', ['-rf', ...])`
- Inside the INJECT backtick template literal in `patch-website.js`: always `'\\n'` not `'\n'`
- Any function called from an inline `onclick` or outer `<script>` block must be on `window`
- Never use IIFE-local helpers (e.g. `g()`) in HTML `onclick` attributes — use `document.getElementById()` directly
- `entrypoint.sh` log pattern: `> "$LOG_FILE"` to truncate, then `"$@" 2>&1 | tee "$LOG_FILE"` (no `-a`)

## Keeping Rules in Sync

Whenever a new rule is established or confirmed in conversation, immediately update **all three** of these:

1. `CLAUDE.md` (this file) — add it under the relevant section
2. The relevant memory file in `/home/nahin/.claude/projects/-home-nahin/memory/` — `error-log.md` for mistakes, `feedback-*.md` for behavioral rules, `project-zmine.md` for project-specific patterns
3. `MEMORY.md` index if a new memory file was created

Do not wait until end of session. Update immediately when the rule is confirmed.

## Error Log

Before starting any task read `/home/nahin/.claude/projects/-home-nahin/memory/error-log.md`.
Append any new mistake that caused rework.
