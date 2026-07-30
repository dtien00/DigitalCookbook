# Testing pure functions with Vitest — how to design the suite

*Taught: 2026-07-28 · Source: Stage 20 §3.1 pure-lib sweep (`stage-20-lib-test-sweep`), worked example `src/lib/scaleQuantity.test.js` · Patterns: characterization testing · equivalence partitioning + boundary values · round-trip (inverse) testing*

## The problem

Five `src/lib/` modules ship real logic — parsing quantities, scaling servings, formatting timer durations, week math, unit autocomplete — with **no tests**, while CI already fails the build on a red suite. The sweep adds specs for all five. The transferable question this lesson answers isn't "what does the answer key look like" — it's **how do you decide what to assert** when you sit down in front of an untested pure function? That skill is what lets you write the tests yourself.

A pure function (same inputs → same output, no side effects) is the easiest thing in a codebase to test: no database, no DOM, no mocks, no `await`. The whole game is *choosing the right inputs*. This doc is the method plus a filled-in-the-blanks skeleton for the four remaining libs.

## How it works — deriving a spec by reading the source

The method has four moves. Watch them run against `scaleQuantity` (already done this session):

**1. List every branch and every `return`.** Read the function top to bottom and write down each exit. [`scaleQuantity.js`](../../src/lib/scaleQuantity.js) has five:
- line 6 — falsy guard: `if (!quantity) return quantity` (returns the *input*, not a string)
- line 10 — whole number: `return String(whole)`
- line 13 — fraction, two shapes: bare (`whole === 0`) vs. `${whole} ${frac}`
- line 14 — no-glyph fallback: `return String(raw)`

Each distinct `return` is at least one test. If you never hit a line, you never tested it.

**2. Partition the inputs.** For each branch, ask "what *class* of input lands here, and what's a fair representative?" `0.5` represents "renders a fraction"; `0.25 / 0.75 / ⅓ / ⅔` are the other members of the fraction class worth pinning because the lookup table is data, not logic. `2×2` represents "whole result."

**3. Attack the boundaries.** Bugs cluster at the edges *between* classes. For `scaleQuantity` the edges are: `whole === 0` (bare `½`) vs. `whole > 0` (`1 ½`) — [scaleQuantity.js:13](../../src/lib/scaleQuantity.js); a decimal with *no* glyph match (`2.1 → "2.1"`, not `"2 …"`); and rounding (`0.333×3 = 0.999 → "1"`).

**4. Structure each test as Arrange–Act–Assert.** Set up the input, call the function, assert the output — one logical assertion per `it`. See [`scaleQuantity.test.js`](../../src/lib/scaleQuantity.test.js): the 8 tests map one-to-one onto the branches + boundaries above. It went green on the first run precisely because the outputs were *read off the source*, not guessed.

That's the loop you'll repeat four more times: **branches → representatives → boundaries → AAA.**

## Dependencies, and what each is doing for you

