# Import transports (file drop · batch queue · bookmarklet · modal-copy hints) — how they'd work

*Taught: 2026-07-19 · Later encounters: 2026-07-22 (file drop + batch queue, then actionable warnings, on `import-file-drop`) · Source: design sketch, [INPUT.md](../INPUT.md) §2.0–§2.3; builds on Stage 22 / PR #80, taught in [recipe-import.md](./recipe-import.md) · Patterns: transport/parse separation · in-page extraction · batch with per-item review*

> **Status note:** unlike the companion lesson, this teaches a *proposal*. Every `file:line`
> citation below points at real, shipped code — the seams these transports would attach to —
> while the transports themselves are design. When one ships, extend this file with a
> "Second encounter" section walking the real diff.

## The problem

Stage 22's import accepts exactly one transport: the system clipboard, via a textarea. Anyone whose recipes live as files, as another open browser tab, or as a whole collection pays a copy-paste round-trip per recipe — the per-recipe *fixed cost* that makes volume entry tedious. These four methods add transports without touching parsing, preview, or save.

## How it works

**The seam everything attaches to.** [ImportRecipeModal.jsx](../../src/components/ImportRecipeModal.jsx) reduces to two pieces of state and one pure call: `raw` (the pasted string, [:31](../../src/components/ImportRecipeModal.jsx)) and `result` (the parse, [:34](../../src/components/ImportRecipeModal.jsx)), joined by *Preview* → `setResult(parseRecipeImport(raw))` ([:120](../../src/components/ImportRecipeModal.jsx)). Everything downstream — the detected-summary card ([:92–107](../../src/components/ImportRecipeModal.jsx)), *Fill form* → `onApply(result.recipe)` ([:128](../../src/components/ImportRecipeModal.jsx)), `applyImport`'s setter cascade + private flip ([CreateRecipe.jsx:367](../../src/components/CreateRecipe.jsx), [:384](../../src/components/CreateRecipe.jsx)) — consumes only those. So "add an input method" collapses to: **get a string into `setRaw`.** That's the entire integration surface, and it's why three of the four methods are shims.

One invariant must survive every new transport: editing the paste clears the previous result ([:45–48](../../src/components/ImportRecipeModal.jsx)) so *Fill form* can never apply a parse the text no longer matches. Any transport that sets `raw` must either clear `result` the same way or set both atomically.

**§2.0 Modal-copy hints (zero code).** The textarea at [:80–87](../../src/components/ImportRecipeModal.jsx) is a plain controlled `<textarea>` — which means every OS text-input affordance already works on it, including the phone keyboard's dictation mic. Voice input "ships" by mentioning it in the intro copy ([:75–79](../../src/components/ImportRecipeModal.jsx)) or placeholder ([:85](../../src/components/ImportRecipeModal.jsx)). The lesson inside the non-lesson: before building an input method, check whether the platform already provides it one layer down.

**§2.1 File drop.** The modal's paste panel grows two entry points feeding the same handler: a `<input type="file" accept=".txt,.md,.json">` picker, and `dragover`/`drop` handlers on the textarea's container. The handler is ~four lines: take the `File` from `e.dataTransfer.files` (drop) or `e.target.files` (picker), `const text = await file.text()`, then `setRaw(text)` + clear/replace `result`. Two real details hide in those lines:

- `dragover` must call `e.preventDefault()` — without it the browser's default behavior *navigates to the file*, replacing the app. This is the classic drag-and-drop gotcha, not an edge case.
- Auto-running the parse on drop is a deliberate divergence from the modal's explicit-Preview posture (no parse-on-type was a Stage 22 decision). It's defensible because a dropped file is a *complete* document, unlike mid-edit text — but either choice keeps the invariant above.

Oversized files are already handled: `parseRecipeImport` fails fast past `MAX_INPUT` ([recipeImport.js:26](../../src/lib/recipeImport.js)), so a mis-dropped video file costs an error message, not a freeze.

