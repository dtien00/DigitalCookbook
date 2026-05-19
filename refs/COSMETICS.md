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

## Bookmark button

A small circular icon button in the **top-right corner of every card** (`absolute top-3 right-3 z-10`). Always visible, regardless of hover state — bookmarking should be a one-tap action, not a "hover then click" two-step.

- **Visual:** `w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-md` — a frosted-glass disc that reads against both image-rich and plain-white card content.
- **Icon:** Lucide/Heroicons bookmark glyph. Filled `fill-indigo-600 stroke-indigo-600` when saved; outline `fill-none stroke-gray-800` when not. Click triggers a brief `active:scale-95` press + persistent state change.
- **Hover:** `hover:bg-white hover:scale-110` — pops slightly so it's clearly tappable.
- **Click handling:** `e.stopPropagation()` inside the button so the parent card's `onClick` (which navigates to the detail view) doesn't also fire.
- **Larger variant** on [RecipeDetail.jsx](../src/components/RecipeDetail.jsx) — `size="lg"` (`w-12 h-12`, larger icon) — placed in the top-right of the header row, balancing the back button.

### Anonymous behavior
The bookmark button renders identically for anonymous viewers — *clicking* it opens the Auth view instead of toggling state. The visual affordance is the conversion incentive: "you can save this if you sign in." Hiding the button entirely would remove the prompt to convert; showing it grayed-out would feel like a denied action.

## Like button (heart + count)

Pill-shaped button: heart icon + count number. Sits in the **top-left corner** of every card (`absolute top-3 left-3 z-10`), mirroring the bookmark's top-right placement — the corners are visually balanced and neither button overlaps the title/overlay area at the bottom.

- **Visual at rest:** `h-8 px-2.5 rounded-full bg-white/90 backdrop-blur-sm` — same frosted-glass treatment as the bookmark, but pill-shaped (not circular) to make room for the count.
- **Heart icon:** Lucide-style outline by default (`fill-none stroke-gray-800`); switches to `fill-rose-500 stroke-rose-500` when the **current user** has liked the recipe. The fill color is rose, not indigo, so the like and bookmark states are visually distinguishable at a glance (indigo = saved, rose = liked).
- **Count display:** rendered only when count > 0. A `0` would be visual clutter on every card — empty space carries the same information.
- **Hover/active:** `hover:bg-white hover:scale-105 active:scale-95` — same micro-press as the bookmark.

### Likes vs bookmarks — why two icons?
Different mental models:
- **Bookmark (indigo, top-right):** *I want to find this again.* Personal, intent-based. Saved into a private collection.
- **Like (rose, top-left):** *I appreciate this.* Public signal. Aggregated into a visible count.

Pinterest itself distinguishes "save to board" from a quick reaction — we follow the same separation.

### Anonymous behavior
The like pill renders for anonymous viewers too, with the count visible (likes are public information). Clicking it opens the Auth view. The count is the social proof that hopefully nudges sign-up; the click being gated behind auth is the conversion point.

### Detail page placement
On [RecipeDetail.jsx](../src/components/RecipeDetail.jsx) both buttons sit in the top-right header row (the "← Back to List" button is top-left), at `size="lg"` for finger-target generosity. Like comes first, then bookmark — left-to-right reading order mirrors the cards' top-left/top-right placement.

## Tags

Tag chips appear on cards as a categorical signal — "vegan", "weeknight", "asian", etc.

**Image cards:** chips animate in *between* the description and the title on hover, same `max-h-0 → max-h-12` transition pattern. Frosted-glass styling — `bg-white/25 backdrop-blur-sm text-white` — keeps them legible against any image without screaming for attention. Max 3 chips visible per card; extra tags don't surface here (the detail page is the right place for the full set).

**Image-less cards:** chips show *persistently* below the description in indigo (`bg-indigo-50 text-indigo-700`). No hover layering since these cards already show everything in their resting state.

**Why on hover for image cards, persistent for image-less cards:** consistency of intent. Image cards' resting state is image-first; chrome appears on hover. Image-less cards have no image to be respectful of, so all the info shows together.

