---
name: roadmap-review
description: Review refs/ROADMAP.md from a product-viability angle and suggest improvements to stages/items that have NOT shipped yet. Use whenever the user says "review the roadmap", "audit the roadmap", "is the roadmap viable", "what should change in the roadmap", "improve future stages", or otherwise asks for a critical pass over unimplemented work in refs/ROADMAP.md. Distinct from `stage-kickoff` (which picks the next item to ship) — this skill questions whether the unimplemented items are the right items at all.
---

# Roadmap review

The Digital Cookbook roadmap is a living doc — stages 0–14 are shipped artifacts, but stages 15+ and the trailing `Stage N` items are drafts that were written at varying points in the project's life. Some are vague, some are over-ambitious for the audience (solo + small circle), some hide two products inside one line, and some critical product features aren't there at all.

Your job is to do a critical pass on the **unimplemented** parts and propose concrete changes — rewrites, splits, deletions, resequencing, and additions. Treat this as a product-management review, not a code review.

## What to do

1. **Read [refs/ROADMAP.md](../../../refs/ROADMAP.md) end-to-end.** Identify every stage/item that is NOT marked `*(done)*` and does NOT have a `[x]` checkbox. These are your subjects. Ignore shipped stages — don't re-litigate landed decisions.

2. **Also capture explicit carry-forwards.** Some shipped stages have "Carry-forwards" or "Known follow-ups" sections listing deferred work — those count as unimplemented.

3. **For each unimplemented item, judge it on four axes:**
   - **Scope clarity** — is "what we're building" unambiguous, or does the line hide two different products?
   - **Audience fit** — does it match the solo + small-circle scale, or is it pre-scaling for traffic that doesn't exist?
   - **Sequencing** — is it positioned correctly relative to its dependencies and the user's real pain points?
   - **Cost vs. payoff** — does the storage/complexity/partner-agreement cost justify the user-visible value at current scale?

4. **For each item, recommend one of:**
   - **Keep as-is** — it's well-scoped and correctly placed.
   - **Rewrite** — same intent, sharper scope. Give the new wording.
   - **Split** — two products hiding in one line. Name both halves and say which ships first.
   - **Defer** — right idea, wrong time. Say what would unblock it.
   - **Delete** — solved elsewhere (e.g., Supabase PITR already covers "snapshot"), or not actually a product feature.

5. **Then look for what's MISSING.** Browse the shipped stages, then ask: what product surfaces would a recipe-app user expect that the roadmap doesn't mention at all? Common gaps in this project's space:
   - Onboarding / first-run experience
   - Open Graph / link unfurl quality (especially after Stage 8 sharing)
   - Cooking mode (keep-screen-on, step focus)
   - Meal planning / shopping list export (pairs with the fridge basket)
   - Recipe forking / "save a copy I can edit"
   - Nutritional info (even approximate)
   - i18n if there's any global reach signal

   Don't list all of these — pick the 2–4 that would meaningfully improve the product *at this project's actual scale*.

6. **Propose a resequenced order** for the unimplemented work. Lead with closing old loops (carry-forwards), then sequence by dependency + value. Be explicit about what gets pushed and why.

## Output shape

Structure the review by stage, not by axis — the user reads top-to-bottom through the roadmap and the feedback should match.

```
## Stage N — <name>
- **Item X**: <recommendation: rewrite | split | defer | delete | keep>. <One-line why.> <If rewrite/split, the new wording.>

## Missing entirely
1. **<feature>** — <why it matters at this scale, where it slots in>
2. ...

## Suggested resequencing
1. <first>
2. <second>
...
```

End by asking whether the user wants you to apply the rewrites directly to [refs/ROADMAP.md](../../../refs/ROADMAP.md) — don't edit the file unprompted. The review is the output; the edit is a separate consented step.

## What NOT to do

- **Don't critique shipped work.** Stages with `*(done)*` headers or fully-checked checklists are off-limits. The retro happened when they shipped; this skill is forward-looking.
- **Don't propose generic SaaS features.** "Add analytics," "add a referral program," "build an API" are signals you didn't read the roadmap. Recommendations should reference specific items by stage and number.
- **Don't dump a 20-item missing list.** Pick the few that genuinely improve the product at this scale. A long list dilutes the high-value additions and signals you're listing rather than thinking.
- **Don't restructure stages the user has already shipped against.** If Stage 11 is `*(done)*`, don't propose "what Stage 11 should have been" — that's noise.
- **Don't edit `refs/ROADMAP.md` without explicit confirmation.** The review is advisory until the user signs off on specific rewrites.
- **Don't conflate this with `stage-kickoff`.** That skill picks the next item to ship from the existing roadmap; this skill questions whether the existing roadmap is right.