**§2.2 Multi-file batch queue.** Loop §2.1 over `e.dataTransfer.files`: parse every file upfront into `{ fileName, result }` triage rows (✓ parsed / ⚠ warnings / ✗ failed — the `warnings`/`error` fields already exist on every parse result, [recipeImport.js:388](../../src/lib/recipeImport.js)), then step through the queue one recipe at a time through the *unchanged* single-item flow: apply → review in the form → save → advance, with per-item skip and a remaining-count. Reading the real code surfaces the one design problem the sketch glossed over: `applyImport` gates on `formIsDirty()` with a native confirm ([CreateRecipe.jsx:368](../../src/components/CreateRecipe.jsx)) — and after saving item *k*, the form still holds item *k*'s content, so advancing to item *k+1* would fire that confirm every single time. The queue therefore needs the form reset after each save, or a queue-aware bypass of the dirty check. That's the kind of integration fact you only get by reading the seam, and it's the first thing to settle in a `/feature-sketch` for this build. Where the queue state lives (inside the modal vs. above CreateRecipe in [App.jsx](../../src/App.jsx)) is the second.

**§2.3 Bookmarklet clipper.** URL import is blocked because the *SPA's origin* can't fetch other sites (same-origin policy, the wall ROADMAP's Stage 22 v2 entry maps). A bookmarklet sidesteps the wall entirely: a `javascript:` URL saved as a browser bookmark executes **in the context of whatever page is currently open** — the user's browsing context already has the recipe page, so no cross-origin request ever happens. The extractor is four operations:

1. `document.querySelectorAll('script[type="application/ld+json"]')` — the same vein `extractLdJsonBlocks` ([recipeImport.js:380](../../src/lib/recipeImport.js)) mines from *pasted* page source, but read from the **live DOM**, which also catches JSON-LD injected by JavaScript after page load (a case view-source pasting misses).
2. Collect the blocks' `textContent`; wrap multiples as a JSON array — `findRecipeNode` ([recipeImport.js:183](../../src/lib/recipeImport.js)) already searches arrays and `@graph` wrappers, so no new parser work.
3. `navigator.clipboard.writeText(payload)` — allowed because the bookmarklet click is a user gesture on a secure page; fall back to a `prompt()` box showing the payload for manual copy.
4. Alert the user to paste into New Recipe → Import — where the existing JSON-LD tier ([recipeImport.js:406](../../src/lib/recipeImport.js) → `mapJsonLd` [:218](../../src/lib/recipeImport.js)) takes over.

Nothing on the app side changes at all: the bookmarklet's output *is* a paste. The real cost is distribution — a docs page hosting the snippet, and iOS Safari's genuinely awkward bookmarklet-install flow.

## Dependencies, and what each would be doing for you

- **File API — `File.text()` / `DataTransfer`** (platform) — reads a local file's contents as a string entirely client-side, with user consent expressed by the drop/pick gesture itself. Without it: browsers offer *no* other route to local file contents — the pre-File-API web had to upload the file to a server and echo it back.
- **HTML drag-and-drop events** (platform) — `dragover` + `drop` with `preventDefault()` turn a region into a drop target. Without them: only the file picker — fine functionally, but the drop affordance is what makes batch feel effortless.
- **`javascript:` URL scheme** (platform) — arbitrary code execution in the current page from a bookmark; the only extension-free, server-free way to run your code where the recipe page already is. Without it: a browser extension (manifest, store review, per-browser maintenance) or the server-side fetch route with its SSRF/CORS guarding.
- **Clipboard API — `navigator.clipboard.writeText`** (platform) — the bookmarklet's handoff channel; gated on user gesture + secure context, both satisfied at click time. Without it: the deprecated `document.execCommand('copy')` dance with a hidden textarea, or asking the user to copy from a `prompt()`.
- **recipeImport.js** (`src/lib`) — all four transports terminate in the one parser, inheriting content sniffing, warnings, and `finalize`'s guarantees for free. Without it: a parser per transport — the N×M explosion [recipe-import.md](./recipe-import.md)'s *normalize at the boundary* pattern exists to prevent.
- **Notably absent, again: Supabase and any server.** The entire tier is client-side by design; the first method that genuinely needs a server (URL fetch) is exactly where INPUT.md draws the "wait" line.

## Pattern: Transport/parse separation

**Also known as:** ports and adapters (hexagonal architecture); dependency inversion applied at the I/O edge; "functional core, imperative shell" is the close cousin.
**Problem it solves:** input features get scoped as monoliths ("build voice input", "build file import") and priced accordingly, when the expensive half — interpretation — can be built once and shared if it's kept ignorant of how bytes arrive.
**The recipe:**
1. Find (or create) the narrowest interface between arrival and interpretation — often just "a string."
2. Put all interpretation behind it as a pure, unit-tested function; no DOM, no network, no framework.
3. Implement each transport as a shim whose only job is delivering into that interface.
4. Cost every proposed input method as "shim + zero," and reject any design that makes the parser transport-aware.

**Here:** the interface is the `raw` string state ([ImportRecipeModal.jsx:31](../../src/components/ImportRecipeModal.jsx)); step 2 is `parseRecipeImport` (pure, 21 specs); the shims are §2.0 (the OS keyboard *is* the shim), §2.1 (`file.text()` → `setRaw`), and §2.3 (clipboard handoff → the existing paste path). The pattern is why INPUT.md could price file drop in hours.
**Reach for it again when:** any "get data into the app" request — ask "what's the narrowest thing the existing pipeline consumes?" before designing anything. **Not when:** transport and meaning are truly inseparable (a binary protocol whose framing *is* semantics) — rare, and usually a smell that parsing leaked into the UI layer.

## Pattern: In-page extraction

**Also known as:** bookmarklet pattern; content-script extraction (the extension flavor); user-scripting (Greasemonkey lineage).
**Problem it solves:** the same-origin policy stops *your app's origin* from fetching another site's page — but the user is already looking at that page, fully rendered, in their own browser. The block is on *who requests*, not on what the user's own context can read.
**The recipe:**
1. Package the extractor to run in the user's page context: a `javascript:` bookmark, or an extension content script when install UX matters more than zero-maintenance.
2. Read the live DOM — you get post-JavaScript content that raw HTML fetching would miss.
3. Hand off through a user-mediated channel (clipboard, a prefilled URL, `window.postMessage` to an opened app tab), keeping payloads small and the user in the loop.
4. Treat the payload as untrusted input on the receiving side — same validation as any paste, because that's exactly what it is.

**Here:** step 2 mirrors `extractLdJsonBlocks` ([recipeImport.js:380](../../src/lib/recipeImport.js)) against `document` instead of a pasted string; step 3 is `clipboard.writeText`; step 4 is free — the payload enters through the modal and hits the same sniffing ladder ([recipeImport.js:406](../../src/lib/recipeImport.js)) as any paste.
**Reach for it again when:** the data you need is visible in the user's browser but fenced off from your origin, and per-user manual action is acceptable. **Not when:** extraction must run without the user present or at scale — that's a server-side fetcher, with the CORS/SSRF engineering paid honestly.

## Pattern: Batch with per-item human review

**Also known as:** staged ingestion; work queue with a manual gate; triage-then-process.
**Problem it solves:** processing N extracted items. Auto-committing all N multiplies extraction's error rate by N (and silent bad writes are the costliest failure a data-entry feature has); full manual entry multiplies the fixed cost by N. The queue splits the difference: pay setup once, pay only *review* per item.
**The recipe:**
1. Parse everything upfront, cheaply — never commit during this pass.
2. Show triage before work begins: how many parsed clean, with warnings, failed.
3. Route each item through the *existing* single-item review surface; resist building a batch editor.
4. Per-item skip/fail never aborts the batch; always show remaining-count progress.
5. Commit remains an explicit per-item human act.

**Here (shipped 2026-07-22 — see Second encounter below):** step 1 loops `parseRecipeImport` over dropped files; step 2 reads the `warnings`/`error` fields every result already carries ([recipeImport.js:388](../../src/lib/recipeImport.js)); step 3 routes each item through the form; step 5 is the untouched Save button. The one open design point at sketch time — the dirty-check collision on advance — was resolved as described below.
**Reach for it again when:** any migration/bulk-ingest feature where extraction is imperfect and items are independent. **Not when:** items are trusted and structured (your own export re-imported) — there, per-item review becomes ceremony, and a lighter confirm-all is honest.

## Second encounter — batch queue, shipped

The batch queue landed on `import-file-drop` (2026-07-22). What the sketch left open, and how the real code closed it:

**The dirty-check collision (the flagged design point).** `applyImport` guards a *dirty* form with a native confirm ([CreateRecipe.jsx:389](../../src/components/CreateRecipe.jsx)). After saving item *k*, the form still holds item *k*, so a naïve advance would fire that confirm on every item. Resolution: split the fill into two functions — a **confirm-free full-overwrite** `applyRecipe(recipe)` ([CreateRecipe.jsx:368](../../src/components/CreateRecipe.jsx)) that replaces *every* field (title, description, servings, tags, rows, steps, **and clears the cover image** so a prior item's pick can't bleed through), and the public `applyImport` that layers the dirty-confirm + toast on top for the single-paste path. The batch advance calls `applyRecipe` directly — no reset-then-fill dance, no confirm, because a full overwrite *is* the reset. This is the general lesson: **when a "reset then apply" sequence is awkward, an idempotent full-apply that subsumes the reset is usually cleaner.**

**Where queue state lives (the second design point).** In [CreateRecipe.jsx](../../src/components/CreateRecipe.jsx), not App.jsx — because the save path (`handleSubmit`) is the *only* thing that navigates away (via `onComplete()`), so batch mode simply **withholds `onComplete()` until the queue drains** ([CreateRecipe.jsx handleSubmit success branch](../../src/components/CreateRecipe.jsx)). The component stays mounted on `/new` for the whole batch, so plain `useState` (`importQueue`, `batchTotal`, `batchSaved`, `currentBatchName`) survives every per-item save — no router juggling, no context, no localStorage. The current position is *derived*, not stored: `batchTotal - importQueue.length`.

**The triage/review split in practice.** The modal owns triage only ([ImportRecipeModal.jsx](../../src/components/ImportRecipeModal.jsx) `batch` state → per-file ✓/✗ list); the form owns review (one item at a time, behind a banner). A failed save throws before the advance code, so the current item naturally stays put for a retry — the "per-item skip/fail never aborts the batch" recipe step falls out of putting the advance *after* the save in the same `try`.

**What stayed identical:** the parser, the normalized shape, the private-by-default flip, and the Stage 21 save pipeline. The batch is a transport over the existing per-item flow — the clearest confirmation of *transport/parse separation* holding up under a second, bigger feature.

## Third encounter — actionable warnings (2026-07-22)

The v1.3 warnings-UX pass deepens the *human-in-the-loop prefill* pattern (taught in [recipe-import.md](./recipe-import.md#pattern-human-in-the-loop-prefill)): if the form is the correction surface, then **the parser's uncertainty belongs on that surface too**, not stranded in a modal the user already dismissed. Three moves worth transferring:

- **Structured over stringly-typed.** Warnings went from `string[]` to `{ code, message, field?, text? }[]` ([recipeImport.js](../../src/lib/recipeImport.js)). The `code` lets the UI *route* a warning (which field it concerns, whether it's recoverable); the string alone couldn't. General lesson: **the moment a message needs to drive behavior, it needs structure** — a `code` is cheaper than parsing your own prose later.
- **Don't discard what you flag.** The old `skipped++` counted lost lines but threw the text away, so "3 lines skipped" had no fix. Retaining the text (`warning.text`) turned a dead-end warning into a one-tap **recover**. Lesson: **a warning about discarded data should carry the data** — the cost is a variable you were already computing.
- **Derived staleness beats stored staleness.** The `no-*` warnings live-hide by *re-deriving* visibility from current form state at render (`title.trim() === ''`, etc.) rather than storing a "resolved" flag and syncing it. No sync bug is possible because there's no second copy of the truth — the same reason [recipe-import.md](./recipe-import.md)'s parser keeps quantities as display strings instead of a parsed shadow.

## Do it yourself next time

1. **Find the seam first.** Open the existing single-item feature and ask: what's the narrowest thing it consumes? (Here: one string + one pure call.) Write the new feature as "deliver into that seam."
2. **Preserve the seam's invariants.** Read how the current transport manages state (here: result-invalidation on edit, [:45–48](../../src/components/ImportRecipeModal.jsx)) and keep every new transport honoring it.
3. **Build in cost order:** docs-only hint → file picker → drop handlers (remember `preventDefault` on `dragover`) → batch loop → bookmarklet.
4. **Prototype the bookmarklet in the DevTools console** on a real recipe page — iterate the `querySelectorAll` + clipboard logic there, and only then URL-encode it into a `javascript:` bookmark.
5. **Settle the batch queue's two design points before coding:** where queue state lives, and how advance clears the dirty check.
6. **Verify against fixtures:** save TESTING.md's paste fixtures as actual `.txt`/`.json` files and drop them; for the bookmarklet, test a static-HTML recipe site *and* a JS-rendered one (the live-DOM advantage should show).

## Further reading

- [MDN — Using files from web applications](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications) — File API + drag-and-drop file handling, including the `preventDefault` requirement.
- [MDN — Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy) — the wall that blocks URL import and that in-page extraction legally walks around.
- [MDN — Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API) — the user-gesture and secure-context rules the bookmarklet handoff depends on.
