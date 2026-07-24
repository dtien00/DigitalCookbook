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
