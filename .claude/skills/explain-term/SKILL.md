---
name: explain-term
description: Give an in-depth, learn-it-for-next-time explanation of one or more technical terms that surfaced in a Claude explanation or proposal — jargon, patterns, library names, concepts (e.g. "RLS", "debounce", "optimistic update", "upsert", "memoization"). Use whenever the user says "explain term X", "explain X and Y", "what is X you mentioned", "what does X mean", "deep dive on X", "teach me about X", "break down X for me", "I keep seeing X — what is it", or quotes a word from a prior message/plan/sketch/diff and asks to understand it. Also trigger when the user reacts to a proposal with "wait, what's X?" mid-session — the deliverable is a grounded lesson (definition, mechanism, where it lives in this repo, minimal example, trade-offs), not a one-line gloss and not an implementation.
---

# Explain term

Claude's explanations and proposals for this project routinely name-drop concepts — RLS, debouncing, optimistic UI, upsert, memoization — and a one-line gloss in passing doesn't stick. The user is a side-project developer actively building fluency ([[user_side_project_developer]]): when they flag a term, they want to *own* it, so the next time it appears in a plan or a diff they can evaluate it instead of nodding along.

Your job is a lesson, not a definition. What makes it stick is anchoring: the sentence where the term originally came up, the real places it already lives in this codebase, and an example in this project's stack. A generic textbook answer is what the user would get without this skill.

## What to do

1. **Collect the terms and their provenance.** For each term, find where it came up in the current conversation and quote the original sentence — the term should be explained *in the sense it was used there* first, generic senses second. If the term didn't come from this conversation (fresh session, or something read elsewhere), say so and explain it standalone.

2. **Ground each term in the project.** Grep `src/` and the `refs/` living docs for real usage of the term or the pattern it names — RLS policies in [refs/DATABASE_DECISIONS.md](../../../refs/DATABASE_DECISIONS.md), a debounced search input, a memoized selector. Cite `file:line` where it exists. "Not used in this project yet" is a valid and useful finding — pair it with where it plausibly *would* apply here.

3. **Calibrate depth to term count and audience.** The reader can code but is meeting the concept in practice for the first time — explain the mechanism before the vocabulary, and pick the 20% of the topic that carries 80% of real-world usage. For 1–2 terms, full depth per the output shape. For 3+, keep each section tighter and close by offering a deeper pass on whichever term matters most.

4. **Write the lesson** using the output shape below. Notes per section:
   - **What it is** — how it actually works under the hood, why the concept exists (what problem it was invented to solve), not just what it's called.
   - **Where you've seen it here** — the conversation quote from step 1 plus the repo citations from step 2.
   - **Minimal example** — a small snippet in this project's stack (React/Vite, Supabase/PostgreSQL, Tailwind) unless the term inherently belongs to another domain. Illustrative only; nothing gets written to the repo.
   - **When to reach for it (and when not)** — the trade-offs and the alternative you'd use instead. Knowing when a tool is wrong is half of owning it.
   - **Related terms** — 2–4 adjacent concepts, each with a half-line gloss, so one lesson grows the concept map instead of a single node.

5. **Close with canonical docs and a follow-up menu:** link 1–2 official/primary sources (MDN, React docs, Supabase/PostgreSQL docs — not blogspam), then offer: a deeper dive on any term, a hands-on demo in the repo, or logging the lesson to a glossary. Only create `refs/GLOSSARY.md` if the user takes that option.

## Output shape

Per term (repeat for each):

```
## <Term>

**One-liner:** <plain-English definition, one sentence>

### What it is
<2–4 short paragraphs: the mechanism, the problem it solves, how it behaves>

### Where you've seen it here
> "<the sentence from the conversation where it came up>"
- <src/... or refs/... citation with file:line>  (or: not used in this project yet — would apply to <real candidate spot>)

### Minimal example
<small snippet in this project's stack>

### When to reach for it (and when not)
- Reach for it when <situation>.
- Skip it when <situation> — use <alternative> instead.

### Related terms
- **<term>** — <half-line gloss>
```

For multiple related terms, end with a short **How these fit together** paragraph connecting them. Always close with the docs links + follow-up menu from step 5.

## What NOT to do

- **Don't implement anything.** No code lands in `src/`, no files change. If the term came from a proposal, explaining it doesn't mean executing it — the user resumes the original thread when they're ready.
- **Don't give the one-liner and stop.** A short answer is what happens *without* this skill. The one-liner opens the lesson; the depth is the deliverable.
- **Don't explain in a vacuum when the repo has real usage.** If the pattern already exists in `src/` or the refs docs, skipping the citation throws away the thing that makes the lesson stick. Grep before writing.
- **Don't fabricate project usage.** If the grep comes up empty, say "not used here yet" and name a plausible spot — never cite a file you didn't verify.
- **Don't drown the reader in exhaustive coverage.** Every concept has edge cases and history; a lesson that covers all of them teaches none. Depth means the mechanism plus honest trade-offs, not completeness.
- **Don't reframe the term away from its provenance.** If the proposal used "optimistic update" specifically about bookmark toggles, explain that sense first — the generic definition supports it, not the reverse.
- **Don't create refs/GLOSSARY.md unprompted.** Offer it in the close; create it only when the user opts in (mirrors the advisory-until-confirmed pattern in `feature-sketch` and `roadmap-review`).
