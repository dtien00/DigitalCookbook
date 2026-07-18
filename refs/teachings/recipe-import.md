# Recipe import (paste-to-prefill) — how it works

*Taught: 2026-07-17 · Source: Stage 22 on `recipe-import` (PR #80; commits `814eee6` lib, `26c7be0` UI) · Patterns: content sniffing · normalize at the boundary · line-oriented zone state machine*

## The problem

Starting a recipe from a blank form means retyping something that already exists as text somewhere else — a website, a notes app, this app's own data export. Import lets any paste prefill the create form. The design bet that makes it cheap: the parser doesn't have to be right, because the form is the correction surface — a mis-split line costs one edit, never a bad database row.

## How it works

**Entry point.** [CreateRecipe.jsx:548](../../src/components/CreateRecipe.jsx) renders an **Import…** button only when `!isEditMode` (importing over an existing recipe would clobber content that comments/likes reference, so the affordance doesn't exist there). Clicking sets `showImport` ([:57](../../src/components/CreateRecipe.jsx)), which mounts the modal at [:836](../../src/components/CreateRecipe.jsx).

**Modal.** [ImportRecipeModal.jsx](../../src/components/ImportRecipeModal.jsx) owns only paste + preview state. *Preview* calls the parser ([:120](../../src/components/ImportRecipeModal.jsx)); editing the textarea clears the previous result ([:47](../../src/components/ImportRecipeModal.jsx)) so *Fill form* can never apply a parse the text no longer matches — a small invariant that kills a whole class of stale-preview bugs. The summary line ([:19](../../src/components/ImportRecipeModal.jsx), [:95](../../src/components/ImportRecipeModal.jsx)) reports counts **and which format branch ran** (`SOURCE_LABELS`, [:11](../../src/components/ImportRecipeModal.jsx)).

**Parser.** [recipeImport.js](../../src/lib/recipeImport.js) is a pure function — string in, `{ recipe, source, warnings, error }` out; no React, no network, no Supabase. `parseRecipeImport` ([:401](../../src/lib/recipeImport.js)) tries formats strictest-first:

1. Guards: empty and oversized input fail fast.
2. Starts with `{`/`[` → `JSON.parse`; a Recipe node found anywhere in the JSON (bounded recursive search `findRecipeNode` [:183](../../src/lib/recipeImport.js) — covers `@graph`, `mainEntity`, arrays) → `mapJsonLd` ([:218](../../src/lib/recipeImport.js)). Else the own-export shape (blob or single recipe) → `mapExportRecipe` ([:244](../../src/lib/recipeImport.js)). Broken JSON is *rejected with a message*, not parsed as text — braces make terrible ingredients.
3. Contains `<script` → mine `application/ld+json` blocks out of pasted page source (`extractLdJsonBlocks` [:375](../../src/lib/recipeImport.js)) and retry each as JSON-LD. A page with no recipe data is rejected ("copy the recipe text itself").
4. Everything else → plain-text heuristics, `mapText` ([:272](../../src/lib/recipeImport.js)).

All branches converge on one normalized recipe object and pass through `finalize` ([:383](../../src/lib/recipeImport.js)), which drops empty rows, rejects a fully-empty parse, and adds the standard "No steps detected"-style warnings once, for every branch.

**Ingredient lines** (shared by the text and JSON-LD paths — JSON-LD ingredients are just strings like `"2 cups flour"`): `parseIngredientLine` ([:138](../../src/lib/recipeImport.js)) strips bullets, moves a short trailing parenthetical into `notes`, then peels a leading quantity (`peelQuantity` [:105](../../src/lib/recipeImport.js) — tries two tokens before one so `"1 1/2"` beats `"1"`, and delegates the is-this-a-quantity judgment to `parseQuantity`) and a leading unit (`peelUnit` [:121](../../src/lib/recipeImport.js) — exact-word lookup over `UNIT_LOOKUP` [:31](../../src/lib/recipeImport.js), with a following `"of"` consumed).

**Filling.** `applyImport` ([CreateRecipe.jsx:363](../../src/components/CreateRecipe.jsx)) gates on the dirty check ([:348](../../src/components/CreateRecipe.jsx)) with a native confirm, then hands the recipe to the *same setters hand-typing uses* — `ingredientsToRows` ([:369](../../src/components/CreateRecipe.jsx)) resurrects section labels as editable section rows — flips **Make Public** off, and toasts why. Save is untouched: an imported recipe goes through the identical Stage 21 pipeline as a hand-typed one, which is why the feature needed zero schema change.

## Dependencies, and what each is doing for you

- **parseQuantity** (`src/lib`) — the single oracle for "does this token count as a quantity," plus the number→`"½"` display round-trip. Without it: your own mixed-number/fraction/glyph regexes, kept in sync with the save path by hand — drift means a paste that *imports* but won't *save*.
- **measurementUnits** (`src/lib`) — the canonical unit list + aliases. Import builds its own exact-word `Map` view over it, deliberately not reusing the autocomplete's substring `matchUnits` (as a substring, `"c"` matches half the dictionary). Without it: a second hand-maintained alias table that inevitably diverges from the combobox's.
- **ingredientSections** (`src/lib`) — `ingredientsToRows` is the whole bridge from parsed data to the Stage 21 editor row-model. Without it: re-deriving section-row reconstruction that's already written and spec'd.
- **`JSON.parse`** (platform) — the entire structured path. Its strictness is used as a *feature*: throwing on malformed input is the signal that routes a paste to rejection instead of garbage text-parsing. Hand-rolling a JSON parser is a project in itself.
- **Regular expressions** (platform) — the heuristic engine: headers, bullets, numbered steps, servings lines, ld+json extraction. Without them: character-by-character scanners for each.
- **React controlled state** (platform) — form-as-preview only works because every field is already state; "filling the form" is nothing but calling setters. In an uncontrolled form you'd be imperatively poking DOM values.
- **react-hot-toast** (npm, existing) — the one-line explanation for the private-by-default flip.
- **Notably absent: Supabase.** The importer never touches network or database. That single decision is why v1 shipped with no migration, no server code, and no new failure modes — the riskiest part (parsing arbitrary text) is quarantined in a pure function with 21 specs.

## Pattern: Content sniffing

**Also known as:** format detection, format negotiation by inspection, polyglot input handling.
**Problem it solves:** one input channel, several possible formats, and no trustworthy declaration of which one you were given.
**The recipe:**
1. Order candidate formats from most structured (cheap to verify, hard to false-positive) to loosest.
2. Use cheap discriminators (first character, magic substrings) to decide which strict parse to attempt.
3. Let strict parsers fail hard, and decide per tier: reject with a message, or fall through to the next candidate.
4. Reserve the loosest heuristic as the final fallback — and make it *degrade* (partial result + warnings) rather than fail.
5. Report which branch ran; users can't trust output if they can't see how their input was read.

**Here:** steps 1–3 are the tier ladder in `parseRecipeImport` ([recipeImport.js:401](../../src/lib/recipeImport.js)); step 4 is `mapText`'s warnings-not-errors posture; step 5 is the `source` field surfaced as "Detected from …" ([ImportRecipeModal.jsx:95](../../src/components/ImportRecipeModal.jsx)).
**Reach for it again when:** file-upload handlers, webhook payloads of mixed provenance, a CLI arg that could be a path or inline JSON. **Not when:** the format is declared and trustworthy (a content-type header, an extension you control) — sniffing there adds ambiguity where a contract already exists.

## Pattern: Normalize at the boundary

**Also known as:** canonical data model, adapter layer, anti-corruption layer (the DDD name).
**Problem it solves:** N input formats × M consumers means N×M conversion paths — unless every input converges to one internal shape at the edge, giving N mappers + M consumers instead.
**The recipe:**
1. Define the internal shape from the *consumer's* needs, not from any source's shape.
2. Write one mapper per source; every convention translation (types, `NULL` vs `''`, ordering) happens inside the mapper, at the edge.
3. Run shared validation/finalization *after* the mappers, so the rules exist once.
4. Keep the consumer source-blind — it should be impossible to tell, from the internal shape, which mapper produced it.

**Here:** the normalized recipe object mirrors CreateRecipe's state — `quantity` is a *display string* like `"1 ½"` precisely because the consumer is a text input, not a NUMERIC column. Steps 2–3 are `mapJsonLd`/`mapExportRecipe`/`mapText` ([recipeImport.js:218](../../src/lib/recipeImport.js), [:244](../../src/lib/recipeImport.js), [:272](../../src/lib/recipeImport.js)) feeding `finalize` ([:383](../../src/lib/recipeImport.js)); step 4 is `applyImport`, which cannot tell the branches apart. The same rule fixed a real bug the same day on a *different* boundary: DB→form hydration mapping `NULL` units to `''` ([CreateRecipe.jsx:107](../../src/components/CreateRecipe.jsx)) — untranslated conventions leaking across a boundary is exactly what this pattern prevents.
**Reach for it again when:** a second data source feeds an existing feature (that's the moment to introduce the internal shape). **Not when:** one source, one consumer — a mapper layer there is indirection with no payoff yet.

## Pattern: Line-oriented zone state machine

**Also known as:** modal parser, line-based state machine; lexer modes are the compiler-theory cousin.
**Problem it solves:** semi-structured text where a line's meaning depends on *where you are*, not just what it says — `"1 cup flour"` is an ingredient inside the ingredient block and noise inside a paragraph.
**The recipe:**
1. Enumerate the zones (states) that match the document's regions.
2. Define transitions: explicit markers (header lines) *plus* implicit shape-based flips (a numbered line, a long prose line, a bulleted line).
3. Process each line under the current zone's rules; give unrecognized lines a zone-appropriate default rather than an error.
4. Buffer multi-line units, and flush the buffer on every transition *and* at end-of-input — the forgotten final flush is the classic bug of this pattern.

**Here:** `mapText` ([recipeImport.js:272](../../src/lib/recipeImport.js)) — the `zone` variable ([:285](../../src/lib/recipeImport.js)) walks `start → description → ingredients → steps` (with a `skip` zone for Notes/Nutrition blocks); explicit transitions are the header regexes ([:38–41](../../src/lib/recipeImport.js)); implicit flips are the numbered-step match ([:320](../../src/lib/recipeImport.js)) and the ≥90-char prose rule ([:359](../../src/lib/recipeImport.js)); the paragraph buffer is `stepBuffer` with `flushStep` ([:287](../../src/lib/recipeImport.js)) called on transitions and once after the loop.
**Reach for it again when:** parsing logs, changelogs, or any human-formatted copy-paste. **Not when:** the input has a real grammar (parse it properly — JSON, a parser library) or is regular enough for a single regex pass.

## Do it yourself next time

1. Write the **normalized shape first**, derived from what the consumer (form, table, API) actually needs — before any parsing code.
2. List the input formats you'll accept; order them strictest → loosest; pick a cheap discriminator for each.
3. Build the strict mappers first — they're small, exact, and easy to spec.
4. Build the text heuristic last, as a zone state machine, against a fixture file of real pastes (collect ugly real-world samples before coding).
5. Keep the whole parser a **pure function** so the specs need no DOM, network, or mocks — then wrap the thin UI (textarea → preview → apply) around it.
6. Verify in two layers: unit specs per branch and failure mode, then one end-to-end paste in the browser — and check the consumer can't tell which branch filled it.

## Further reading

- [MDN — `JSON.parse`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) — its strictness is what makes "reject broken JSON instead of text-parsing it" possible.
- [schema.org — Recipe](https://schema.org/Recipe) — the vocabulary behind the JSON-LD tier; skim `recipeIngredient` / `recipeInstructions` / `recipeYield` to see exactly what the mapper consumes.
