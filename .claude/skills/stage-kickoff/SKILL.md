---
name: stage-kickoff
description: Kick off the next stage of the Digital Cookbook roadmap. Use whenever the user asks to "start Stage N", "begin the next stage", "what's next in ROADMAP", "approach Stage X", or otherwise opens a new chunk of staged work referencing refs/ROADMAP.md. Also trigger when the user is on `main` (or a stale stage branch) and asks how to begin upcoming roadmap work, even if they don't say "stage" — the roadmap is the source of truth for this project's sequencing.
---

# Stage kickoff

This project ships work in stages defined in [refs/ROADMAP.md](../../../refs/ROADMAP.md). Each stage stands alone — finish, ship to self, start the next. The user runs sessions per-stage, and the opening move is always the same shape: read the roadmap, pick what's next, set up the branch, surface constraints.

Your job is to compress that opening into one structured response so the user can decide and move.

## What to do

1. **Read `refs/ROADMAP.md`.** Find the first stage whose heading does NOT end with `*(done)*` and whose checklist still has unchecked `- [ ]` items. That's the candidate. If the requested stage number is explicit ("Stage 7"), use that.

2. **Skim the other three living docs for constraints relevant to the stage's tasks**, but only read what's likely relevant — don't dump all four into context:
   - [refs/COSMETICS.md](../../../refs/COSMETICS.md) — if the stage touches UI surfaces
   - [refs/DATABASE_DECISIONS.md](../../../refs/DATABASE_DECISIONS.md) — if the stage mentions schema, RLS, migrations, or data
   - [refs/TESTING.md](../../../refs/TESTING.md) — for the test accounts you'll exercise the feature with

3. **Check git state.** `git branch --show-current` and `git status`. Note the current branch and any uncommitted work — the user often has carry-forward changes from the previous stage that need to be dealt with before branching.

4. **Recommend a sequencing.** A stage's checklist is a menu, not a prescription. Look at the items and propose an order that:
   - Starts with the item that has the smallest blast radius (local-state-only > schema changes > cross-cutting refactors). The user has explicitly preferred this framing — "local-state-only, no schema, no RLS" was the chosen first move for Stage 7.
   - Surfaces any items that are blocked on Supabase/RLS work the user hasn't done yet.
   - Calls out items that should probably be deferred (e.g., scale-dependent features when there's no real audience yet).

5. **Propose the branch name.** Convention is `stage-N-<short-slug>` based on the first item you're tackling (e.g., `stage-7-servings-multiplier`). Confirm with the user before creating.

## Output shape

Respond with a tight structure the user can act on:

```
**Stage N — <title>**
Status: <X of Y items done>

**Suggested first item:** <item title>
Why: <one-line: blast radius, kitchen-relevance, unblocks-other-items, or "closes an old loop">

**Constraints from living docs:**
- COSMETICS: <only if relevant — palette/surface, retint status>
- DATABASE_DECISIONS: <only if relevant — RLS pattern, migration numbering>
- TESTING: <only if relevant — which test account exercises this>

**Branch:** `stage-N-<slug>` off `main` (current: `<current-branch>`, status: <clean | N uncommitted>)

**Deferred this stage:** <items recommended to push to a later stage or post-audience>
```

End with: "Want me to create the branch and start on `<item>`?" — don't create branches or start work until the user confirms.

## What NOT to do

- **Don't open all four living docs by default.** A stage that's purely UI doesn't need DATABASE_DECISIONS; a stage that's purely schema doesn't need COSMETICS. Reading docs you won't use bloats context and slows the kickoff.
- **Don't propose multiple items in parallel.** The user's pattern is one item at a time per branch. Suggesting "let's do all four items this stage" undoes the staged sequencing that the roadmap was built around.
- **Don't auto-create branches or write code.** This skill ends at the recommendation. The user signs off, then implementation begins.
- **Don't restate the full task list from ROADMAP verbatim.** The user has the file open — give them the synthesis they can't get from re-reading.
