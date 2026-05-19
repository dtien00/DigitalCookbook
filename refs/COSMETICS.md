# Project Cosmetics
Make it consistent and reasonable within scope of what the application is looking to achieve; storing and sharing recipes

# Login Experience
- Make it similar to a book opening up:
## First Time User Experience (FTUE)
- Have it be a closed book; creation of account begins on the cover
- Upon creation, flip cover

## Returning User Experience (RUE)
- Have it be a closed book on the cover; opens to a new page
- Saved accounts could be rendered as page tabs
- Upon return, flip a couple more pages than FTUE to signifiy amount of content spent writing
    - Emphasize hgiher page flip rate ratio (faster flipping); login time should take the same time as FTUE

# Browse / Recipe Grid
Pinterest-style masonry layout — varied card heights driven by each image's natural aspect ratio (no forced 4:3 wrapper).

## Density adapts to library size
Fewer recipes → larger, more inviting cards. Bigger libraries → tighter packing so you can scan more at once. Tiers are based on `recipes.length` (not the filtered/search view, so cards don't resize while searching):

| Library size | Mobile | sm | md | lg | xl |
|---|---|---|---|---|---|
| ≤ 3       | 1 col | 1 | 2 | 2 | **2** |
| 4–8       | 1 col | 2 | 2 | 3 | **3** |
| 9–20      | 1 col | 2 | 3 | 3 | **4** |
| 21+       | 2 col | 2 | 3 | 4 | **5** *(floor)* |

**Floor at xl:columns-5** keeps cards ≥ ~250px on a 1280px viewport. Beyond that becomes a pixel-map rather than a browsable interface — intentional ceiling.

## Card resting state
- **Persistent bottom-gradient overlay** with the recipe **title in the bottom-left corner**. Title is always legible against the cover image — no hover required to identify the recipe. White text with a drop-shadow + bottom gradient (`from-black/85 via-black/45 to-transparent`) handles arbitrary image content.

## Card hover
- Image gently scales (`scale-105`, 500ms ease-out) — feels "alive" but not jumpy.
- **Description reveals above the title**, animated from `max-h-0`/`opacity-0` to `max-h-16`/`opacity-100` (300ms ease-out). Description is `line-clamp-2` truncated so cards don't grow unboundedly into a wall of text.
- Title stays anchored to the bottom of the card. Description slides in above it, growing the gradient overlay upward — the title becomes the stable identity anchor; description is the "second layer" of info.
- Card shadow deepens — subtle "lift" cue.
- All effects coordinated via Tailwind's `group` / `group-hover:` so a single hover triggers everything.

## Why this layering
A grid of 20+ recipes is a recognition exercise, not a reading exercise. The title is what you scan for, so it should never hide. The description is supporting context — useful when you've narrowed down to a candidate, but visual noise when you're just scanning. Surfacing it only on hover keeps the resting state image-first while making the extra context one micro-interaction away.

