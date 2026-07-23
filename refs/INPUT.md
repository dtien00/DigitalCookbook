# Recipe Input Methods — Beyond Typing and Paste

> **Status:** Research only. Nothing here is implemented. This document catalogues every
> plausible way a recipe could *enter* the app besides typing it field-by-field into
> [CreateRecipe.jsx](../src/components/CreateRecipe.jsx) or pasting text into the Stage 22
> import modal — what each method demands of the author, what it demands of the codebase,
> and which are worth building. Written in the spirit of the `/teach` skill: each method
> names the general pattern underneath so the reasoning transfers beyond this repo.
>
> **Date:** 2026-07-19 · **Companion docs:** [ROADMAP.md](./ROADMAP.md) Stage 22
> (paste-import, shipped; URL-import deferred v2) · [TESTING.md](./TESTING.md) (import
> fixture checklist) · [teachings/](./teachings/) (where the lesson goes once one of these
> ships)

---

## TL;DR

- **Stage 22 already built the hard part.** [src/lib/recipeImport.js](../src/lib/recipeImport.js)
  normalizes three input formats into one canonical shape, and the CreateRecipe form is the
  review-and-correct surface. Every method below is just a **new transport into that same
  funnel** — none of them re-solves parsing, and none should invent a second review UI.
- **The volume problem is a batching problem.** Typing is tedious at N recipes not because
  one form is slow but because the per-recipe fixed cost (navigate, focus, save) repeats N
  times. The highest-leverage builds are the ones that amortize that cost: **file drop → 
  multi-file batch queue → OCR photo capture**, in that order.
- **Two methods work *today* with zero code** and just need documenting: the phone
  keyboard's dictation mic into the paste textarea (voice input for free), and the app's
  own-export JSON as a paste format (already parsed).