- **Vitest** (`vitest run` via `npm test`) — the test runner + assertion library (`describe`/`it`/`expect`). It discovers `*.test.js` files, executes them in a Node environment (no browser needed for pure libs — that's the payoff), catches thrown assertion errors, and reports pass/fail with a colored diff of expected vs. actual.
  *Without it:* you'd hand-roll a runner (find files, run each, try/catch), an assertion function (`if (!Object.is(a, b)) throw`), a reporter, and a non-zero exit code so CI notices. Vitest is ~a day of plumbing you don't write — and its `toBe` (identity) vs. `toEqual` (deep) distinction is a correctness detail you'd have to get right yourself.
- **The pure-function property itself** (not a package, but the load-bearing "dependency") — because these libs touch no I/O, the test needs zero setup: no Supabase mock, no `jsdom`, no fake timers. That absence *is* the feature. The moment a function reads the clock or the network, you owe a mock; these don't, so you don't.

## Pattern: Characterization testing

**Also known as:** behavior pinning, golden-master testing, "approval" testing (loosely).
**Problem it solves:** you have working, shipped code with no tests, and you're about to refactor near it (Stage 20 alone plans a Vitest 3 bump and a `useLikes` rewrite). You want a net that screams if behavior *changes*, without first deriving what behavior *should* be from a spec.
**The recipe:**
1. Treat the current output as the source of truth — you're documenting reality, not judging it.
2. Feed representative inputs, observe outputs, and write assertions that lock those outputs in.
3. When an assertion surprises you, decide: is it a latent bug (fix the code, separately) or an intended quirk (pin it, add a comment saying so)?
4. Now refactor freely — any behavior drift turns the suite red.
**Here:** [`scaleQuantity.test.js`](../../src/lib/scaleQuantity.test.js) pins quirks on purpose — `2.1 → "2.1"` (not split into whole+fraction) and `null → null` (guard returns the input's type, not a string). Neither is obviously "right"; both are the current contract, so both get a test with a comment.
**Reach for it again when:** adding tests to legacy/untested code before changing it. **Not when:** you're doing test-driven development on *new* code — there the test encodes the intended spec first, and the code follows.

## Pattern: Equivalence partitioning + boundary-value analysis

**Also known as:** equivalence classes / input-domain partitioning (Myers, *The Art of Software Testing*); BVA for the boundary half.
**Problem it solves:** the input space is effectively infinite (`parseQuantity` accepts any string) and you can't test every value. Which finite handful actually exercises the logic?
**The recipe:**
1. Partition the input domain into classes whose members the function treats *the same way* (all "simple fractions", all "empty inputs", all "non-strings").
2. Test **one representative per class** — a second member of the same class adds cost, not coverage.
3. Then add **boundary values**: the exact edges where behavior flips — zero, empty, the max, one-past-the-max, the off-by-one seam.
4. Include representatives of the *invalid* classes too (garbage in → your defined "fail" out, e.g. `null`).
**Here (preview of the skeletons below):** `parseDurationToMs` classes = {non-string, empty, 1-part, 2-part, 3-part, >3-part-invalid, non-digit-invalid, zero-total}; boundaries = exactly-3 vs. 4 colon segments ([parseDuration.js:18](../../src/lib/parseDuration.js)) and `totalMs > 0` flipping at zero ([parseDuration.js:35](../../src/lib/parseDuration.js)).
**Reach for it again when:** any function with a large or open input domain — parsers, validators, formatters, permission checks. **Not when:** the input is a tiny closed set (an enum of 3 values) — just test all of them.

## Pattern: Round-trip (inverse) testing

**Also known as:** there-and-back / inverse-property testing; a gateway to property-based testing (fast-check, QuickCheck).
**Problem it solves:** two functions are inverses (parse ↔ format, encode ↔ decode, serialize ↔ deserialize). Testing each in isolation misses whether they actually agree at the seam.
**The recipe:**
1. Identify the inverse pair `f` and `g` where `g(f(x))` should recover `x` (or a normalized form of it).
2. Assert the composition returns the original for representative `x` values.
3. Mind the lossy cases — rounding or normalization means the round-trip lands on a *canonical* form, not the literal input; assert against that.
**Here:** two of the four remaining libs are literal inverse pairs — `parseDurationToMs` ↔ `formatMs`, and `parseQuantity` ↔ `quantityToDisplay`. `formatMs(parseDurationToMs("10:30"))` should give `"10:30"`; `quantityToDisplay(parseQuantity("1 ½"))` should give `"1 ½"`. But `parseQuantity("1.50")` → `1.5` → `quantityToDisplay` → `"1 ½"` (canonical, lossy) — a great case to pin.
**Reach for it again when:** you ship a matched encode/decode or read/write pair. **Not when:** there's no inverse — a one-way hash or a lossy summarizer has nothing to round-trip against.

---

## The exercise — skeletons for the four remaining libs

Copy each skeleton into `src/lib/<name>.test.js`, fill in the `expect(...)`, then run:

```bash
npx vitest run src/lib/parseQuantity.test.js
```

Predict each output by **reading the source** first (that's the whole skill); let the runner confirm or surprise you. When a case surprises you, that's the interesting one — decide bug vs. quirk (characterization pattern). When all four are green, `npm test` should show the full suite passing.

### 1. `parseQuantity.js` — two exports, and an inverse pair

Read [`parseQuantity.js`](../../src/lib/parseQuantity.js). `parseQuantity` (string|number|null → number|null) has these input classes — one representative each, plus the boundaries noted:

```js
import { describe, it, expect } from 'vitest'
import { parseQuantity, quantityToDisplay } from './parseQuantity'

describe('parseQuantity', () => {
    it('returns null for null/undefined input')            // parseQuantity.js:28
    it('passes a finite number straight through')          // :30  (e.g. 1.5)
    it('returns null for a non-finite number')             // :30  (NaN, Infinity)
    it('returns null for empty / whitespace-only string')  // :33
    it('reads a bare unicode fraction glyph')              // :48  ("½" → ?)
    it('adds a glyph onto a leading whole number')         // :48  ("1 ½", "1½" → ?)
    it('parses a mixed number with space or hyphen')       // :52  ("1 1/2", "1-1/2" → ?)
    it('parses a simple fraction')                         // :61  ("3/4" → ?)
    it('parses a plain integer and a plain decimal')       // :70  ("2", "1.5")
    it('returns null on a zero denominator')               // :56/:65  ("1/0", "1 1/0")  ← boundary
    it('returns null on unparseable garbage')              // :73  ("abc")
    it('tolerates surrounding whitespace')                 // "  1/2  "
})

describe('quantityToDisplay (inverse of parseQuantity)', () => {
    it('returns "" for null / 0 / non-finite')             // :80-82
    it('renders a whole number with no decimal')           // :86  (2 → "2")
    it('renders a bare glyph when whole part is 0')        // :89  (0.5 → "½")
    it('joins whole + glyph')                              // :89  (1.5 → "1 ½")
    it('falls back to a rounded decimal with no glyph')    // :92  (1.2 → "1.2")
})

describe('round-trip', () => {
    it('quantityToDisplay(parseQuantity(x)) recovers canonical form')
    // "1 ½" → 1.5 → "1 ½"  (clean) ; "1.50" → 1.5 → "1 ½"  (lossy → canonical)
})
```

Trap to notice: the glyph tables in `parseQuantity.js` and `scaleQuantity.js` are kept in sync **by hand** ([parseQuantity.js:6](../../src/lib/parseQuantity.js)) — a test that pins `⅓`/`⅔` guards against them drifting apart.

### 2. `parseDuration.js` — two exports, an inverse pair, a zero boundary

Read [`parseDuration.js`](../../src/lib/parseDuration.js). `parseDurationToMs` (string → positive-int ms | null):

```js
import { describe, it, expect } from 'vitest'
import { parseDurationToMs, formatMs } from './parseDuration'

describe('parseDurationToMs', () => {
    it('returns null for a non-string')                    // :14  (number, null, undefined)
    it('returns null for empty / whitespace')              // :16
    it('reads a bare number as minutes')                   // :23  ("10" → 600000)
    it('reads M:SS')                                       // :25  ("10:30", "0:45")
    it('reads H:MM:SS')                                    // :28  ("1:05:00")
    it('returns null for more than 3 segments')            // :18  ("1:2:3:4")  ← boundary (3 vs 4)
    it('returns null for a non-digit segment')             // :20  ("10.5", "-5", "1:5a")
    it('returns null when the total is zero')              // :35  ("0", "0:00")  ← boundary
    it('tolerates whitespace around segments')             // " 1 : 05 : 00 "  (parts are trimmed)
})

describe('formatMs (inverse of parseDurationToMs)', () => {
    it('formats sub-hour as M:SS with unpadded minutes')   // :48  (630000 → "10:30", 545000 → "9:05")
    it('formats hour-plus as H:MM:SS')                     // :47  (3900000 → "1:05:00")
    it('clamps negative input to 0:00')                    // :42
    it('rounds to the nearest second')                     // :42  (1500 → "0:02")
})

describe('round-trip', () => {
    it('formatMs(parseDurationToMs("10:30")) === "10:30"')
})
```

### 3. `week.js` — pure date math, and an immutability check

Read [`week.js`](../../src/lib/week.js). **Determinism trap:** build dates with `new Date(2026, 6, 28)` (year, *0-indexed* month, day → local July 28), **not** `new Date("2026-07-28")` (parsed as UTC midnight, can shift a day depending on your timezone — the exact bug the lib's local-time design avoids, [week.js:4](../../src/lib/week.js)).

```js
import { describe, it, expect } from 'vitest'
import { toISODate, startOfWeek, addDays } from './week'

describe('toISODate', () => {
    it('formats a date as local YYYY-MM-DD')               // :7   (new Date(2026,6,28) → "2026-07-28")
    it('zero-pads single-digit month and day')             // :9-10 (new Date(2026,0,5) → "2026-01-05")
})

describe('startOfWeek', () => {
    it('returns the same day when given a Monday')          // :16  (dow 0)
    it('walks back to Monday from a Sunday')                // :18  (Sunday → previous Monday)  ← boundary
    it('normalizes to local midnight')                      // hours/mins are 0
})

describe('addDays', () => {
    it('adds N days, crossing a month boundary')            // :23  (Jul 31 + 1 → Aug 1)
    it('handles negative N')                                // (−7 → a week earlier)
    it('does NOT mutate the input date')                    // :24  ← purity: original Date unchanged
})
```

The `does NOT mutate` test is the important one — it pins that `addDays` is pure. Snapshot the input's time before the call, assert it's unchanged after.

### 4. `measurementUnits.js` — substring ranking with a cap

Read [`measurementUnits.js`](../../src/lib/measurementUnits.js). `matchUnits(query)` (string → up to 8 label strings):

```js
import { describe, it, expect } from 'vitest'
import { matchUnits, MEASUREMENT_UNITS } from './measurementUnits'

describe('matchUnits', () => {
    it('returns the head of the list for empty/whitespace query')  // :59  (first 8 labels)
    it('matches on an alias, not just the label')                  // :63  ("tbsp" → ["tablespoon"])
    it('is case-insensitive')                                      // :58  ("TBSP" → ["tablespoon"])
    it('returns [] when nothing matches')                          // "xyz"
    it('ranks start-of-string matches before mid-string matches')  // :67  ("c": "cup"/"can" before "fluid ounce")
    it('caps results at 8')                                        // :50  (a broad query like "s")  ← boundary
})

describe('MEASUREMENT_UNITS data integrity', () => {
    it('has unique, non-empty labels')                             // optional: guards future edits
})
```

The ranking test is the subtle one — assert on **order**, not just membership (`expect(matchUnits('c')[0]).toBe('cup')` style), because the whole point of the scoring at [measurementUnits.js:67](../../src/lib/measurementUnits.js) is ordering.

## Do it yourself next time

A repeatable checklist for any pure function, no LLM required:
1. **Open the source and read it top to bottom.** List every `return` / branch on paper.
2. **Partition the inputs** into classes the function treats identically; pick one representative each.
3. **Add the boundaries** — zero, empty, max, one-past-max, the seam where a condition flips.
4. **Add the invalid classes** — what does garbage-in produce? Pin it.
5. **If there's an inverse function, add a round-trip test** (`g(f(x))`), minding lossy/canonical forms.
6. **Write each case as Arrange–Act–Assert**, one logical assertion per `it`, with a comment on any surprising/quirky expectation.
7. **Run `npx vitest run src/lib/<file>.test.js`.** Red first is fine — read the diff, decide bug vs. wrong-expectation, reconcile to green.
8. **Run the full `npm test`** to confirm you broke nothing and the new file joins the suite.

## Further reading
- [Vitest — Getting Started](https://vitest.dev/guide/) and the [`expect` API](https://vitest.dev/api/expect.html) (`toBe` identity vs. `toEqual` deep equality)
- Michael Feathers, *Working Effectively with Legacy Code* — the origin of **characterization tests** (ch. 13)
- Glenford Myers, *The Art of Software Testing* — **equivalence partitioning** and **boundary-value analysis**
