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
