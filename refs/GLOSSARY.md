# Glossary

Terms that came up in planning, proposals, or diffs for this project — explained in the
sense they were used here, grounded in where they actually appear in the codebase or the
`refs/` docs. This is a learning record, not a spec: each entry is a lesson meant to make
the concept stick the next time it shows up.

Entries are added on request (via the `explain-term` skill). Newest at the bottom.

---

## Kill criterion

**One-liner:** A commitment made *in advance* that says "if we haven't hit measurable
outcome X by deadline Y, we stop pouring effort into this" — a pre-set trigger for quitting,
written down while you're clear-headed rather than decided later when you're invested.

**What it is.** Exists to defeat the **sunk-cost fallacy** — the bias that treats past,
unrecoverable investment as a reason to keep going ("I've come too far to stop"). A kill
criterion moves the "should I quit?" decision to *before* you're attached, with three parts:
a non-vanity **metric** you can actually measure, a **threshold** it must clear, and a
**deadline** (without a time bound, "not succeeded yet" stretches forever). When the deadline
arrives below threshold, it fires — and because you pre-agreed, you're not re-litigating with
a year of emotion on the scale. It's the disciplined twin of a **milestone**: a milestone
names the good outcome and what it unlocks; a kill criterion names the outcome that means you
were wrong and what you'll do about it.

