---
name: stage-kickoff
description: Kick off the next stage of the Digital Cookbook roadmap. Use whenever the user asks to "start Stage N", "begin the next stage", "what's next in ROADMAP", "approach Stage X", or otherwise opens a new chunk of staged work referencing refs/ROADMAP.md. Also trigger when the user is on `main` (or a stale stage branch) and asks how to begin upcoming roadmap work, even if they don't say "stage" — the roadmap is the source of truth for this project's sequencing. Includes an edge-case sweep mode triggered when the user's args mention "review for edge cases", "missing edge cases", "issues to resolve", "review for issues", or similar — surfaces unaddressed scenarios in the stage's items before implementation begins.
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

3. **Check the starting point.** New sessions should branch off a fresh `main`, not whatever stage branch the previous session left behind. Run in parallel:
   - `git branch --show-current` — am I on `main`?
   - `git status` — is the working tree clean?
   - `git fetch origin main` then `git rev-list --left-right --count origin/main...main` (or `git status -uno` after fetch on main) — is local `main` up to date with `origin/main`?

   Surface three things:
   - **Current branch.** If not `main`, flag that the user should checkout main before branching for the new stage. Stale stage branches from the previous session are the common case here.
   - **Working tree.** Any uncommitted work is carry-forward from the previous stage and needs to be dealt with (commit, stash, or discard) before branching.
   - **Main freshness.** This project merges PRs via the GitHub UI, which does NOT update local `main`. A freshly-opened session almost always has stale local `main`. If behind `origin/main`, flag that the user should `git checkout main && git pull` before branching.

   Do not auto-checkout, auto-pull, or auto-stash — surface the state, let the user confirm the cleanup.

4. **Recommend a sequencing.** A stage's checklist is a menu, not a prescription. Look at the items and propose an order that:
   - Starts with the item that has the smallest blast radius (local-state-only > schema changes > cross-cutting refactors). The user has explicitly preferred this framing — "local-state-only, no schema, no RLS" was the chosen first move for Stage 7.
   - Surfaces any items that are blocked on Supabase/RLS work the user hasn't done yet.
   - Calls out items that should probably be deferred (e.g., scale-dependent features when there's no real audience yet).

5. **Propose the branch name.** Convention is `stage-N-<short-slug>` based on the first item you're tackling (e.g., `stage-7-servings-multiplier`). Confirm with the user before creating.

6. **Run an edge-case sweep when the args ask for one.** Trigger phrases in `command-args`: "edge cases", "missing edge cases", "issues to resolve", "review for issues", "anything missing", "exit criteria". When triggered, for the suggested first item (not the whole stage), list 3–6 concrete scenarios the roadmap item doesn't explicitly call out. Categories to scan:
   - **Empty / zero state** — what shows when the user has none of the thing yet?
   - **Permission / RLS** — who can read, who can write, what happens to the other person's view?
   - **Optimistic-update failure** — what if the mutation fails after the UI already moved?
   - **Concurrent edit / stale read** — two tabs, two devices, refresh during action.
   - **Mobile / narrow viewport** — does the affordance still work at phone width? (cross-ref `mobile-audit`)
   - **Stale closure / functional setState** — the project has been bitten by this; flag mutations that depend on prior state.
   - **Deep-link / refresh** — does the URL still resolve after a hard reload?

   Format each as one line: `<scenario> — <suggested handling or "needs decision">`. Don't propose fixes for all of them; the point is surfacing what's worth deciding before code lands.

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

**Starting point:** <one line — e.g. "✓ on `main`, clean, up to date with `origin/main`" or "⚠ on `stage-16-report-handling` (clean); local `main` is 2 commits behind `origin/main` — checkout main and pull before branching">

**Branch to create:** `stage-N-<slug>` off `main`

**Deferred this stage:** <items recommended to push to a later stage or post-audience>

**Edge-case sweep** *(only when args triggered it):*
- <scenario> — <suggested handling or "needs decision">
- <scenario> — <suggested handling or "needs decision">
- ...
```

End with the right next question for the starting state:
- Clean starting point (on `main`, clean, in sync): "Want me to create the branch and start on `<item>`?"
- Stale or dirty: "Want me to <checkout main / pull origin/main / handle the uncommitted changes> first, then create the branch?" — name the specific cleanup, don't make the user spell it out.

Don't create branches, checkout, pull, or start work until the user confirms. If the sweep surfaced items that need a decision, ask for those decisions in the same turn so the user can answer once.

## What NOT to do

- **Don't open all four living docs by default.** A stage that's purely UI doesn't need DATABASE_DECISIONS; a stage that's purely schema doesn't need COSMETICS. Reading docs you won't use bloats context and slows the kickoff.
- **Don't propose multiple items in parallel.** The user's pattern is one item at a time per branch. Suggesting "let's do all four items this stage" undoes the staged sequencing that the roadmap was built around.
- **Don't auto-create branches or write code.** This skill ends at the recommendation. The user signs off, then implementation begins.
- **Don't auto-checkout `main`, auto-pull, or auto-stash uncommitted work.** Surface stale-branch / behind-origin / dirty-tree state in the Starting point line and ask. Silently switching branches or pulling can drop work the user hasn't decided what to do with yet.
- **Don't restate the full task list from ROADMAP verbatim.** The user has the file open — give them the synthesis they can't get from re-reading.
- **Don't run the edge-case sweep unprompted.** It's gated on trigger phrases in the args. Adding it to every kickoff bloats the response and front-loads decisions before the user has even agreed to the item.
- **Don't run the edge-case sweep across the whole stage.** Sweep only the suggested first item — the rest of the stage's items will get their own kickoff later, and pre-sweeping them invents work the user may never reach.
