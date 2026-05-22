---
name: stage-wrap
description: Wrap up a stage or sub-stage of the Digital Cookbook. Use whenever the user says "wrap up Stage N", "mark Stage X complete", "finish this stage", "close out this work", "ready to ship", or otherwise signals a stage's implementation is done and they want to land it. Also trigger after a final commit on a `stage-N-*` branch when the user asks "anything else before I PR?" — the wrap checklist is the answer to that question.
---

# Stage wrap

Each stage in this project ends with the same mechanical closing sequence: tick the right boxes in `refs/ROADMAP.md`, sync the other living docs that the work touched, capture any follow-ups, and produce a commit + PR that follow the project's conventions. The user has been bitten before by shipping work without syncing the docs, so this is a memory-encoded rule, not a nice-to-have.

Your job is to run that closing sequence end-to-end without missing a doc.

## What to do

1. **Survey what the branch touched.** Three commands, run in parallel — none alone is sufficient:
   - `git diff main...HEAD --stat` — files changed in committed work.
   - `git status --short` — working-tree changes (modified `M` and untracked `??`). Wrap often happens with uncommitted work; an empty diff above does not mean an empty branch.
   - `git log main..HEAD --oneline` — commit count. **Zero commits is a valid state** — the user may build up everything in the working tree before committing. Don't assume the branch is empty just because the diff is.

   Union all three into a single "files touched" list before mapping. This drives which living docs need syncing — don't sync docs the work didn't touch.

2. **Map changed files → living docs:**

   The base mapping below covers the known docs in `refs/`. Treat it as a starting point, not an exhaustive list.

   | If the branch touched… | Update… |
   |---|---|
   | `src/**` UI components, new CSS classes, palette work | [refs/COSMETICS.md](../../../refs/COSMETICS.md) |
   | `supabase_migration_*.sql`, RLS policies, new tables/columns, hooks that change query patterns | [refs/DATABASE_DECISIONS.md](../../../refs/DATABASE_DECISIONS.md) |
   | New features that need a test account / seed data, new manual-test checklists | [refs/TESTING.md](../../../refs/TESTING.md) |
   | Any feature work at all | [refs/ROADMAP.md](../../../refs/ROADMAP.md) — at minimum tick the relevant `- [ ]` → `- [x]` items |

   **Open rule for `refs/`:** any file in `refs/` is a living doc. If the survey shows a modified or untracked file in `refs/` that isn't in the table above (e.g., `refs/FEATURES.md`, `refs/TECHNICAL_CONCEPTS.md`), surface it explicitly in the plan and ask the user whether it should ship in this PR, move to its own commit, or stay out. Never silently skip a `refs/` file just because the table doesn't list it.

   For each doc you'll touch, read the existing structure first so the new content matches the voice and section conventions of what's already there. These docs lean narrative-explanatory ("why we chose X over Y"), not bullet-summary.

3. **Update `refs/ROADMAP.md`:**
   - Flip the implemented `- [ ]` items to `- [x]`, with an inline italic note explaining what was actually done (the existing roadmap is full of these — match that voice). The note belongs on the same line, not as a sub-bullet.
   - **Distinguish sequenced stages from backlog stages before marking done.** Most stages (0–6 in this project) are *sequenced* — a coherent batch of items that ship together; when all items are checked, append ` *(done)*` to the `## Stage N — Title` heading and update **Exit criteria** to `*Met.*` (or `*Partial: …*` if you only landed some). Other stages are *backlog* baskets — named things like "Deferred / Later" or framed as a menu of independent items that ship piecemeal. For backlog stages, the per-item `- [x]` carries the status; **don't add `*(done)*` to the heading** until every item has shipped, which may be many stages away. When in doubt, read the stage's intro paragraph — sequenced stages have an "Exit criteria" line; backlog stages typically don't.

4. **Capture carry-forward follow-ups.** If you noticed things during the stage that didn't fit in scope, add them under a "carry forward" or "follow-up" bullet in ROADMAP near the next stage. The user's commit history shows this pattern explicitly ("Stage 6 follow-ups: …", "carry forward palette follow-ups to next session").

5. **Stage and commit.** Convention:
   - Subject line format from recent history: `Stage N <short title>` or `Stage N follow-ups: <what>` or `Mark Stage N <thing> as complete`.
   - **No `Co-Authored-By: Claude` trailer.** This is project-specific — the user has explicitly asked for it to be omitted. Use a plain `git commit -m "..."` with no co-author footer.
   - Stage specific files (`git add path/to/file`), not `git add .` — keep stray work out.

6. **Open the PR (if the user wants to).** Convention:
   - Title matches the commit subject.
   - Body has a **Summary** (1–3 bullets) and **Test plan** (manual steps using a specific test account from [refs/TESTING.md](../../../refs/TESTING.md)).
   - **No "Generated with Claude Code" footer.** Same rule as the commit trailer.

## Output shape

Before doing the writes, surface a short plan:

```
**Wrapping Stage N**

**Branch state:** <N commits ahead | zero commits, work in tree>
**Files touched:** <union of committed + modified + untracked>

**ROADMAP changes:**
- Tick: <item 1>, <item 2>
- Stage status: <sequenced — (done) | sequenced — partial | backlog — per-item only>

**Other docs to sync:**
- COSMETICS: <what section, why — or "no change">
- DATABASE_DECISIONS: <what section, why — or "no change">
- TESTING: <what section, why — or "no change">
- <Other refs/ doc>: <surfaced because it appeared in the survey — ship now / separate commit / skip?>

**Carry-forward:** <follow-ups noticed but out-of-scope, or "none">

**Commit:** `<proposed subject line>`
```

Wait for the user's go-ahead before writing to the docs. They often want to tweak the framing.

## What NOT to do

- **Don't touch a living doc the branch didn't materially affect.** A pure refactor with no visible UI change doesn't update COSMETICS. A UI tweak with no schema change doesn't update DATABASE_DECISIONS. Spurious doc edits create review noise.
- **Don't add the Claude co-author trailer to commits or the Claude footer to PR bodies.** This is a hard project rule encoded in user memory.
- **Don't write a long PR body.** The convention is tight: a 1–3 bullet Summary + a Test plan. Anything longer should go in the living docs themselves so it's discoverable later.
- **Don't `git add .` or `git add -A`.** Stage by path. The user often has scratch work in `.context/` or unrelated edits that shouldn't ship.
- **Don't mark a stage `*(done)*` if any items are deferred.** Use `*Partial: …*` in the Exit criteria and leave the heading without the done marker.
- **Don't mark a backlog stage `*(done)*` after a single item ships.** Backlog stages (e.g., "Stage 7 — Deferred / Later") collect independent items; only the items get checked, not the heading. Confusing per-item completion with stage completion would falsely advertise that the project has moved past that backlog.
- **Don't trust `git diff main...HEAD --stat` alone.** A branch with zero commits returns empty output even when there's substantial uncommitted work in the tree. Always pair with `git status --short` so untracked files (`??`) and unstaged modifications (`M`) are part of the survey.
- **Don't silently skip unfamiliar files in `refs/`.** If a `refs/` doc appears in the survey but isn't in the doc-mapping table, surface it for the user — never assume it's noise. It's likely a living doc the project has organically grown.
