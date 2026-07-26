# SVG paths & fill-rule — reading the Kitchi logo — how it works

*Taught: 2026-07-25 · Source: `public/img/kitchi-logo-v4.svg` (working copy: `~/Downloads/kitchi-logo-v4.svg`) · Patterns: subpaths + fill-rule (even-odd), cubic-Bézier-as-line, painter's model*

## The problem
A vector logo needs to describe an irregular two-colour mark — an orange utensil/checkmark and a green window grid — in plain text that renders identically at any size. SVG does this with `<path>` elements whose `d` attribute is a string of drawing commands. The confusion this lesson clears up: **one `<path>` is not one line**, and a "straight" edge is usually not written with a straight-line command. Once you can read the structure, editing the shape (e.g. dropping the interior green grid lines) is a matter of deleting the right *subpaths* — not tracing pixels.

## How it works

The file has exactly **three `<path>` elements** ([kitchi-logo-v4.svg:3-5](../../public/img/kitchi-logo-v4.svg)), stacked in document order (later paints on top — the "painter's model"):

1. **Line 3 — the invisible master outline.** `fill="none" stroke="#fdfdfc" stroke-width="0.25"`. Its `d` starts `M0.25 0.25 … 1094.75 …` — a full ~1095×1095 square — followed by *every* logo contour repeated as inner subpaths. Because `fill="none"` it paints nothing but a near-white 0.25px hairline, and most of it (the big square) sits **outside** the `viewBox="150 50 850 975"` crop, so you never see it. This is an export artifact from whatever tool vectorised the mark — it carries the whole geometry as a reference layer. Ignore it for editing; the colour lives in paths 2 and 3.

2. **Line 4 — the orange mark.** `fill="#fc6e02"`. One outer contour (the diagonal checkmark/utensil body) plus two closed subpaths at the bottom — `M346.79 874.42…Z` and `M799.7 874.36…Z` — which are the two rounded circle ends. Those two subpaths are **holes**: with `fill-rule="evenodd"` they punch the open centres out of the round ends (so the circles read as rings, not dots).

