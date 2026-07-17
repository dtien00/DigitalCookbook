---
name: teach
description: Turn a just-generated solution — a feature-sketch, an implementation diff, a plan, code Claude wrote this session, or a named past feature — into a durable lesson saved under refs/teachings/. The lesson covers how the solution works in this codebase, which dependencies it leans on and what they're doing for you, and the general academic/industry patterns underneath, stated so they transfer to future problems. Use whenever the user says "teach", "/teach", "teach me how this works", "break down what you just built", "explain this implementation so I can do it myself", "walk me through the solution and keep it", "make this a lesson", or appends "then teach me" / "+ teach" to another skill invocation (e.g. "/feature-sketch X and teach me how it works"). Also trigger when the user asks how they'd build a just-shipped feature by hand, without AI. Composable: run it after feature-sketch, stage-kickoff, or any implementation — the other skill's deliverable is the subject, and teach adds the lesson on top without altering it. Distinct from `explain-term` (one vocabulary term, explained inline, no file written) — teach covers a whole solution end-to-end and always persists the lesson to refs/teachings/.
---

# Teach

Claude generates working solutions faster than the user absorbs them, and a solution that ships un-understood is a loan, not an asset. The user is a side-project developer deliberately building the skill to design and implement features *without* an LLM in the loop ([[user_side_project_developer]]) — if AI became unavailable tomorrow, the code should still have an owner who can extend it. A chat explanation evaporates when the session ends; this skill's deliverable is a **teaching document** in `refs/teachings/` that survives the session and can be reread cold, months later, with no conversation context.

Three things make a teaching land, and all three are required: the walkthrough must be grounded in the real files (a lesson that floats free of the codebase is a textbook chapter the user could get anywhere); the dependencies must be explained as *choices* — what each one is doing for you and roughly what hand-rolling it would take — not just listed; and the underlying concepts must be lifted into a **general pattern** with a name, a problem, and a recipe, so the user can recognize and apply them in a codebase that looks nothing like this one.

## What to do

1. **Identify the subject and its provenance.** In priority order:
   - The deliverable of a skill that just ran (a `feature-sketch` spec, a `stage-kickoff` implementation, a plan) or code written earlier this session — teach that, and cite it as the source.
   - If invoked with args naming something ("/teach the import modal"), locate that code via grep/`git log` and teach the shipped version.
   - If the session has no generated solution and no args, ask what to teach — don't guess a subject.

   When combined with another skill in one request ("sketch X, then teach me"), run the other skill fully first: its output shape is untouched, and the teaching comes after, citing the sketch/diff as provenance.

2. **Read the actual solution, not your memory of it.** Open the touched files and the modules they hook into; for a diff, read the surrounding code too. The walkthrough in step 5 must trace real control and data flow with `file:line` citations — entry point, what calls what, where state lives, where it plugs into existing components/tables.

3. **Inventory the dependencies.** Direct imports (npm packages, `src/lib/` modules), platform APIs (browser, React, PostgreSQL features), and services (Supabase auth/storage/RLS) that the solution leans on. For each: the role it plays *in this solution*, what it abstracts away, and a one-line sketch of what doing it without would involve. That last part is the independence training — knowing what the library saves you is knowing what you'd owe without it.

4. **Extract the general patterns — at most three.** Pick the concepts that carry the solution, not every term it brushes past. For each: the canonical name (plus academic/industry synonyms when they differ — e.g. "memoization" vs. "caching pure function results"), the problem class it solves, and a numbered **recipe** written with zero project specifics — then map each recipe step back to where this implementation performs it. A pattern the user can only recognize in this repo hasn't been taught. Vocabulary-level tangents belong in `explain-term`, not here — link the term and move on.

5. **Write the teaching file** to `refs/teachings/<slug>.md` (topic-named, kebab-case — `recipe-import-parsing.md`, not a date) using the output shape below. Bootstrap on first use: create `refs/teachings/` with a `README.md` index (table: Lesson | Patterns | Source | Date) and add a row for `teachings/` to the living-docs table in [refs/README.md](../../../refs/README.md). Every later lesson updates the index. If a teaching for the same topic already exists, extend it — a "Second encounter" section showing the pattern in its new context deepens the lesson; a duplicate file fragments it.

6. **Deliver the lesson in chat too.** Post a condensed version — the walkthrough's spine, the pattern names with their one-line problems, and a link to the file — then close with a menu: a deeper pass on any one pattern, an `explain-term` lesson on any jargon used, or a hands-on exercise (e.g. sketch the next feature that uses this pattern before asking Claude to). Writing the file silently and saying "done" teaches nothing this session.

## Output shape

The teaching file:

```
# <Solution name> — how it works

*Taught: <YYYY-MM-DD> · Source: <sketch / branch / PR / commit> · Patterns: <names>*

## The problem
<1–2 sentences: what user-facing or technical need this solution answers>

## How it works
<walkthrough of the real implementation: entry point → flow → where it hooks
into existing code; file:line citations throughout; excerpt code minimally
and annotate rather than pasting blocks>

## Dependencies, and what each is doing for you
- **<dep>** (<npm / platform / service>) — <role in this solution>.
  Without it: <one line on what hand-rolling would involve>.

## Pattern: <canonical name>            <!-- repeat per pattern, max 3 -->
**Also known as:** <synonyms across academia/industry, if any>
**Problem it solves:** <the general problem class>
**The recipe:**
1. <general step — no project specifics>
2. ...
**Here:** <map recipe steps → file:line in this implementation>
**Reach for it again when:** <situation>. **Not when:** <situation — alternative>.

## Do it yourself next time
<a short ordered checklist for applying this by hand: the questions to ask
first, the order to build in, the first file to open, how to verify>

## Further reading
- <1–2 canonical sources — MDN, React docs, Supabase/PostgreSQL docs, the
  original paper if the pattern has one; no blogspam>
```

## What NOT to do

- **Don't modify the solution.** Teach explains what exists (or what the sketch proposes); refactors and fixes discovered while reading are surfaced as observations, applied only if the user asks.
- **Don't write a textbook chapter.** Generic pattern prose without `file:line` grounding is what the user could get from any search — the repo anchoring is the entire value. Read the code before writing (step 2 is not optional).
- **Don't skip the file.** A chat-only explanation is what happens *without* this skill; persistence to `refs/teachings/` is the deliverable, and invocation is consent to write it. (Deliberate inverse of `explain-term`, which stays inline.)
- **Don't teach every concept the code touches.** Three patterns, chosen for transfer value. A lesson covering eight concepts teaches none of them; park the rest as `explain-term` candidates in the closing menu.
- **Don't list dependencies without their cost.** "Uses supabase-js" is inventory; "supabase-js is doing auth-token refresh and typed Postgres access over HTTP — hand-rolled, that's fetch calls plus session storage plus RLS-aware query building" is teaching.
- **Don't paste large code verbatim into the lesson.** Cite and annotate; the code lives in `src/`, the *reading* of it lives in the teaching. Big excerpts go stale the next time the file changes.
- **Don't create parallel homes for lessons.** One directory (`refs/teachings/`), one index, rows in [refs/README.md](../../../refs/README.md) — mirroring [[feedback_keep_living_docs_current]]. Check the index for an existing lesson on the topic before creating a new file.
- **Don't derail a combined invocation.** When riding on `feature-sketch` or an implementation, the host skill's deliverable comes first and stays intact; the teaching follows it. If the user asked only to sketch, don't teach uninvited.