**Where it came up here.** [refs/MONETIZATION.md:423](./MONETIZATION.md#L423) —
> "Kill criteria are as useful as milestones: if 12 months of genuine distribution effort
> doesn't reach M1, the correct conclusion is that this remains a portfolio piece with a tip
> jar."

The specific instance: *if 12 months of real distribution effort doesn't get the app to
~1,000 monthly sessions (milestone M1), conclude it's a portfolio piece with a tip jar, not a
business.* "Kill" here means *stop investing in monetization*, not *delete the project* — the
engineering wiring keeps its résumé value regardless.

**Its softer sibling, the decision-gate, is already a project pattern:**
- [refs/INSTACART.md:245](./INSTACART.md#L245) — *"Decision gate: proceed only if attribution
  + terms are acceptable."*
- [refs/ROADMAP.md:370](./ROADMAP.md#L370) — Stage N+2b parks the affiliate wire-in behind
  *"do we have ≥1000 monthly active shoppers?"*

The difference is direction and finality. Decision-gates are **go/no-go checkpoints**
("don't proceed *until* X"). A kill criterion is a **stop-loss** ("abandon *if not* X *by*
deadline Y"). The roadmap gate says "wait for 1k shoppers"; the kill criterion adds the
missing time bound and exit: "and if 1k never arrives within a year, stop trying."

**Enforceable shape** (planning-doc content, not code):

```markdown
### Kill criterion — monetization effort
Metric:     Monthly sessions (per the analytics we install first)
Threshold:  1,000 / month  (milestone M1)
Deadline:   12 months after analytics + distribution effort begin (start: ____)
If not met: Stop investing in revenue features. Keep the shipped affiliate/proxy
            wiring (portfolio value stands). Revert to donations-only.
If met:     Trigger M1 actions — Vercel Pro, Impact enrollment, Journey application.
```

What makes it real vs. decorative: a start date, a metric you've committed to *measuring*,
and a pre-written action for **both** branches. Note the "keep the wiring" clause — a good
kill criterion kills the *effort*, not necessarily the artifact.

**When to reach for it / when not.** Reach for it before sustained effort with uncertain
payoff and no natural end (a solo side project you care about is textbook sunk-cost
conditions). Skip it for cheap or reversible work — a plain decision-gate is lighter when
there's a natural checkpoint and no deadline pressure. Also skip a *revenue-based* kill
criterion for work with intrinsic value: the Instacart integration is worth building for the
résumé story regardless of revenue, so it shouldn't hang on a payout metric.

**Related terms.**
- **Sunk-cost fallacy** — counting past unrecoverable investment as a reason to continue; the
  bias a kill criterion counters.
- **Decision-gate** — a go/no-go checkpoint blocking work until a condition is met; used in
  INSTACART.md / ROADMAP.md. A kill criterion is a decision-gate with a deadline + exit.
- **Stop-loss** — the finance origin: a pre-set price at which you auto-sell to cap losses.
- **Pre-mortem** — imagining the project has already failed and working backward to why; helps
  you *discover* what the kill-criterion metric should be.

**Docs.** Annie Duke, *Quit* (coined the current usage) and *Thinking in Bets* (the
decision-quality foundation) · [Farnam Street — "Kill Criteria"](https://fs.blog/kill-criteria/).

---

## Project memory

**One-liner:** A persistent folder of small Markdown files, stored outside the repo in the
Claude Code profile, loaded into context at the start of every session so facts survive
across conversations that otherwise start from zero.

**What it is.** Every Claude session starts amnesiac — when it ends, its context is gone.
Project memory defeats that for *one* project. It's a plain folder on the machine, keyed to
the repo path so each project is isolated:
`C:\Users\dtien\.claude\projects\E--Professional-Industry-Portfolio-Materials-DigitalCookbook\memory\`.
Inside are two kinds of file. **`MEMORY.md`** is the *index* — one line per memory, a link
plus a hook — and it's the only file loaded *in full* at session start (it appears in the
opening `<system-reminder>`). Kept tiny on purpose, so it's cheap to always carry. The
**per-fact files** (e.g. `feedback_no_claude_coauthor.md`) are *not* all loaded up front;
they surface on demand when the conversation looks relevant, sometimes appearing mid-session
inside a `<system-reminder>` block — that's a recalled file, not the index.

Each fact-file has YAML frontmatter (`name`, `description`, `metadata.type`) and a body. The
`type` sorts it: `user` (who you are), `feedback` (how to work), `project` (ongoing
work/constraints), `reference` (external pointers). The `description` is what the recall step
matches against to decide relevance, so it's written to be *found*, not to read well. Bodies
cross-link with wiki-style `[[name]]` so recall pulls related facts together into a small
graph. The concept exists to stop you re-teaching the same conventions every session.

**Where it came up here.** From the assistant's own closing offer, after opening PR #86:
> "Want me to save a quick **project memory** noting PR #86 / the `history` branch, or is
> this good to leave here?"

Grounded in ten real files in the memory dir above (repo-external, so no `refs/` link):
- `MEMORY.md` — the index seen in this session's opening reminder.
- `feedback_pr_body_format.md` — why PR #86 used `## Summary` + `## Test plan` unprompted.
- `feedback_no_claude_coauthor.md` — why the commit and PR omit the Claude trailer/footer.
- `project_digital_cookbook.md` — why the stack and living-docs set were known before reading
  any code.

Distinct from the *in-repo* living docs (`refs/ROADMAP.md`, `refs/COSMETICS.md`, this
glossary): those are versioned, shared with anyone who clones, and describe the **product**.
The `memory/` folder is private, unversioned, and describes **how you and I work together**.
`feedback_keep_living_docs_current` is a memory whose whole job is to point *at* the in-repo
docs — memory about docs.

**When to reach for it / when not.** Save a fact when it's durable and cross-session — a
standing preference, a non-obvious constraint (`supabase_migration/` is gitignored, needs
`git add -f`), or who you are. The test: *would I otherwise re-learn this next week?* Skip it
when the fact already lives in the repo — git and `refs/` already record the Recipe History
branch, diff, and commit, so a memory restating "it uses sessionStorage" would only rot. Skip
it when the fact matters only to the current conversation — that's working context, not
memory. This is why the assistant's save-offer was genuinely optional: most of the session is
self-documenting.

**Related terms.**
- **`CLAUDE.md`** — the other persistent channel, but *always* loaded in full and usually
  checked into the repo (or `~/.claude/`); best for stable instructions vs. memory's
  accumulating facts.
- **Context window** — the finite text visible at once; memory exists because the window
  resets each session and can't hold everything.
- **Retrieval / recall** — the on-demand step that surfaces relevant memory files by their
  `description`; the same idea as RAG, scoped to these notes.
- **Living docs** — the in-repo `refs/*.md`; the versioned, shareable cousin of memory,
  describing the product rather than the working relationship.

**Docs.** [Claude Code — Memory](https://docs.claude.com/en/docs/claude-code/memory).

---

## GIN index

**One-liner:** A GIN (Generalized Inverted Index) is a Postgres index that maps each
*element inside* a composite value — an array's items, a JSON document's keys, a text
document's words — back to the rows that contain it, so "which rows contain X?" is a lookup
instead of a full scan.

**What it is.** The default index (a **B-tree**) sorts *whole* values end-to-end — perfect
for `WHERE servings = 4` or `ORDER BY created_at`, where the entire cell is the thing you
compare. It's useless the moment the value is a *container* and the question is about its
contents: `WHERE tags @> ARRAY['vegan']` ("does this array contain 'vegan'?") gives a B-tree
nothing to seek, because `['vegan','quick']` and `['vegan','asian']` sort to unrelated places.
Postgres falls back to a **sequential scan** — read every row, check each array. Fine at 50
recipes; linearly worse as the corpus grows.

GIN inverts the relationship: instead of "row → its whole array", it stores "element → the
rows containing it" — the same *inverted index* structure that powers search engines. It's
two-level: an entry tree of the distinct elements (`asian`, `quick`, `vegan`, …), and under
each element a compressed **posting list** of row locations (TIDs). `tags @> ARRAY['vegan']`
becomes: seek to `vegan`, read its posting list, done. Multi-element queries
(`tags && ARRAY['vegan','quick']`) union or intersect posting lists — still never touching a
non-matching row.

Three deeper mechanics worth owning:

- **Lossy recheck.** GIN produces a *candidate* set (internally a bitmap), then Postgres
  re-runs the operator on each candidate heap tuple to confirm — the **`Recheck Cond`** line
  in `EXPLAIN`. So GIN narrows; it doesn't give the final answer by itself. Consequence: GIN
  can't do **index-only scans** (it doesn't store whole rows) and can't satisfy `ORDER BY`
  (posting lists aren't value-sorted) — those stay B-tree jobs.
- **Deferred writes (the pending list).** Updating a GIN index on insert is expensive — one
  row touches one entry per array element. With `fastupdate` on (the default), new entries go
  to an unsorted **pending list** first and get merged into the main tree in bulk later (at
  `gin_pending_list_limit` or by autovacuum). This is *why* GIN writes are cheaper than they'd
  otherwise be — and why a huge batch insert can briefly leave the pending list doing linear
  scans until the merge catches up. For an occasional-recipe-save app, irrelevant; good to know
  it exists.
- **Operator classes** decide *what* gets indexed. `USING GIN (tags)` on a `TEXT[]` uses
  `array_ops` (serves `@>`, `<@`, `&&`). On `jsonb` you'd choose `jsonb_ops` (indexes keys and
  values, supports `?`) vs. the smaller/faster `jsonb_path_ops` (only `@>`). You pick the
  opclass to match the operators your queries actually use.

**Where it came up here.** From the Stage N kickoff, flagging the migration-025 schema:
> "Array columns follow the migration-002 tags pattern exactly — `TEXT[] NOT NULL DEFAULT
> '{}'` + a GIN index (B-tree is useless for `&&`/`<@` array-membership)."

Already live on the `tags` column since Stage 1:
- `supabase_migration/supabase_migration_002_tags.sql:14` — `CREATE INDEX ... ON
  public.recipes USING GIN (tags);` *(the migration dir is gitignored — see
  [[project_migrations_gitignored_force_add]] — so this path won't resolve on GitHub; the
  decision is mirrored in the versioned doc below.)*
- [refs/DATABASE_DECISIONS.md:122](./DATABASE_DECISIONS.md#L122) and
  [:127](./DATABASE_DECISIONS.md#L127) — the "`TEXT[]` + GIN, not a join table" decision and
  the "GIN, not B-tree" rationale, verbatim.

Next use: **migration 025** (Stage N) adds the identical shape to `recipes.allergens` and
`recipes.dietary` — [refs/ROADMAP.md:331](./ROADMAP.md#L331) — because the filter query is the
same operator family (`&&` to exclude on overlap, `@>`/`<@` to require dietary tags).

**Hands-on demo** *(runnable in the Supabase SQL Editor — I'm not executing it against the
cloud DB from here).* Prove the index earns its keep on the live `tags` column:

```sql
EXPLAIN ANALYZE
SELECT id FROM recipes WHERE tags @> ARRAY['vegan'];
```

Honest caveat: on a small table the planner may *still* pick a **Seq Scan** — reading a few
pages is cheaper than an index detour, and the planner knows it. To see the GIN path forced:

```sql
SET enable_seqscan = off;
EXPLAIN ANALYZE
SELECT id FROM recipes WHERE tags @> ARRAY['vegan'];
RESET enable_seqscan;
```

You'll see `Bitmap Index Scan on idx_recipes_tags` → `Bitmap Heap Scan` with a **`Recheck
Cond`** line (the lossy-recheck step above), versus the `Seq Scan` + `Filter` plan without the
index. The dramatic gap only appears once the row count is large enough that "read every row"
actually hurts — which is the whole point of adding the index *before* you're that big.

**When to reach for it / when not.** Reach for it when the column is a *container* and you
query its contents: array membership (`tags`, `allergens`, `dietary`), `jsonb` key/value
lookups, or full-text `tsvector` search (the flagged upgrade path for ingredient search in
[refs/DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md#L296) once substring matching stops
scaling). Skip it for scalar equality/range/ordering (`servings`, `created_at`, `username`) —
that's B-tree territory, where GIN is bigger, can't order, and can't do index-only scans.
Skip it on a write-heavy array column whose reads don't matter — you'd pay the write cost for
nothing. **Allergens + dietary specifically:** two *separate* single-column GIN indexes, not
one multicolumn GIN — the filters fire independently (exclude-allergens vs. require-dietary),
and a multicolumn GIN is just per-column entries sharing a structure anyway, with no
cross-column benefit here. At this project's scale a seq scan would honestly be fine today;
the index is consistency with `tags` plus cheap forward-compat.

**Related terms.**
- **B-tree index** — the default; sorts whole values, great for equality/range/`ORDER BY`,
  blind to what's *inside* a value.
- **Inverted index** — the general CS structure GIN implements (term → documents containing
  it); the backbone of search engines.
- **`tsvector` / full-text search** — Postgres's tokenized-document type, GIN-indexed; the
  flagged upgrade for ingredient search.
- **GiST index** — the other extensible index type; lower write cost, lossy/approximate reads,
  for geometric and range types. The "other specialized index" named beside GIN.
- **Sequential scan** — the read-every-row fallback when no useful index exists; what GIN
  spares you on containment queries.

**Docs.** [PostgreSQL — GIN indexes](https://www.postgresql.org/docs/current/gin-intro.html) ·
[Arrays: indexing & searching](https://www.postgresql.org/docs/current/arrays.html#ARRAYS-SEARCHING)
· [Index types overview](https://www.postgresql.org/docs/current/indexes-types.html).
