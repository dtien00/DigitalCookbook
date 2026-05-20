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
| **Signed in** | `{email}'s Cookbook` — personal-feeling | Three secondary buttons: Bookmarks, Profile, Logout |
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

> **Note:** The button utilities documented above (indigo primary, gray secondary, rose-500 like state) reflect the original cool-modern palette. The rustic-paper retheme below replaces those at the home-grid and recipe-detail surfaces — utility strings shift from `bg-indigo-600` to `bg-rust`, `bg-gray-200` to `bg-paper-shade`, etc. Auth / Profile / Bookmarks / CreateRecipe screens still render with the legacy utilities; see "What this branch does *not* touch" below.

---

# Visual theme — rustic paper

The app reads as an aged cookbook page rather than a modern web product. Source palette: [coolors.co/1e1e24-a2666f-b06452-d6aa6c-f2e9e4](https://coolors.co/1e1e24-a2666f-b06452-d6aa6c-f2e9e4).

## Palette

Defined as Tailwind v4 `@theme` tokens in [src/index.css](../src/index.css) — every name becomes a utility automatically (`bg-rust`, `text-ink`, `border-paper-shade`, etc.).

| Token | Hex | Role |
|---|---|---|
| `paper` | `#f2e9e4` | App background (the "page") |
| `paper-shade` | `#e8dcd2` | Borders, dividers, secondary button background — a slightly darker paper for separation |
| `ink` | `#1e1e24` | Body text, deep accents, gradient overlays on image cards |
| `rust` | `#b06452` | **Primary action** — Sign In, +New Recipe, Edit, focus rings, bookmark "saved" fill |
| `rust-dark` | `#94503f` | Primary button hover |
| `rose` | `#a2666f` | Secondary accent — like "liked" fill, italic muted text (Loading…, descriptions), placeholder |
| `rose-dark` | `#84525a` | Rose hover; also the Delete button base (red-500 felt jarring in this palette — `rose-dark` is the same warning intent in palette voice) |
| `tan` | `#d6aa6c` | Tertiary highlights — divider rules under titles, ornamental flourishes |
| `tan-soft` | `#ede0c4` | Tag chip background (replaces the previous `indigo-50`) |

The "card surface" color `#fbf6f1` is a slightly-lighter-than-paper shade used directly (not a token) for inner card/form backgrounds — gives a subtle two-tone "card resting on page" feel without adding yet another named token.

## Typography

- **Body and chrome:** kept on the system sans-serif stack (`-apple-system, …`). Ingredient lists, ingredient quantities, search-bar text — anywhere readability beats character.
- **Display / headings / recipe titles:** [Lora](https://fonts.google.com/specimen/Lora) loaded from Google Fonts via `index.html`. Bound to the `font-display` utility in `@theme`. Lora is a transitional serif — readable at small sizes, warm at large sizes, fits "cookbook" without feeling Victorian.
- Italic Lora is used for *descriptive* / *atmospheric* text (recipe descriptions on cards, loading states) — picks up the handwritten-margin-note feel without leaning into a script font.

## Paper texture

A subtle `.paper-grain` utility class (defined in `index.css`) lays three offset radial-gradient layers at very low alpha over the `paper` background. No image asset, no SVG noise — just CSS. Applied to the top-level `<div>` of the home grid and the recipe detail wrapper so they read as an actual page surface.

Intensity is intentionally felt-not-seen. If it disappears entirely against your monitor's gamma, that's the right calibration — too strong and it tips into kitsch.

## Per-component decisions

### Recipe card (home grid)
- Card background `#fbf6f1` with a 1px `paper-shade` border and a warm shadow (`rgba(30,30,36,0.06)` rest → `0.12` hover). Replaces the previous pure-white-on-cool-gray shadow.
- **Image cards:** image gets a `sepia-[0.08]` filter — barely perceptible, but unifies arbitrary photo color casts into the warm palette. Bottom-gradient overlay now uses `ink/90 → transparent` instead of `black/85`.
- **Image-less cards:** title gets a serif treatment (`font-display`), followed by a 12px `tan` rule line under it (the hand-ruled-recipe-card cue), then italic-serif description.
- Tag chips use `bg-tan-soft text-ink` instead of `bg-indigo-50 text-indigo-700`. On image cards' hover-revealed chips, the frosted-glass treatment stays but uses `bg-paper/25` instead of `bg-white/25`.

### Recipe detail page (the "page from a book")
This is where the cookbook metaphor lives most fully:
- Page wrapped in `paper-grain` so the texture extends to the viewport edges.
- Title: large serif `Lora` (~2.5rem), tightly leaded, with a centered `tan` horizontal rule (80px wide, 2px tall) *under* the title — an explicit cookbook-page ornament. The description sits below the rule in italic-serif rose.
- Recipe content card (`#fbf6f1`) carries the body in serif `Lora` at default-ish reading size.
- Section headings (`Ingredients`, `Steps`) are rust-colored serif. The `<hr>` between sections is replaced with a centered `✦` glyph in tan over a tan rule — feels printed, not web-divider-y.
- Edit button is rust-primary; Delete button is `rose-dark` (was `red-500` — too modern/alert for this palette; `rose-dark` reads as "warning in the family").

### Bookmark + Like buttons (corners of every card)
- **Bookmark saved:** filled `rust` (was `indigo-600`).
- **Like liked:** filled `rose` (was `rose-500` — Tailwind's bright pink-red). The new dusty `rose` is muted, so the contrast against an unliked outline is less stark than before, but still clearly differentiable from the bookmark's terracotta.
- Outline (unsaved/unliked) state uses `stroke-ink` instead of `stroke-gray-800`.
- The frosted disc background (`bg-white/90`) is unchanged — white still reads cleanest against arbitrary image content.

## What this branch does *not* touch
- **Auth, Profile, MyBookmarks, CreateRecipe** screens are deferred to a follow-up retheme. They currently still use the old indigo/gray tokens — visible mismatch when you navigate to them. Conscious scope cut: home grid + recipe detail are the two highest-traffic surfaces.
- The legacy CSS `.auth-card` / `.form-card` / `.recipe-content` classes still exist; their *colors* now match the new palette (`#fbf6f1` paper-card background, `#e8dcd2` borders) so the deferred screens don't look totally broken in the meantime — they just don't get the serif heading + ornamental rule treatment yet.
- The book-opening login metaphor (see [Login Experience](#login-experience)) remains aspirational. The palette and typography here are the foundation it would build on.

## Motion

The app is mostly static — micro-interactions (button hover, card lift, image scale) handle their own quick transitions. The one **explicit screen-level motion** is the Auth view's entrance/exit.

### Auth slide-in
When an anonymous user clicks "Sign In" (header) — or any sign-in-gated action like bookmark/like on a card — the Auth screen **slides in from the right** over whatever was previously visible. Clicking "← Back" reverses the animation.

**Implementation pattern: always-mounted overlay.**
[App.jsx](../src/App.jsx) renders `<Auth>` inside a `fixed inset-0 z-50` container that is *always* in the DOM but positioned `translate-x-full` (off-screen right) when `showAuth` is false. Toggling `showAuth` to true changes it to `translate-x-0`; a CSS transition on `transform` does the slide. The container also gets `pointer-events-none` while hidden so it can't intercept clicks off-screen, and `aria-hidden={!showAuth}` so screen readers skip it.

This pattern was chosen over conditional mount/unmount because exit animations are awkward with React's reconciliation — keeping the component mounted means CSS handles the whole transition with zero state machinery.

**Tuning:**
- **Duration:** 450ms — felt long enough to read as deliberate (this is a context shift, not a hover blip) but short enough to not feel sluggish.
- **Easing:** `ease-out` — decelerates as it lands. Matches the "settling into place" feel; `ease-in-out` felt too mechanical.
- **Direction:** right-to-left. Picked because (a) it's the most familiar drawer pattern, and (b) it pairs intuitively with "← Back" — the slide-in came from the right, the back arrow points left, the page leaves the way it came.

**Side effect to know about:** the page behind the overlay stays rendered during the slide. Functionally fine — pointer events are blocked by Auth's full-viewport cream background. Visually it means the home grid is *behind* the cream sheet, not destroyed when you sign in — which actually reinforces the "this is a layer over the cookbook" feel.

### What's deferred
The COSMETICS-aspirational book-opening login (see [Login Experience](#login-experience)) is a different and richer motion idea than a side slide. If/when that lands, this slide-in becomes either the fallback for non-FTUE entries to Auth, or gets replaced entirely.

---

## Toasts (ephemeral feedback)

Stage 6 replaces every `alert(...)` call with `react-hot-toast`. The library is ~7.5KB gzipped and gives us non-blocking notifications, success/error iconography, and stacking out of the box — well-suited to a casual recipe hub where the alternative was native browser modal dialogs that interrupt cooking flow.

**Mount.** `<Toaster>` lives once at the root in [src/main.jsx](../src/main.jsx), outside `<App>`. App.jsx has multiple early-return branches based on view state (Profile / Bookmarks / CreateRecipe / RecipeDetail / home grid / Auth overlay) — mounting at the root keeps the Toaster present across all of them without having to thread it through every branch.

**Position.** `top-center`. Reasoning:
- `top-right` collides visually with the header's button cluster (Bookmarks / Profile / Logout / Sign In) which lives top-right.
- `bottom-*` competes with mobile browser chrome (URL bars, autofill suggestions) on phones — the main "cook with phone propped against the kettle" use case.
- `top-center` is out of the way of both, naturally reads first because it's where success/failure feedback is expected after a form submit.

**Durations.**
- Success toasts: 3.5s default. Long enough to register, short enough to not nag.
- Error toasts: 5s. Errors usually require the user to *read* and *think*, so give them an extra beat.

**Categorisation rule.** Every `try { ... }` success path → `toast.success(msg)`. Every `catch (error) { ... }` path → `toast.error(error.message)`. No `toast()` (neutral) calls yet — every current message is clearly one of the two. Add neutral toasts later if a use case appears (e.g. "Comment posted" without a noteworthy success quality, or info notices like "Refreshing feed…").

**Styling.** Currently the library defaults (white background, dark text, green/red icons). Now that the rustic palette has landed, a tiny follow-up should pass `toastOptions.style` overrides through the `<Toaster>` mount to use it — `bg-paper-shade` surface, `text-ink`, `border-paper-shade`, accent icons in `--color-rust` (success) / `--color-rose-dark` (error). Keep it lightweight — toasts are noise that should fade, not feature highlights.

**Why not `window.confirm` replacement?** Toasts are *non-blocking* — they can't gate a destructive action. The "Delete recipe?" `window.confirm` calls in [RecipeDetail.jsx](../src/components/RecipeDetail.jsx) and [Comments.jsx](../src/components/Comments.jsx) stay as native confirms for now. A real modal-confirm component is a separate sub-task; it doesn't have to ship with the toast change.

**Accessibility hook.** `react-hot-toast` announces success/error toasts via `role="status"` (success) and `role="alert"` (error) automatically — screen readers will hear them without us doing anything. That's a bonus pickup we get for swapping out `alert()`, which was technically accessible but completely interrupting.

---

# Navigation IA — proposed *(not implemented)*

A directional sketch of where the app's navigation could evolve. Currently top-level navigation is a flat row of buttons in the header (Bookmarks · Profile · Logout for signed-in users); the proposal here reframes those around two top-level spaces — **Public Hub** and **Personal Hub** — to give the app a clearer mental model.

## The mental model

| Hub | What it contains | Who sees it |
|---|---|---|
| **Public Hub** | All public recipes, browsable Pinterest-style. The home grid as it exists today. | Everyone — anonymous and signed-in. |
| **Personal Hub** | The signed-in user's own recipes, bookmarks, and profile info. The "mine" space. | Signed-in users only. |

The home view stays Public — anonymous-by-default browsing is preserved (Stage 2 philosophy; see also the discarded Landing-screen pivot — the user explicitly preferred public-grid-on-arrival over an interstitial choice). Personal Hub is what signed-in users *navigate to* when they want to see their own stuff, then navigate back from when they want to browse again.

## Three flavors to choose between

1. **Rename only.** Keep the current two screens (My Recipes inside Profile + My Bookmarks), just relabel the header buttons under a "My Hub" framing — e.g. "My Hub: Recipes" and "My Hub: Bookmarks." Smallest change, mostly verbal. Doesn't actually reduce the number of top-level destinations.

2. **Consolidated Personal Hub.** Replace the three separate buttons (Bookmarks / Profile / Logout) with a single "My Hub" button. The Personal Hub page has the user's profile info up top (avatar, username, bio) and tabs/sections below: **My Recipes** · **Bookmarks**. Logout moves to a small icon or menu. One destination, three views inside.

3. **Two-mode top-level toggle.** A persistent "Public Hub / My Hub" toggle in the header — the whole page swaps mode when the user clicks. Bigger conceptual shift but the most explicit mapping of the mental model. Adds a navigation pattern not yet present in the app.

## How to choose

- If the goal is just clearer labeling: **flavor 1**.
- If the goal is to reduce header clutter and give "mine" a clear home: **flavor 2** (likely the recommended starting point — modest scope, clear payoff, and Profile-as-a-section instead of Profile-as-a-screen aligns with most modern apps).
- If the goal is to make the hub-vs-hub distinction the dominant organizing principle of the whole app: **flavor 3**, but probably only worth it once Personal Hub gains more depth (comments thread, follows feed, etc. in later stages) to justify the toggle's persistent screen real estate.

## What this doesn't change

- Anonymous browsing stays the default arrival experience — no forced auth.
- The bookmark/like-clicks-prompt-login pattern (Stages 3–4) is unaffected.
- RLS policies, URL/routing model, and the Pinterest-style grid all carry forward as-is.

## Open question for later

The book-opening login metaphor in the [Login Experience](#login-experience) section above implicitly assumes auth is the user's first contact with the app. That assumption is in tension with anonymous-by-default arrival. If we keep the book metaphor, it likely applies *only* when a user actively chooses to sign in (clicks the header CTA), not as a forced landing — worth resolving when either the book metaphor or this nav IA moves from proposed to implemented.

