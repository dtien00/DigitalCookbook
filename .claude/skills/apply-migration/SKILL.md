---
name: apply-migration
description: Walk the user through applying a pending Supabase migration. Use whenever the user asks to "apply the migration", "run the migration", "what migrations do I need to apply", "did I run NNN yet", or otherwise signals that a `supabase_migration_*.sql` file in `supabase_migrations/` needs to land in the cloud project. Also trigger when a session just authored a new migration file and the user asks "what's next?" — the next step is always the manual dashboard paste-and-run.
---

# Apply migration

This project keeps SQL migration files in `supabase_migrations/` (gitignored — local-only, not shipped). They are applied **manually** through the Supabase Dashboard's SQL Editor, not via the Supabase CLI. Every recent session that touched schema ended with the same instruction shape: "open Dashboard → SQL Editor → paste this file → Run, then re-run `npm run seed:test` if seed data changed, then update `refs/DATABASE_DECISIONS.md` if you introduced a new pattern."

Your job is to identify which migration(s) need applying, hand the user the exact paste-and-run steps, and remind them about the two follow-up actions that are easy to forget.

## What to do

1. **List the local migration files.** `ls supabase_migrations/` (the directory is gitignored, so `git status` won't show new files there). Files follow the convention `supabase_migration_NNN_<slug>.sql` — the number is a strict increment, the slug is short.

2. **Figure out what's pending.** There is no migrations table in this project — the user is the source of truth on what's been applied. Ask if it's not obvious from context:
   - If a session just authored a new file (e.g., the diff shows `supabase_migration_011_*.sql` was just written), that file is the pending one — no question needed.
   - If the user said "apply the migration" with no recent authoring activity, ask which file: "Which migration — `008_admin`, `009_admin_visibility`, `010_admin_trigger_fix`, or all three?"
   - Never assume. Migrations are idempotent by design (use `if not exists`, `create or replace`, `drop policy if exists`) so re-running is safe, but spamming the user with "did you run X?" for every numbered file is noisy.

3. **Hand the user the paste-and-run steps.** Use this exact shape — the user has seen this phrasing many times, matching it saves cognitive load:

   ```
   **Apply `supabase_migration_NNN_<slug>.sql`:**
   1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor** (left sidebar) → **New query**
   2. Paste the contents of `supabase_migrations/supabase_migration_NNN_<slug>.sql`
   3. Click **Run** (or Ctrl+Enter). Migration is idempotent — safe to re-run if you're unsure.
   4. Look for "Success. No rows returned" (or the relevant row count) at the bottom.
   ```

   If multiple files are pending, list them in numeric order — Postgres doesn't care, but the user mentally tracks them in sequence and out-of-order application has burned past sessions.

4. **Flag the two follow-ups.** Don't bury these — they're the things the user forgets:

   - **Seed re-run.** If the migration added a table, column, or trigger that `scripts/seed-test-accounts.js` references (most do — the seed touches profiles, recipes, comments, admin bootstrap), tell the user to run `npm run seed:test` after applying. Skim the seed script if you're not sure.
   - **`refs/DATABASE_DECISIONS.md` update.** If the migration introduces a new *pattern* (a new RLS shape, a new trigger, a new bucket policy, a new constraint approach) — not just "added a column" — it warrants a new section in DATABASE_DECISIONS. This is encoded in the user's [[feedback_keep_living_docs_current]] rule. A purely additive column rarely needs the doc; a new SECURITY DEFINER function or a new policy pattern always does.

5. **Smoke-test pointer.** If the migration touched RLS or admin behavior, remind the user to verify with the relevant test account from `refs/TESTING.md` — anonymous reads, non-author reads, and admin reads are the three RLS axes that get broken by policy changes.

## Output shape

```
**Pending migration(s):** `supabase_migration_NNN_<slug>.sql`<, ... if multiple>

**Apply:**
1. Supabase Dashboard → SQL Editor → New query
2. Paste contents of `supabase_migrations/supabase_migration_NNN_<slug>.sql`
3. Run (Ctrl+Enter). Idempotent.

**After applying:**
- Re-run seed: <`npm run seed:test` — needed because… | not needed, no seed-touched tables>
- DATABASE_DECISIONS update: <which section, why — or "no new pattern, skip">
- Smoke test: <which test account, which scenario — or "no RLS change, skip">
```

If the user asks "did I already run it?", answer honestly that the project doesn't track applied migrations and offer to walk them through running it again (safe, idempotent) rather than guessing.

## What NOT to do

- **Don't try to apply the migration yourself.** There's no Supabase CLI configured in this project — `supabase db push` will not work. The Dashboard SQL Editor is the only path. Don't write a Node script to execute the SQL via the JS client either; the anon key doesn't have DDL permissions and the service-role key isn't in the repo by design.
- **Don't read the full SQL file into context unless asked.** The user is pasting the file into the Dashboard, not reading it through you. Reading it costs tokens and almost never changes the advice.
- **Don't assume a file has been applied just because it's numbered low.** Migrations 002 and 003 are old, but if the user is on a fresh Supabase project they'd all be unapplied. When in doubt, ask.
- **Don't skip the seed and DATABASE_DECISIONS reminders just because the user didn't ask.** These are the items that recur in every session. Surfacing them is the whole point of the skill.
- **Don't update DATABASE_DECISIONS yourself in this skill.** Surface that it needs updating; the actual edit belongs in the broader stage-wrap flow or as an explicit user-requested edit. Mixing "apply the migration" with "edit the living doc" makes the skill too sprawling.