- **The server wall is real and already mapped.** URL import, LLM structuring, and email-in
  all require the project's first API route — the same gate ROADMAP's Stage 22 v2 entry
  scopes (CORS, SSRF guarding, `vite dev` doesn't serve Vercel functions). Nothing in this
  doc jumps that wall early; the client-side tier is deep enough to exhaust first.

---

## 1. The current input surface (baseline)

Two ways in today, both ending at the same place:

1. **Typed entry** — [CreateRecipe.jsx](../src/components/CreateRecipe.jsx): title,
   description, servings, public/private, tags, cover image, section/ingredient rows
   (quantity with fraction parsing via [parseQuantity.js](../src/lib/parseQuantity.js),
   unit autocomplete via [UnitCombobox](../src/components/UnitCombobox.jsx) over
   [measurementUnits.js](../src/lib/measurementUnits.js), per-ingredient notes), steps
   (instruction, optional photo, optional timer). Entry ergonomics are already tuned
   (Enter-key row flow, column-layout cycling, drag reorder) — the per-field cost is low;
   it's the *per-recipe* cost that stings at volume.
2. **Paste import** — [ImportRecipeModal.jsx](../src/components/ImportRecipeModal.jsx) →
   [recipeImport.js](../src/lib/recipeImport.js) sniffs schema.org JSON-LD, the app's own
   export JSON, or heuristic plain text, and normalizes to
   `{ title, description, servings, tags, ingredients: [{name, quantity, unit, notes, section}], steps: [{instruction}], warnings }`.
   "Fill form" routes through the existing setters + `ingredientsToRows()`; the author
   reviews in the form and saves through the unchanged pipeline. Create mode only;
   imported recipes default to private.

The architectural insight this doc leans on: **the modal is a thin transport (clipboard →
textarea → string) bolted onto a reusable parser.** Swap the transport and everything
downstream — parser, warnings, form prefill, review, save — comes along for free.

```
 clipboard paste ─┐
 file drop        ├──▶ string / JSON ──▶ recipeImport.js ──▶ normalized ──▶ form prefill ──▶ author review ──▶ save
 OCR'd photo      │                      (unchanged)          object        (unchanged)      (unchanged)
 dictation        │
 bookmarklet ─────┘
```

---

## 2. Method catalogue

Ordered roughly by (value ÷ effort), client-side tier first.

### 2.0 Already possible today — document, don't build

**Keyboard dictation into the paste box.** Every phone keyboard has a mic key; dictating
"two cups flour, one teaspoon salt…" into the import textarea feeds the existing text
parser. Voice input for zero lines of code. Worth a one-line hint in the modal's
placeholder text and a row in TESTING.md's fixture checklist — the parser's tolerance for
dictation quirks (no bullets, spelled-out numbers, "new line" artifacts) is untested.
*Pattern: the degenerate case of every method below — any transport that ends in text is
already supported.*

**Own-export JSON round-trip.** Pasting a recipe exported from this app (migration 016
shape) already parses. This is the seed of the batch story in §2.2 — the format exists,
only the multi-recipe transport is missing (today a multi-recipe blob imports the first
with a warning).

### 2.1 File drop / file picker on the import modal — *build first*

**Author does:** drags a `.txt` / `.md` / `.json` file onto the modal (or taps a file
picker on mobile) instead of open-copy-paste.
**Path into the funnel:** `FileReader.readAsText()` → the same string the textarea would
hold → `recipeImport.js` unchanged.
**Leans on:** the browser File API (drag-and-drop + `<input type="file">`); nothing else.
No schema change, no new dependency, no server.
**Effort:** hours. The modal grows a drop zone and a picker button; parsing, preview,
warnings, fill are untouched.
**Verdict: yes, and soon.** Removes the most annoying step for anyone with recipes as
files (notes-app exports, Markdown vaults, old blog drafts). Also the prerequisite for
§2.2.
*Pattern: transport substitution — change how bytes arrive, not what happens to them.*

### 2.2 Multi-file batch queue — *the actual answer to "volume"*

**Author does:** selects/drops N files (or one JSON array of recipes); the modal becomes a
queue — parse all, show a list ("12 parsed, 2 with warnings, 1 failed"), then step through
them one at a time, each landing in the form for review and save, then auto-advancing.
**Path into the funnel:** loop over §2.1's per-file path; queue state lives in the modal.
The form stays the review surface — one recipe at a time, exactly as today. A "skip" per
item and a "remaining" counter are the whole new UI.
**Leans on:** §2.1; the own-export JSON array shape (already defined); the existing
create-mode-only + private-by-default rules applied per item.
**Effort:** ~1–2 days. The design question worth sketching first (`/feature-sketch`
territory): does save-and-advance re-enter CreateRecipe cleanly, or does the queue live
above it in [App.jsx](../src/App.jsx)?
**Verdict: yes — this is where "tedious at volume" actually dies.** Migrating a personal
collection becomes one drag + N quick reviews instead of N full entries. Explicitly *not*
auto-save-all: the review step is the app's guarantee that a parse error costs one edit,
never a bad row (see §4, pattern 2).
*Pattern: batch amortization — pay the fixed cost (open modal, choose source) once, keep
the variable cost (review) per item.*

### 2.3 Bookmarklet clipper — *the CORS loophole*

**Author does:** while viewing any recipe page in their browser, taps a bookmarklet
("Clip to Digital Cookbook"); it extracts the page's recipe and hands it to the app.
**Why this is clever:** URL import is blocked because the *SPA* can't fetch other origins
(CORS). But a bookmarklet runs **inside the page the author is already viewing** — it
reads the live DOM directly, no cross-origin fetch. It grabs
`<script type="application/ld+json">` blocks (which `recipeImport.js` already mines from
whole-page pastes) or falls back to the page's selected text / body text, then copies the
result to the clipboard for pasting — or opens `/new?import=…` with a compressed payload
(URL length limits make clipboard the safer v1).
**Leans on:** the JSON-LD path already shipped in Stage 22; a tiny self-contained JS
snippet hosted as a docs page. No server, no schema change, no extension-store review.
**Effort:** ~1 day, most of it docs/UX (installing a bookmarklet on iOS Safari is
genuinely awkward — that's the method's real cost, not the code).
**Verdict: worthwhile sleeper.** Delivers ~80% of URL import's value years before an API
route exists. A full browser extension is the same idea with better install UX and much
higher maintenance; don't start there.
*Pattern: user-agent-side extraction — do the cross-origin work where the user already has
the page open, so the origin wall never applies.*

### 2.4 OCR photo capture — *unlocks paper*

**Author does:** photographs a cookbook page or a printed recipe card (camera or upload);
the text is OCR'd and dropped into the paste box for the normal parse → review flow.
**Path into the funnel:** image → [Tesseract.js](https://tesseract.projectnaptha.com/)
(client-side WASM OCR) → text string → existing heuristic parser.
**Leans on:** dynamic `import()` to keep the ~2–4 MB WASM+model off the initial bundle —
the exact precedent [html2pdf](./ROADMAP.md) set in Stage 8. No server, no schema change.
**Honest limits:** printed text OCRs well; **handwriting OCRs badly** — Tesseract will
frustrate anyone photographing grandma's recipe cards. The handwriting-grade fix is a
vision LLM, which sits behind the server wall (§2.7). Ship printed-page OCR with expectations
set in the modal copy ("works best on printed text"), and let the review form absorb the
error rate — that's what it's for.
**Effort:** ~2–3 days including a confidence-threshold pass (drop garbage lines rather
than filling the form with them) and TESTING.md fixtures (photographed cookbook page,
skewed shot, handwriting → expected-degraded).
**Verdict: yes, after §2.1–2.2.** The only client-side method that reaches content with no
digital source at all — the bookshelf and the recipe box.
*Pattern: lossy-capture front end — accept an unreliable extractor because a human review
gate is already downstream; the funnel turns "OCR must be right" into "OCR must be
faster than typing," a far lower bar.*

### 2.5 Duplicate / fork as a starting point

Typing five variants of one dough recipe is volume tedium too. "Start from a copy" —
of your own recipe, or forking another author's — prefills the entire form from an
existing row. Already scoped as the **recipe forking** deferred idea in
[ROADMAP.md](./ROADMAP.md) (`forked_from_id` column, `?fork=<id>` param); recorded here
only because it's an input method by another name. No new scoping needed.

### 2.6 Live voice dictation (Web Speech API) — *probably skip*

A mic button doing in-app speech-to-text (`SpeechRecognition`). Browser support is uneven
(no Firefox; Chrome routes audio to Google's servers — a privacy note the app would own),
and §2.0's keyboard-mic trick already delivers the same outcome on the primary
(phone-in-kitchen) platform using the OS's better recognizer. Build only if a real user
reports the keyboard mic failing them. *Pattern lesson: before building an input method,
check whether the OS already provides it one layer down.*

### 2.7 Behind the server wall — URL import, LLM structuring, email-in

All three need the project's **first API route** — the gate ROADMAP's Stage 22 v2 entry
already scopes (CORS-proxying fetch, SSRF/timeout/size guarding, `source_url` attribution
column, `vite dev` not serving Vercel functions). This doc adds no new scope there, only
ordering:

- **URL import** ("paste a link") — first through the wall, per ROADMAP. The bookmarklet
  (§2.3) is its cheap understudy until then.
- **LLM structuring / vision** — paste-anything or photograph-handwriting, structured by a
  model. The accuracy ceiling for messy input, and the honest fix for §2.4's handwriting
  gap — but it adds per-use cost, an API key to protect (hence server), and latency. The
  project already declined LLM assistance once on exactly these grounds (tag autocomplete,
  ROADMAP deferred-ideas); the same reasoning holds until there's evidence the heuristic
  parser + review form actually fails real users. If the wall is ever crossed for URL
  import, this rides the same infrastructure.
- **Email-in gateway** (mail a recipe to `add@…`) — inbound-mail webhook, sender→account
  mapping, spam surface. Charming, disproportionate. **Declined.**

### 2.8 Declined outright

- **CSV / spreadsheet template** — recipes are nested (sections → ingredients; ordered
  steps); flat rows force either a fragile multi-row convention or one-column-per-step
  absurdity. The own-export JSON array (§2.2) is the batch format and already exists.
- **PWA Share Target** ("share" a page from another app straight into Digital Cookbook) —
  requires the PWA/manifest install story (see ROADMAP's *App Format/Distribution*
  deferred idea) and the shared payload is usually just a URL, which lands back at §2.7
  anyway. Re-evaluate if the app ever ships as an installed PWA.

---

## 3. Comparison

| Method | Reaches | New deps | Server? | Effort | Verdict |
|---|---|---|---|---|---|
| §2.0 Keyboard dictation | voice | none | no | docs only | document now |
| §2.1 File drop | files | none | no | hours | **build first** |
| §2.2 Batch queue | collections | none | no | 1–2 days | **build second** |
| §2.3 Bookmarklet | any open web page | none | no | ~1 day | strong sleeper |
| §2.4 OCR photo | printed paper | Tesseract.js (lazy) | no | 2–3 days | yes, third |
| §2.5 Fork/duplicate | own+others' recipes | migration | no | scoped in ROADMAP | ride existing plan |
| §2.6 Web Speech API | voice | none | no | ~1 day | skip (OS covers it) |
| §2.7 URL / LLM / email | links, handwriting | API route infra | **yes** | large | wait for the wall |
| §2.8 CSV, Share Target | — | — | — | — | declined |

---

## 4. The patterns underneath (the `/teach` section)

Three ideas carry everything above; stated generally so they transfer.

**1. Adapter funnel** *(a.k.a. canonical data model, anti-corruption layer)*
**Problem:** many input formats, one internal representation, and a combinatorial mess if
each format gets its own pipeline.
**Recipe:** ① define one normalized shape; ② write per-source adapters that *only*
translate into it; ③ keep everything downstream (validation, preview, persistence)
adapter-agnostic; ④ adding a source = adding one adapter, never touching the funnel.
**Here:** `recipeImport.js`'s normalized object is the shape; format sniffing picks the
adapter; every §2 method is a new left edge feeding the same funnel.
**Reach for it again when:** a feature must accept "whatever the user has." **Not when:**
there's exactly one input format and no growth path — the indirection is then pure cost.

**2. Human-in-the-loop prefill** *(a.k.a. review-before-commit)*
**Problem:** automated extraction is never fully reliable, and silent bad writes are the
most expensive failure a data-entry feature can have.
**Recipe:** ① parser output lands in an *editable* staging surface, never directly in the
store; ② the staging surface is the same editor the user already knows; ③ warnings ride
alongside, not as blockers; ④ commit is always an explicit human act.
**Here:** "Fill form" populates CreateRecipe; nothing writes to Postgres until the author
saves. This single decision is why §2.4 can tolerate mediocre OCR and §2.2 can batch
safely — the error budget is absorbed by review, not by the database.
**Reach for it again when:** ingesting anything machine-extracted. **Not when:** the
input is already trusted and structured (the own-export round-trip could justify a
lighter review someday).

**3. Transport/parse separation** *(a.k.a. layering; "ports" in ports-and-adapters)*
**Problem:** input features look monolithic ("build voice input!") and get costed as such.
**Recipe:** ① split every input method into *transport* (how bytes arrive) and
*interpretation* (what they mean); ② build interpretation once, pure and unit-tested;
③ each new transport is then a thin, mostly-UI shim.
**Here:** the pure-lib convention (`src/lib/recipeImport.js` + 21 Vitest specs, per the
`dragSortCore`/`ingredientSections` precedent) *is* this split — which is why §2.1 is
hours, not days, and why a "voice input feature" collapses into a mic emoji in a
placeholder string.
**Reach for it again when:** any I/O feature request arrives. **Not when:** transport and
meaning are genuinely inseparable (rare; usually a sign the parsing is being done in the
UI layer by accident).

---

## 5. Recommended sequence

1. **Now (docs-only):** add the dictation hint + own-export note to the import modal copy
   and TESTING.md fixtures (§2.0).
2. **Next build:** file drop (§2.1) → batch queue (§2.2) — together they retire the
   "tedious at volume" complaint for anyone whose recipes exist digitally.
3. **Then:** bookmarklet (§2.3) and OCR (§2.4), in either order — web-without-server, then
   paper.
4. **Gate unchanged:** URL import and everything LLM (§2.7) wait behind the first-API-route
   decision already recorded in ROADMAP; email-in stays declined.

The client-side tier (§2.0–§2.3) is already taught as a design lesson —
[teachings/import-transports.md](./teachings/import-transports.md) walks the exact seams in
`ImportRecipeModal.jsx` / `recipeImport.js` each transport attaches to and names the
patterns underneath. When one ships, that lesson gains a "Second encounter" section
walking the real diff.