3. **Line 5 — the green window grid.** `fill="#038615"`. This is the one you want to edit. Its `d` is:
   - **one big outer subpath** — `M795.79 166.5 … 795.79 166.5Z` — the outer silhouette of the whole green region (the window's outer edge, including the diagonal notch where the orange checkmark crosses it);
   - **followed by ~10 small rectangular subpaths** — `M592.71 217.21…Z`, `M452.97 227.5…Z`, `M311.13 237.5…Z`, `M592.82 320.58…Z`, `M453.01 324.89…Z`, `M313.25 329.5…Z`, `M453.01 427.84…Z`, `M314.85 429.94…Z`, `M316.29 526.83…Z`, `M343.65 528.26…Z`. Each is one window pane.

   Under `fill-rule="evenodd"`, the panes are **holes**. Green paint lands only where the crossing-number is odd: inside the outer silhouette **but outside every pane**. That leftover green — the outer border *plus the gaps between panes* — is exactly the grid you see. **The "interior green lines" are the mullions between the pane-holes.** They are not drawn as lines at all; they're the un-punched slivers of the fill.

### Why paths aren't 1:1 with straight/continuous lines (your first question)

Two separate reasons, both visible in line 5:

- **A single `<path>` holds many disconnected subpaths.** Every `M` (moveto) lifts the pen and starts a new subpath; every `Z` closes it. Line 5 is *one* element but *eleven* closed loops. So "path" ≠ "line" — it's a bag of loops that share one fill rule and one colour.
- **Straight edges are written as curves.** The exporter emits everything as cubic Béziers (`C`), even dead-straight segments. Look at pane `M592.71 217.21`: the left edge is `477.86 225.5C477.86 248.83 477.86 272.17 477.86 295.5` — a `C` command whose control points all share `x=477.86`, so the "curve" is a perfectly vertical line. That's why you can't map one command to one visible segment: a straight line here is a cubic whose handles are collinear. (A hand-written SVG would use `L`/`H`/`V` and be readable; a machine-exported one uses `C` for uniformity.)

## Dependencies, and what each is doing for you
- **SVG path grammar** (browser/platform, the `d` mini-language) — encodes arbitrary outlines as `M/L/C/Z` commands the renderer rasterises at any zoom. Without it: you'd ship a PNG per size, or hand-compute polygon fills yourself.
- **`fill-rule="evenodd"`** (SVG attribute) — the single switch that makes inner subpaths behave as holes, giving you the grid "for free" from one fill. Without it (`nonzero`, the default), whether a pane is a hole depends on its winding *direction* relative to the outer loop — subtler and easy to get wrong; even-odd makes "any enclosed subpath = hole" unconditional.
- **`viewBox` + painter's model** (SVG attributes / render order) — `viewBox="150 50 850 975"` crops to the logo and discards path 1's off-canvas square; document order (green after orange) decides overlap. Without it: no cropping, and you'd need explicit z-index machinery that SVG doesn't have.

## Pattern: even-odd fill with subpath holes
**Also known as:** even-odd rule / parity rule / "the crossing-number test"; the same idea as compound paths / "holes via winding" in PostScript, Illustrator, and font glyph outlines (the counter of an "O").
**Problem it solves:** painting a region *with holes* as a single filled object, instead of drawing the border and the dividers as separate stroked lines you'd have to keep aligned.
**The recipe:**
1. Draw the outer boundary as one closed subpath (`M…Z`).
2. Draw each hole as its own closed subpath, appended to the *same* `d` string.
3. Set `fill-rule="evenodd"` so any point enclosed an odd number of times is painted and even-number (inside a hole) is not.
4. To change what's solid vs. hollow, add/remove/resize **subpaths** — never touch the fill colour or stroke.
**Here:** step 1 = the outer silhouette `M795.79 166.5…Z`; step 2 = the ten pane subpaths; step 3 = `fill-rule="evenodd"` on [line 5](../../public/img/kitchi-logo-v4.svg); step 4 is exactly your exercise below.
**Reach for it again when:** rendering rings, frames, window panes, donut charts, glyph counters, masks — anything "shape minus shapes." **Not when:** the holes need *different* colours or strokes — then they must be separate elements, because one path has one paint.

## Do it yourself next time — the exercise (remove the interior green lines, keep the outline)

The mullions exist *because* there are many separate pane-holes with green gaps between them. So the edit is about **which subpaths line 5 contains** — you never touch a colour. Pick the outcome you actually want (see the three-square diagram from the chat):

1. **Identify the subpaths.** In line 5's `d`, each `M…Z` is one loop. The **first** `M795.79 166.5 … 795.79 166.5Z` is the outer outline. Every `M…Z` after it is a pane.
2. **Solid green silhouette (simplest, no interior lines):** delete everything from the first `Z` up to the end of the `d` string, keeping only the outer subpath. Result: a filled green shape with the same outer edge, zero interior lines. This is the literal "remove interior lines, keep the outline" — but it's *filled*, not hollow.
3. **Hollow frame (outer border only, transparent centre):** keep the outer subpath, then replace all ten pane subpaths with **one** inset rectangle-ish subpath that follows the outer edge a dozen units in. One big hole → no mullions, just the border ring. (Computing that inset by hand is fiddly; easier in an editor — see below.)
4. **Just the pane borders instead:** switch line 5 to `fill="none"` and add a visible `stroke-width` (keep `stroke="#038615"`). But note this strokes *every* subpath, so you'd get the outer outline **and** an outlined rectangle for each pane — a different look, not a single frame.
5. **Verify:** open the file in a browser (or drop it in an `<img>`), or use an editor's node view. Don't eyeball the raw numbers — render it. If you want the hollow-frame result without hand-math, open the SVG in Inkscape/Figma, select the green compound path, and delete the inner rectangles or "Path → Difference" against one inset rectangle; the tool rewrites the `d` for you.

The key mental move: **the green you see is the fill's *leftovers* around the holes — edit holes, not lines.**

## Further reading
- MDN — [SVG paths / the `d` attribute](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/d) and [`fill-rule`](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/fill-rule) (has an even-odd vs. nonzero interactive demo).
- MDN — [Cubic Bézier `C` command](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/d#cubic_b%C3%A9zier_curve) to see why collinear control points render straight.
