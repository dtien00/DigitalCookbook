---
name: feature-sketch
description: Produce a written design sketch — UI, workflow, data-model delta, edge cases, roadmap slot — for a feature idea before any code is written. Use whenever the user says "sketch out X", "sketch a UI and workflow for", "determine and sketch", "design X before building", "how should X work", or points at a deferred/future ROADMAP item and asks what it would look like. Also trigger when the user describes a feature idea mid-session and asks for an approach rather than an implementation — the sketch is the deliverable; code is a separate consented step. Distinct from `stage-kickoff` (which starts shipping an already-scoped item) and `roadmap-review` (which judges whether planned items are the right items) — this skill turns one fuzzy feature idea into a buildable spec.
---

# Feature sketch

Twice in one week this project asked for a design pass before code: "sketch a UI and workflow for the Clear-all sub-class of the shopping list" and "determine and sketch out the timer clock feature while in cooking mode — also consider whether to add a time field when creating steps." Both wanted the same artifact: a spec grounded in the real codebase — where the UI lives, how the flow runs, what the database needs, what's deliberately cut — plus the open questions, *before* anyone writes a component.

Your job is to produce that artifact. The sketch must name real files, real tables, and real palette tokens; a sketch that floats free of the codebase is just brainstorming. Implementation only starts if the user asks for it afterward.

## What to do

1. **Locate the feature's context.** Grep [refs/ROADMAP.md](../../../refs/ROADMAP.md) for mentions (deferred-steps sections included) — the idea often already has a half-written line. Find the adjacent shipped features and the components (`src/`) and Supabase tables the feature would touch.

2. **Read the living docs that constrain the design:**
   - [refs/ROADMAP.md](../../../refs/ROADMAP.md) — where this slots, what it depends on.
   - [refs/COSMETICS.md](../../../refs/COSMETICS.md) — rustic-paper palette tokens and visual language; the sketch describes UI in these terms, not raw hex/indigo.
   - [refs/DATABASE_DECISIONS.md](../../../refs/DATABASE_DECISIONS.md) — schema and RLS conventions any data change must follow.

   Then skim the actual components involved — enough to name insertion points (`RecipeDetail.jsx`, `CookingMode`, etc.) rather than gesturing at "the recipe page".

3. **Draft the sketch** with the fixed sections in the output shape below. Notes per section:
   - **UI** — ASCII wireframe or state-by-state description. Reuse existing patterns (the modal, button, and card styles COSMETICS already defines); a sketch that invents a parallel design system is noise.
   - **Workflow** — walk the happy path step by step, then the branches (empty state, error, cancel mid-flow).
   - **Data model** — new columns/tables/RLS changes, or an explicit "no schema change" (that's a finding, not an omission). If a migration is needed, say so and note it will need `git add -f` ([[project_migrations_gitignored_force_add]]).
   - **Cut from v1** — the audience is solo + small circle; park anything that pre-scales for traffic that doesn't exist.

4. **Propose the ROADMAP entry.** Exact wording, stage/item placement, per [[feedback_keep_living_docs_current]] — but don't edit the file unprompted. The sketch is advisory until the user signs off.

5. **End with open questions and a next-step menu:** implement now, land the ROADMAP entry first, or park it. Only ask questions the codebase can't answer — resolve everything else yourself during steps 1–2.

## Output shape

```
## <Feature name> — design sketch

**User story:** As <who>, I want <what> so that <why>.
**Entry points:** <where in the existing UI this is reachable from — real components>

### UI
<ASCII wireframe or state-by-state description; real component names; palette tokens from COSMETICS>

### Workflow
1. <step>
2. ...
   - <edge branch: empty / error / cancel>

### Data model
- <table>.<column> — <type, default, RLS note>   (or: no schema change)
- Migration: <yes — new file in supabase_migration/, needs git add -f | no>

### Edge cases
- <case> → <behavior>

### Cut from v1
- <deferred idea> — <why it can wait>

### Proposed ROADMAP entry
> Stage <N> item <M>: <exact wording>

### Open questions
1. <question only the user can answer>
```

Close by asking which next step the user wants: implement, write the ROADMAP entry, or park.

## What NOT to do

- **Don't write code or scaffold components.** The sketch is the deliverable. If the user wanted implementation they'd have said so — and they often do, in the *next* message, after reading the sketch.
- **Don't design in a vacuum.** Every UI element in the sketch should either be an existing component/pattern or explicitly flagged as new. Unnamed insertion points ("somewhere on the recipe page") mean step 1 was skipped.
- **Don't omit the data-model section.** Nearly every feature here touches Supabase; when one genuinely doesn't, "no schema change" is worth stating out loud.
- **Don't gold-plate.** Solo + small circle. Multi-user sync, notification fan-out, and offline-first belong in "Cut from v1" if they appear at all.
- **Don't edit refs/ROADMAP.md unprompted.** Propose the entry wording; apply it only on confirmation (mirrors `roadmap-review`).
- **Don't reach for heavy HTML mockups by default.** ASCII/markdown keeps the sketch cheap to iterate and diffable in the PR that eventually cites it. Mock up visually only if the user asks.
- **Don't leave judgment calls implicit.** If the sketch quietly picks between two plausible designs (e.g., timer per-step vs. one global timer), surface the choice in Open questions unless the codebase or the user's phrasing already settled it.