**Why max 3 visible:** four chips in a single chip row often wraps awkwardly on narrow cards. Three is the sweet spot — fits on one line even at the mobile single-column tier, and forces tag editors to pick the most-meaningful tags. The remaining tags are still saved (the DB stores the whole array); they just don't render on the card.

---

# Header / Chrome

The persistent UI scaffolding around every screen — page wrapper, top header, search/action row, and the four button variants.

## Page wrapper
- **Home view (App.jsx):** `max-w-7xl mx-auto px-5 py-5` — 1280px max-width gives the masonry grid enough room to actually use its `xl:columns-5` floor (the legacy 800px constraint silently capped the grid at 3 columns regardless of viewport).
- **Profile / RecipeDetail:** stay at `max-width: 900px` (still in `index.css`). These are focused, single-flow views — narrower feels appropriate.
- **Auth / CreateRecipe:** centered card layouts (`auth-container` / `create-recipe-container` in CSS) — unchanged.

## Top header bar
- `flex justify-between items-center mb-10` — title on the left, action group on the right.
- Title: `text-2xl font-semibold text-gray-900` — substantial but not heroic.
- Action group: `flex gap-3` — small horizontal cluster.

### Logged-in vs anonymous header
| State | Title | Right side |
|---|---|---|
| **Signed in** | `{email}'s Cookbook` — personal-feeling | Two secondary buttons: Profile, Logout |
| **Anonymous** | `Digital Cookbook` — brand-level | Single primary "Sign In" button (visual emphasis pulls the eye to the conversion action) |

The asymmetry is intentional: the anonymous header has one obvious next-step (sign in), so the button gets the primary-button treatment instead of being one of several secondary options. Logged-in users have a richer set of actions, none of which is the "main" action, so secondary styling for all is appropriate.

### Action row (search + create)
- Search input always shown — anonymous users can filter the public grid.
- "+ New Recipe" button only renders when signed in. The grid quietly collapses to just a full-width search bar when anonymous.

## Search + primary action row
- `flex gap-4 items-center mb-8` — search input grows (`flex-1`), primary button stays content-width.
- Old legacy CSS used a 50px gap and a `flex: 8 / flex: 2` ratio; the new layout lets the search field consume available space and the button shrinks to its label, which scales more naturally across viewports.
- Search input is pill-shaped (`rounded-full`) with a subtle focus ring (`focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500`) — the legacy version had no focus state at all.

## Button variants

All four variants use inline Tailwind utilities at each call site (not extracted to a `<Button>` component). This is intentional for the current scale (~15 button instances total): explicit, no abstraction surface, easy to deviate per-call-site when a button needs `w-full` or extra spacing. Revisit once button instances exceed ~25 or behavior gets richer (icons, loading spinners, etc.).

| Variant | Utility string | Where it's used |
|---|---|---|
| **Primary** | `px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed` | Submit / "+ New Recipe" / Edit Recipe |
| **Secondary** | `px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-md transition-colors` | Header (Profile, Logout), Back buttons, Add Ingredient/Step, Cancel |
| **Link** | `bg-transparent border-0 p-0 text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer hover:underline underline-offset-2` | Auth view-switchers (Sign Up / Login / Forgot Password) |
| **Danger** | `px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-md transition-colors` | Delete Recipe |

Form-submission primary buttons (Auth login, Profile save, Profile change password) prepend `w-full` to the string — they sit at the bottom of a card form and stretch to its width. The action-row primary button on the home view does not, because it's natural-width in a flex row.

## What carried over from the legacy CSS
Hover states were silently *missing* in the legacy CSS — buttons changed nothing on hover. The Tailwind conversion adds a sensible `hover:bg-*-700` shift across all colored variants and a subtle `hover:underline` on link buttons. Small improvement but visible.

Disabled state was also unstyled in legacy CSS. Now: `disabled:opacity-50 disabled:cursor-not-allowed` on primary buttons that accept the prop.

