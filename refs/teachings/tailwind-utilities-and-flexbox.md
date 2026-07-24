# `inline-flex items-center gap-2` — how Tailwind utilities lay out an icon + label

*Taught: 2026-07-24 · Source: working-tree edit to [App.jsx:1367](../../src/App.jsx#L1367) (branch `history`) · Patterns: utility-first CSS · flex formatting context · design tokens → utilities*

## The problem

The "New Recipe" button holds two children — a notebook-pen SVG icon and the
text "New Recipe" — and they were stacking vertically instead of sitting on one
line. The fix was three utility classes: `inline-flex items-center gap-2`. This
lesson explains *why those three classes*, what Tailwind is actually doing to the
HTML, and how a class string in JSX becomes pixels on screen.

## How it works

### The change

The button lives behind a login gate at [App.jsx:1365](../../src/App.jsx#L1365)
(`{session && (…)}`), so it renders only when signed in. Its two children are the
inline SVG at [App.jsx:1368–1373](../../src/App.jsx#L1368) and the bare text node
`New Recipe` at [App.jsx:1374](../../src/App.jsx#L1374). The edited opening tag at
[App.jsx:1367](../../src/App.jsx#L1367) now reads:

```
className="inline-flex items-center gap-2 px-5 py-2.5 bg-rust hover:bg-rust-dark
           text-paper font-semibold rounded-md transition-colors flex-shrink-0"
```

Only the first three tokens are the fix. The rest (`px-5 py-2.5` padding,
`bg-rust`/`text-paper` colors, `rounded-md`, `transition-colors`, `flex-shrink-0`)
were already there and are unrelated to the layout bug.

### Why it was stacking — the root cause is a base reset, not your markup

This is the non-obvious part. A raw `<button>` lays its children out in **normal
flow**, and in normal flow an inline SVG followed by text sits on the same line.
So why did they stack?

Because `@import "tailwindcss"` at [index.css:1](../../src/index.css#L1) pulls in
Tailwind's **Preflight** base reset, and Preflight sets:

```css
svg { display: block; vertical-align: middle; }
```

A `display: block` element is a full-width box that forces a line break after
itself. So the icon became a block that pushed "New Recipe" onto the next line —
the stacking. Nothing in *your* markup asked for that; a dependency's global reset
changed the default behavior of every `<svg>` on the page. (Preflight does this on
purpose — block SVGs avoid the mysterious few pixels of descender space that inline
replaced elements leave under them. The trade-off is exactly this: you must opt
icons back into a row.)

### Why `inline-flex items-center gap-2` fixes it

`inline-flex` makes the **button itself** a flex container. That changes the
formatting context of its *children*: the block SVG and the text node are no longer
in normal flow — they become **flex items** placed side by side along the flex
**main axis** (horizontal by default). A block-level child inside a flex container
is laid out as a flex item, so `display: block` on the SVG stops forcing a line
break. The three classes each map to exactly one CSS declaration:

| Class | CSS it generates | Effect |
|---|---|---|
| `inline-flex` | `display: inline-flex` | button becomes a flex container; children become a horizontal row of flex items |
| `items-center` | `align-items: center` | centers the row on the **cross axis** (vertical) — icon and text share a centerline |
| `gap-2` | `gap: 0.5rem` (8px) | space *between* the two items, without margins on either |

`inline-flex` vs `flex`: both establish the same flex context for the children; they
differ only in the container's own *outer* display — `inline-flex` stays inline-level
(the button hugs its content and sits in a text line), `flex` is block-level (fills
its line). For a button you want shrink-to-fit, so `inline-flex` is the conventional
pick. (Here the button is also a flex *item* of the header row that closes at
[App.jsx:1377](../../src/App.jsx#L1377), which is why `flex-shrink-0` is present — but
that governs the button's size within the header, a separate concern from laying out
its contents.)

### From `className` string to pixels — the DOM render pipeline

The concept the args asked about — "the HTML it impacts, such as DOM rendering." Here
is the whole path the three classes travel:

1. **Build.** `@vitejs/plugin-react` compiles the JSX `className="…"` into a plain
   `React.createElement('button', { className: '…' })`. Separately,
   `@tailwindcss/vite` scans your source for class-name strings and generates a
   stylesheet containing one rule per utility it found (`.inline-flex{display:inline-flex}`,
   `.items-center{align-items:center}`, `.gap-2{gap:.5rem}`, …). Utilities you never
   use are never emitted.
2. **DOM.** At runtime React writes the string to the element's `class` **attribute**.
   `className` is React's prop name; `class` is the real HTML/DOM attribute — they're
   the same thing, renamed because `class` is a reserved word in JS.
3. **CSSOM.** The browser parses the generated stylesheet into the CSS Object Model
   and matches selectors to DOM nodes. `.inline-flex` matches the button; the matched
   declarations merge into the button's **computed style**.
4. **Layout (reflow).** With `display: inline-flex` computed, the layout engine runs
   the flex algorithm: measure each item, place them along the main axis, align on the
   cross axis, insert the `gap`. This is the step that actually decides "side by side"
   vs "stacked."
5. **Paint + composite.** The engine fills in pixels — background, text, the SVG's
   strokes — and composites layers to the screen.

Worth knowing for later: a class change that alters geometry (`inline-flex`, `gap-2`,
padding) forces a **reflow** (re-run step 4); a class change that only alters color
(`bg-rust` → `hover:bg-rust-dark`) skips layout and only repaints — which is why hover
color swaps are cheap and layout-affecting animations are not.

## Dependencies, and what each is doing for you

- **Tailwind CSS v4** (`tailwindcss`, [package.json:32](../../package.json#L32)) — scans
  your markup for utility class names and generates a single-declaration CSS rule for
  each. It also ships **Preflight**, the opinionated cross-browser base reset (the
  `svg { display: block }` above lives here). Without it: you'd hand-author every rule
  in a stylesheet, invent a naming scheme (BEM) to keep selectors from colliding, and
  maintain your own reset — and dead rules would pile up because nothing tree-shakes CSS
  you stopped using.
- **`@tailwindcss/vite`** (build tooling, [package.json:24](../../package.json#L24)) —
  the Vite plugin that runs Tailwind inside the dev server and production build: it does
  the source scan, injects the generated CSS with hot-reload in dev, and emits only the
  utilities you actually reference. Without it: run the Tailwind CLI or a PostCSS pipeline
  as a separate watch process and wire the output stylesheet in by hand.
- **Flexbox** (CSS platform feature, implemented by the browser's layout engine) — the
  real layout algorithm. `inline-flex` / `items-center` / `gap-2` are thin one-to-one
  aliases over the native `display`, `align-items`, and `gap` properties; Tailwind adds no
  layout behavior of its own. Without it: align an icon with text via `inline-block` +
  `vertical-align` fiddling, or floats + a clearfix — both fussier and worse at vertical
  centering.

## Pattern: utility-first CSS

**Also known as:** atomic CSS, functional CSS.
**Problem it solves:** in conventional CSS, every component invents a named class
(`.new-recipe-button`) whose rule lives in a separate file; the stylesheet grows
unboundedly, names collide, and nobody dares delete a rule for fear something still
uses it. Utility-first inverts this: style with a fixed vocabulary of tiny,
single-purpose classes composed directly in the markup.
**The recipe:**
1. Decompose the visual into independent decisions (display, alignment, spacing,
   color, radius).
2. Apply one predefined single-declaration class per decision, in the markup.
3. Let the toolchain emit only the classes actually referenced (no dead CSS).
4. Reach for a named/extracted class only when the same long combination repeats
   enough to hurt.
**Here:** the button's whole appearance is a *list* of atomic classes on one element
at [App.jsx:1367](../../src/App.jsx#L1367) — layout (`inline-flex items-center gap-2`),
box (`px-5 py-2.5 rounded-md`), color (`bg-rust text-paper`), state
(`hover:bg-rust-dark`), motion (`transition-colors`). No `.new-recipe-button` rule
exists anywhere.
**Reach for it again when:** styling components in an app you control end-to-end and you
value locality (style is visible right at the element) and dead-code elimination.
**Not when:** authoring a reusable library meant to be themed by *others*, or a document
whose styling should live entirely outside the content — there a named-class stylesheet
is the better contract.

## Pattern: flex formatting context (main axis / cross axis)

**Also known as:** flexbox layout; "flex container / flex items."
**Problem it solves:** you have a set of sibling boxes and you want them arranged along
one axis — a row or a column — with control over how they're aligned on the *other* axis
and how space between them is distributed. Normal flow can't center-align a row or space
items without margin hacks.
**The recipe:**
1. Put `display: flex` (or `inline-flex`) on the **parent** — this is what makes its
   direct children flex items. (Alignment classes on the parent do nothing until it's a
   flex container.)
2. Pick the **main axis** with `flex-direction` (default `row` = horizontal).
3. Align items on the **cross axis** with `align-items` (`items-center` = centered).
4. Distribute main-axis space with `justify-content`, and add inter-item space with `gap`.
**Here:** step 1 is `inline-flex` on the button; the main axis is the default row, so the
SVG and text line up horizontally; step 3 is `items-center` (vertical centering of icon vs
text); step 4 is `gap-2` (8px between them). This exact "icon + label on one centered row"
is the single most common flex use in a UI.
**Reach for it again when:** aligning an icon with text, building a toolbar/nav row, or
centering one thing inside a box (`flex items-center justify-content-center`).
**Not when:** you need true two-dimensional placement (rows *and* columns aligned to a
shared grid) — that's CSS Grid's job, not flex's.

## Pattern: design tokens → generated utilities

**Also known as:** design tokens, theme scale, single-source-of-truth theming.
**Problem it solves:** a palette (or type scale, spacing scale) should be defined once, in
one place, yet be usable as ergonomic utilities all over the markup — and changing the
value in that one place should ripple everywhere with no find-and-replace.
**The recipe:**
1. Declare each brand value as a named token in one canonical location.
2. Have the framework mint utilities from those names automatically.
3. Reference the utilities in markup; never hardcode the raw value (`#b06452`) inline.
4. Retheme by editing the token, not the call sites.
**Here:** the tokens live in the `@theme` block at
[index.css:6–17](../../src/index.css#L6) — `--color-rust: #b06452`,
`--color-paper: #f2e9e4`, etc. Tailwind v4 turns each `--color-*` into a family of
utilities (`bg-rust`, `text-rust`, `border-rust`, `hover:bg-rust-dark`), which is why the
button can say `bg-rust text-paper` without a hex code in sight. This is the
"rustic-paper" system documented in [COSMETICS.md](../COSMETICS.md); flipping a token
recolors every element that uses it.
**Reach for it again when:** any value is shared across many components and might change as
one decision (colors, spacing, fonts, breakpoints).
**Not when:** a value is genuinely one-off and local — a single magic offset in one
component doesn't earn a global token.

## Deeper pass: what makes Tailwind *Tailwind* (v4 particulars vs. normal CSS)

The three patterns above are the "what." This section is the "how it's actually
implemented," and where it diverges from hand-writing CSS. This project runs
**Tailwind v4** ([package.json:32](../../package.json#L32)), which reimplemented much
of this on top of modern CSS primitives — so several particulars below are v4-specific.

### 1. It's a compiler, not a library — and that dictates how you must write classes

Normal CSS ships every rule you author whether or not it's used. Tailwind inverts this:
it **scans your source as plain text**, extracts anything that looks like a class name,
and emits one rule per class it saw. It does **not** parse or understand your JS/JSX — it
pattern-matches strings. Two hard consequences fall out of that:

- **Class names must appear as complete literal strings.** `columns-${n}` or
  `` `bg-${color}` `` will never generate a rule, because the full string never exists in
  the source for the scanner to find. The repo respects this correctly: the responsive
  column classes at [App.jsx:977–985](../../src/App.jsx#L977) are built in a ternary as
  **whole literal strings** (`'columns-2 md:columns-4 xl:columns-4'`), never assembled from
  fragments; and the scroll-FAB at [App.jsx:1033](../../src/App.jsx#L1033) keeps
  `'opacity-100'` / `'opacity-0 pointer-events-none'` as complete literals inside the
  template interpolation. That discipline is *required by the compiler*, not a style choice.
- **There is no runtime.** The output is a static stylesheet resolved entirely at build.
  Compare the neighbors: inline `style=""` can't express `:hover` or media queries;
  CSS-in-JS (styled-components/emotion) can, but injects styles during render at a JS cost.
  Tailwind gets the full power with zero runtime because everything is decided by the scan.
  In v4 that scan/emit is the Rust **"Oxide"** engine plus **Lightning CSS** (parsing,
  nesting, vendor-prefixing, minification), which is why v4 builds are fast and why nested
  CSS "just works" in `index.css`.

### 2. The cascade is deliberately flattened — source order wins, not specificity

In hand CSS you constantly fight specificity: `#sidebar .card .title` quietly beats a
later `.title` rule. Tailwind's design goal is to make that fight disappear: **almost every
utility is a single-class selector**, so they nearly all sit at the same specificity
`(0,1,0)`. When two utilities set the same property, the tie breaks by **generated source
order** — the order *Tailwind* emits them in, which is deterministic and **not** the order
you wrote them in the `class` attribute. So `class="p-2 p-4"` and `class="p-4 p-2"` render
**identically** (whichever Tailwind emits later wins) — a genuine gotcha with no analog in
normal CSS, where the last-written declaration wins. v4 also wraps output in native
`@layer` blocks (`theme`, `base`, `components`, `utilities`), so any utility beats any
Preflight base rule regardless of specificity — that layering, not `!important`, is what
guarantees `bg-rust` always overrides the base reset.

### 3. Variants compile to real selectors / at-rules — the thing inline styles can't do

This is the deepest "why Tailwind exists at all" point. A `style=""` attribute physically
cannot hold `:hover` or `@media`. Tailwind's **variant prefixes** compile to genuine CSS
constructs at build time, letting you write states and breakpoints *inline in the class
attribute*:

- `hover:bg-rust-dark` → `.hover\:bg-rust-dark:hover { … }`. Note the `:` inside the class
  name is **escaped** to `\:` in the selector — that escaping is how an ordinary class name
  can encode a pseudo-class.
- `md:columns-4` ([App.jsx:977](../../src/App.jsx#L977)) → the rule wrapped in
  `@media (min-width: 48rem) { … }`.
- `placeholder:text-rose/60` ([App.jsx:1256](../../src/App.jsx#L1256)) →
  `.…::placeholder`; `focus-visible:ring-2` ([App.jsx:1309](../../src/App.jsx#L1309)) → the
  `:focus-visible` pseudo-class. Same machinery covers `dark:`, `group-*`, `peer-*`,
  container queries, and more — each is a compiled selector/at-rule, stackable
  (`sm:hover:…`). You are effectively writing media queries and pseudo-selectors from the
  markup, which is exactly what neither inline styles nor CSS variables can give you.

### 4. Escape hatches: arbitrary values, and v4's *computed* scales

The scales (spacing, color, type) are a **constraint** — `p-4` is `1rem`, `p-5` is
`1.25rem`, deliberately quantized to nudge consistency. When you must leave the scale, the
JIT mints a one-off rule from a bracketed value: `min-h-[44px]`, `text-[10px]`,
`max-h-[60vh]`, `left-[18px]`, `min-w-[18px]` are all real in this repo
([AddToCookbookButton.jsx:119](../../src/components/AddToCookbookButton.jsx#L119),
[App.jsx:1341](../../src/App.jsx#L1341)). Two related v4 particulars:

- **The spacing scale is now dynamic, not enumerated.** `top-18`, `top-32`, `top-46`
  ([App.jsx:1050](../../src/App.jsx#L1050), [1079](../../src/App.jsx#L1079),
  [1109](../../src/App.jsx#L1109)) aren't hand-listed keys — v4 computes spacing utilities
  as `calc(var(--spacing) * N)`, so any integer step resolves without config. In v3 those
  exact classes wouldn't exist unless you'd added them.
- **Arbitrary *properties*** go further: `[mask-type:luminance]`-style brackets can emit a
  declaration for a property Tailwind has no utility for at all.

### 5. Opacity modifiers are `color-mix()`, not an rgba you pre-mixed

`bg-paper-shade/90`, `bg-tan/40`, `ring-rust/40`, `bg-ink/20` (all real — e.g.
[App.jsx:1033](../../src/App.jsx#L1033), [1338](../../src/App.jsx#L1338)) use the `/N` slash
to set alpha. In v4 `bg-tan/40` compiles to
`background-color: color-mix(in oklab, var(--color-tan) 40%, transparent)` — a native
CSS function doing the blend, in the perceptual **oklab** space. In hand CSS you'd either
pre-compute an `rgba(...)` or maintain a second opacity variable; the `/N` syntax and the
`color-mix` implementation are entirely Tailwind's. (v3 did the same effect with a
`--tw-bg-opacity` custom-property hack — the v4 rewrite onto `color-mix` is a concrete
"unique reimplementation" you can point to.)

### 6. CSS-first config: one `@theme` block is the whole configuration — and tokens live a double life

There is **no `tailwind.config.js`** in this project; configuration *is* CSS. The `@theme`
block at [index.css:6–17](../../src/index.css#L6) is the entire theme. Each token there is
exposed **twice**:

1. as utilities — `--color-rust` mints `bg-rust`, `text-rust`, `border-rust`,
   `hover:bg-rust-dark`, used all over the JSX; and
2. as a real `:root` custom property — so plain CSS can reference `var(--color-rust)`.

The repo depends on *both* halves at once: JSX writes `bg-rust text-paper`, while
hand-authored rules in the same stylesheet reach for the variable directly — e.g. the
`.visibility-toggle` rules use `var(--color-paper-shade)`, `var(--color-ink)`,
`var(--color-paper)` ([index.css:1210](../../src/index.css#L1210),
[1227–1229](../../src/index.css#L1227)). One token definition, two consumption styles, no
duplication — a v4-specific bridge between the utility world and ordinary CSS.

### 7. Where this project draws the line (and why it avoids `@apply`)

Tailwind offers `@apply` to pull utilities into a named CSS rule
(`.btn { @apply inline-flex items-center gap-2; }`). A grep shows this repo uses it
**zero times** — a deliberate architecture worth copying: **atomic utilities in JSX** for
the ergonomic 90% (layout, spacing, color, state on ordinary components), and
**hand-written CSS with `var(--color-*)`** in `index.css` for the artful 10% — the
skeuomorphic leather book covers, brass OAuth plates, and paper-grain gradients
([index.css](../../src/index.css)) that would be unreadable as 60-class strings. `@apply`
tempts you to recreate the named-class stylesheet Tailwind was meant to replace; sidestepping
it keeps the two worlds cleanly separated instead of blurred into a third hybrid.

## Do it yourself next time

When an icon and label won't sit on one line, work through this in order:

1. **Check the container first.** Alignment/gap classes do nothing unless the *parent*
   is a flex (or grid) container. The fix almost always goes on the parent, not the
   children.
2. **Suspect the base reset.** If an inline element (SVG, `img`, `video`) is behaving
   like a block, it probably *is* one — Tailwind's Preflight sets those to
   `display: block`. That's a feature; you opt back into a row with flex.
3. **Apply the row trio:** `inline-flex` (or `flex`) on the parent → `items-center` to
   center on the cross axis → `gap-N` for spacing. Prefer `gap` over margins on the
   children — it only spaces *between* items and never adds a stray edge margin.
4. **`inline-flex` vs `flex`:** inline-level, content-hugging (buttons, chips) → `inline-flex`;
   block-level, fills-its-line (a full-width bar) → `flex`.
5. **Verify.** Confirm on the rendered element that computed `display` is `inline-flex`
   and the children share a vertical centerline. In this project the button is
   login-gated, so sign in locally to see it, or inspect the element's computed style in
   devtools.

## Further reading

- MDN — [Basic concepts of flexbox](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox) (main vs cross axis, container vs items).
- Tailwind CSS — [Preflight](https://tailwindcss.com/docs/preflight) (the base reset, including the block-level media/SVG rule) and [Theme variables / `@theme`](https://tailwindcss.com/docs/theme) (v4 token-to-utility generation).
- MDN — [How CSS works: the render pipeline](https://developer.mozilla.org/en-US/docs/Web/Performance/How_browsers_work) (DOM → CSSOM → layout → paint), and [`align-items`](https://developer.mozilla.org/en-US/docs/Web/CSS/align-items) / [`gap`](https://developer.mozilla.org/en-US/docs/Web/CSS/gap).
- Tailwind CSS — [Functions & directives](https://tailwindcss.com/docs/functions-and-directives) (`@theme`, `@apply`, `@layer`), [Hover, focus & other states](https://tailwindcss.com/docs/hover-focus-and-other-states) (how variants compile), and [Adding custom styles / arbitrary values](https://tailwindcss.com/docs/adding-custom-styles).
- MDN — [Cascade layers (`@layer`)](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer) and [`color-mix()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix) — the two native primitives v4's cascade control and opacity modifiers are built on.
