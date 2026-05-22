---
name: review-security
description: Audit the whole Digital Cookbook project for sensitive-data leaks that .gitignore alone won't catch — hardcoded secrets in source, secrets in git history, gitignore coverage gaps, accidental client-bundle exposure, and public-surface leakage (PR bodies, README, issues). Use whenever the user says "security review", "scan for leaks", "any secrets in the repo", "audit credentials", "check for sensitive data", "did I leak anything", or otherwise asks for a project-wide credential/secrets audit. Distinct from the built-in `security-review` skill which only covers pending changes on the current branch — this one is whole-project, all-time, all-surfaces.
---

# Review security

`.gitignore` blocks files from being added. It does not catch:

- Secrets hardcoded *inside* source files that get committed legitimately (e.g., an admin password literal inside `seed-test-accounts.js`).
- Secrets that *were* committed, then "removed" by a later commit — git history still has them, and a public repo means anyone can `git log -p` them out.
- Secrets accidentally inlined into the browser bundle by Vite's `VITE_*` env-var convention.
- Secrets pasted into PR bodies, issue comments, README, or other GitHub-public surfaces.
- New file types the project starts using that the existing `.gitignore` rules don't anticipate (`.pem`, `.key`, `*.sqlite` backups, etc.).

This skill runs a layered scan covering each of those, then produces a single prioritized report. The user fixes; the skill flags.

## What to do

Run the checks below in parallel where possible. Treat each as a separate finding section in the final report — don't merge them.

### 1. Tracked secret-shaped files

Files that should never be committed, but might have slipped past `.gitignore`:

```bash
git ls-files | grep -iE '(\.env($|\.|/)|credentials|\.pem$|\.key$|id_rsa|\.pfx$|secrets?\.(json|ya?ml|txt)|\.sqlite$)'
```

Anything that comes back is an immediate **high-severity** finding. Cross-check against `.gitignore` — if the file matches an ignore rule but is still tracked, it was added before the ignore was put in place (`git rm --cached` is the remediation).

### 2. Hardcoded secrets in source

Grep tracked source files for value-shaped patterns (not just variable *names*):

```bash
# JWT-shaped strings (Supabase service-role key, GitHub tokens, etc.)
git ls-files | xargs grep -lE 'eyJ[A-Za-z0-9_-]{20,}\.eyJ' 2>/dev/null

# Hardcoded password assignments — value, not name
git ls-files | xargs grep -nE "(password|passwd|pwd)\s*[:=]\s*['\"][^'\"]{4,}" 2>/dev/null | grep -viE '(example|placeholder|your[-_]|<.*>|process\.env|import\.meta\.env)'

# Provider-prefix API key shapes
git ls-files | xargs grep -nE 'sk_(live|test)_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36}' 2>/dev/null
```

Then check the **known-admin email** specifically — this project's Stage 7 work introduced `admin@example.com` as the seed admin, and recent commits redacted it from source. Confirm the redaction is complete in `HEAD`:

```bash
git ls-files | xargs grep -nE 'admin@[a-z0-9.-]+\.(com|org|net|io|app)' 2>/dev/null | grep -v '\.md:'
```

Hits in `.md` are usually docs (`refs/TESTING.md` references the seed account by purpose). Hits in `.js`/`.jsx`/`.sql` are likely real findings.

### 3. Git history scan (secrets that were committed then removed)

Because the repo is public on GitHub, removed-then-recommitted secrets are still discoverable via history. Scan the log:

```bash
# JWT in history
git log --all -p -S 'eyJhbGciOi' --oneline | head -50

# The redacted admin password literal — replace with whatever real value the user is worried about
# (Don't write the literal into this skill. Ask the user once if they want a history scan against a specific known-leaked value.)
git log --all --oneline --all -S '<value-the-user-confirms>' | head -20
```

For this project specifically, two commits worth scrutinizing — they're already in the public history:

- `ea174c7 Redact admin credentials from source`
- `b233839 Extend redaction to test-account credentials`

The redaction commits are public; the parent commits contain whatever was redacted. If the user is concerned, the remediation is **rotate the credential**, not "redact harder" — once it's in public git history, it's compromised.

State this plainly in the report. Don't recommend `git filter-branch` / `git filter-repo` unless the user explicitly asks; rewriting public history is high-blast-radius and rarely the right move for credentials that should just be rotated.

### 4. `.gitignore` coverage check

Compare the current `.gitignore` against a known-dangerous baseline. Flag any of these patterns that are *missing*:

| Pattern | Why |
|---|---|
| `.env` / `.env.local` / `.env.*.local` | Vite env files |
| `credentials.env` / `credentials.*` | This project's specific convention |
| `*.pem` / `*.key` / `*.pfx` | Private keys |
| `id_rsa*` | SSH keys |
| `.DS_Store` / `Thumbs.db` | Not security-critical but worth noting |
| `*.sqlite` / `*.sqlite3` / `*.db` | Local DB dumps |
| `.context/` | This project's scratch directory |
| `coverage/` / `dist/` | Build/test output (could contain inlined env values) |

Most of these are already present in the project's `.gitignore` (re-read it to check rather than assuming).

### 5. Client-bundle exposure (Vite-specific)

Vite **inlines every `import.meta.env.VITE_*` variable into the production bundle** — they're public by design. The risk is two-shaped:

- **Non-secrets misnamed as `VITE_*`**: nothing to do.
- **Secrets accidentally prefixed `VITE_*`**: high-severity. Anything that should be server-only must NOT be `VITE_*`.

Check usage:

```bash
grep -rnE 'import\.meta\.env\.VITE_[A-Z_]+' src/
```

For each `VITE_*` var referenced in `src/`, confirm it's intended-public:

- `VITE_SUPABASE_URL` — public, fine (it's a URL).
- `VITE_SUPABASE_ANON_KEY` — public by Supabase design (RLS protects the data).
- Anything else — investigate.

Then check `.env.local` (if accessible) and the Vercel env config (out of scope for this skill, but flag it for the user to verify in the Vercel dashboard).

### 6. Public-surface leakage

Things that show up on GitHub even though they're not in tracked source:

```bash
# PR bodies via gh CLI
gh pr list --state all --json number,title,body --limit 50 | grep -iE '(password|secret|eyJ|api[_-]?key)' 

# Issues
gh issue list --state all --json number,title,body --limit 50 | grep -iE '(password|secret|eyJ|api[_-]?key)'

# README / public-visible markdown
git ls-files '*.md' | xargs grep -nE '(password|secret|eyJ[A-Za-z0-9])' 2>/dev/null | grep -viE '(example|placeholder|<.*>|`\\$\\{)'
```

Vercel deployment env vars are stored in the Vercel dashboard, NOT in the repo — they're not publicly visible, but flag for the user that the Vercel project's environment variables are a separate surface to audit manually.

## Output shape

Surface findings in **severity order** — the user should be able to triage the report by reading top-down and stopping when they hit "low" / "advisory".

```
**Security review — <date>**

**HIGH — rotate immediately**
- <finding 1: what, where, why high>
- <finding 2>
(or "None found.")

**MEDIUM — fix before next push**
- <finding>
(or "None found.")

**LOW / advisory**
- <finding>

**Scope notes**
- Scanned: tracked source, git history (last N commits), .gitignore coverage, src/ for VITE_* refs, last 50 PRs/issues.
- NOT scanned: Vercel dashboard env config (manual), Supabase dashboard config (manual), browser extension storage, the user's local `.env.local` (gitignored — but worth a manual eyeball for leaked values in past dev tool screenshots).

**Recommended actions, in order:**
1. <action — usually rotate-and-re-add for any high finding>
2. <action>
```

End the report by explicitly stating what was *not* checked, so the user knows where the audit ends.

## What NOT to do

- **Don't auto-rotate credentials.** This skill flags; the user rotates via Supabase / GitHub / wherever the credential lives. Rotation is high-blast-radius and needs the user's hands.
- **Don't recommend rewriting git history as the first fix for a public-repo leak.** If a secret was ever pushed to a public GitHub repo, treat it as compromised regardless of history rewrites — assume someone scraped it. Rotation is the only real fix; history rewrite is theater.
- **Don't paste high-entropy strings into the report.** If you find a JWT in source, reference its location (`scripts/foo.js:12`) rather than copying the value into your output — the report itself becomes a leak otherwise.
- **Don't grep for the user's actual admin password unless they explicitly hand you the value.** Searching for known leaked values is the most powerful check, but doing it requires the user to confirm the value once. Don't guess from `refs/TESTING.md` or seed scripts (those may have been redacted to a placeholder).
- **Don't run `git filter-repo` or `git filter-branch`.** Those rewrite history and require coordinated force-pushes — not something to do unannounced.
- **Don't treat `VITE_SUPABASE_ANON_KEY` as a leak.** It's public by Supabase's design; RLS policies in [refs/DATABASE_DECISIONS.md](../../../refs/DATABASE_DECISIONS.md) are the security boundary. Flagging it as high-severity would erode trust in the rest of the report.
- **Don't include a finding without a location.** "Possible password in source" is useless; "Possible password literal at `scripts/seed-test-accounts.js:42`" is actionable.
