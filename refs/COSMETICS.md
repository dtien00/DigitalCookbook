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

## Implementation — pluggable styles

Auth is organised so the visual treatment can swap independently of the form logic. All Supabase calls + form state live in [`src/components/auth/useAuthForm.js`](../src/components/auth/useAuthForm.js); each visual treatment lives as its own presentational component under [`src/components/auth/styles/`](../src/components/auth/styles/) and consumes that hook through a `form` prop. The active style is chosen by a single `ACTIVE_AUTH_STYLE` constant in [`src/components/Auth.jsx`](../src/components/Auth.jsx); the [registry](../src/components/auth/styles/index.js) maps each key to its component.

Adding a new style is three steps: write the component, register it, flip the constant. Behavior can't diverge between styles because none of them touch Supabase — that's the point of the split.

## Style: Book Cover — Composition Notebook  *(active)*

The first concrete style under the metaphor above — a closed cognac-leather-bound cookbook lying on the paper background. Built entirely from CSS textures — no image assets — so it stays coherent if tokens shift.

**Aesthetic reference:** the premium "Drake on Summit"-style leather journal — smooth polished cognac surface, soft top-center highlight, deep saddle vignette at the corners, a single blind-embossed brand at the bottom, no other ornamentation. An earlier iteration with a gold-tooled tan double-rule frame + corner fleurs + top embossed title was too ornate against the reference; that build is gone.

- **Outer frame (cognac leather cover):** an ellipse-shaped radial gradient (lighter `#b07a5a` top-center → `#9d6648` → `#7a4a30` → `#5a341f` corners) gives the cover its soft-lit-leather depth. A second linear gradient adds a faint spine-side darkening so the bound edge sits in shadow. Three radial-gradient noise passes at very low alpha (~0.08–0.10) add a hint of leather grain without the speckled-pixel look the previous build had. Deep two-layer drop shadow + dark outer border (`#3a1f12`) + inset bottom darkening + inset top highlight give the bound-book weight.
- **Spine:** narrow (16px on desktop, 12px on phones) strip of deeper leather on the left edge, gradient from `rgba(30,15,5,0.70)` at the binding to a faint highlight at the cover edge — smooth, no raised bands (the reference doesn't show any from a front-cover view, so neither do we).
- **Page-edges sliver:** thin cream strip (5px on desktop, 4px on phones) on the right edge with very-fine horizontal `repeating-linear-gradient` lines — implies the closed book's page block peeking out behind the front cover. Bordered above and below with thin dark rules so it reads as paper edges, not a separate panel.
- **Composition-notebook label (upper portion, holds the form):** parchment cartouche inset into the leather. Two-layer build — an outer stippled `tan-soft` border with ink + rose specks across multiple radial-gradient passes (the "marbled" plaque edge), wrapping an inner cream surface with faint tan repeating-linear-gradient rules every 28px (the "lined paper"). Serif `Lora` title + italic-rose subtitle sit above the rules; email/password fields use serif input with rust focus ring. **The cartouche now holds only the form's title, subtitle, and inputs** — view-toggle prompts (Sign Up / Forgot Password / Back to Login) and the submit affordance both live in the clasp row below. The form carries `id="auth-form"` and the clasp uses HTML5's `form="auth-form"` attribute to submit it from outside.
- **Clasp row (view-toggle + submit clasp):** a flex band sitting on the leather between the cartouche and the OAuth section. View-toggle links (italic-tan margin-note voice) on the left; the leather strap clasp on the right. The two share an eye-line so users can read the alternative-view prompt and reach the submit affordance without a vertical hop.
  - **View-toggle links:** italic `Lora` in muted tan `rgba(232, 200, 150, 0.78)` for body text ("Don't have an account?"), brighter `#f5dca8` upright bold for the primary action link (Sign Up / Login / Back to Login), dust-rose `rgba(214, 170, 108, 0.85)` for the secondary "Forgot Password?" so it doesn't compete. All carry a dark text-shadow so they read against the cognac leather. Hover lifts to a brighter tan + underline.
  - **Leather strap clasp (submit):** the Login button reimagined as the cookbook's closure mechanism — a horizontal leather strap with a brass stud that *wraps around the book's right edge to the back cover*. Visual metaphor: a person would unfasten this clasp before opening the journal.
    - **Strap:** vertical leather gradient (`#8a5a40 → #6f4530 → #4f2f1c`) + two radial-gradient grain passes, dark border `#2a1408`, asymmetric border-radius (more rounded on the right end so it reads as free-floating), inset top-highlight + bottom-darkening + outer drop shadow.
    - **Stitching:** two dashed dark hairlines via absolutely-positioned spans along the top and bottom of the strap.
    - **Brass stud:** 18px circular rivet on the **left** end of the strap (the closure point sits toward the spine side; the strap continues to the right where it wraps around the book). Radial gradient from a `#f5dca8` highlight through `#d6aa6c → #a07a3d → #5a4225` to a `#2a1c0e` outer ring; a 3×3px `::after` specular spot adds the metal glint.
    - **Label:** "Login" / "Sign Up" / "Send" in `Lora` bold caps, letter-spaced `0.14em`, cream text with dual text-shadow. Sits to the right of the stud.
    - **Wrap-around effect:** the clasp is 170px wide with `margin-right: -64px` so its right end extends ~31px past the book's right edge, where `.auth-book`'s `overflow: hidden` clips it — the strap visually disappears over the edge to the back cover. A dedicated `.auth-clasp-wrap` span (60px wide, absolutely positioned at the strap's right end) adds a `linear-gradient` from transparent → dark that darkens the leather as it approaches the wrap point. The span is narrow enough that its gradient starts *after* the LOGIN label — an earlier 90px-wide span with an `inset` box-shadow created a visible vertical line that cut through the label; that's gone, the gradient alone handles the fold-shading.
    - **Crossing the page-edges:** the clasp carries `z-index: 3`, which sits above `.auth-book-pages` (z-index 2). Where the strap and the cream page sliver overlap, the strap renders *on top* — visually the leather appears to wrap around the white edge of the book, not under it.
    - **Behavior:** hover brightens + shifts the whole clasp 3px left (the "easing-open" cue); active shifts 5px left and 1px down; focus-visible draws a tan outline on the strap.
    - **Form association:** `<button type="submit" form="auth-form">` with the cartouche's `<form id="auth-form">` — pure HTML5, no JS form-bridging. Enter-key in either input still submits normally.
    - **Layout:** flex child of `.auth-clasp-row`, sibling to the view-toggle. The row uses `justify-content: space-between` so the clasp's negative margin-right pulls only its visible position to the right without affecting the view-toggle on the left. Mobile reduces width to 150px with `margin-right: -52px` for a proportional wrap.
- **OAuth brass label-plate panel (lower portion, optional):** a single aged-brass plaque with ornate scrollwork end-caps; the two provider cells sit *on top* of the plaque as visually-separate high-contrast parchment cards. The structure mirrors a real nameplate holder: one brass frame, two paper labels slipped into it.
  - **Panel frame:** vertical brass gradient (`#a07a3d → #8a6a3d → #6a4f2a → #5a4225`) overlaid with three radial-gradient patina passes (mossy green + dark spots + warm highlights) using `background-blend-mode: multiply, multiply, screen, normal`. Dark border `#2a1c0e`, inset top-highlight + bottom-darkening + secondary inner-edge for the two-tone rim, plus an outer drop shadow so the plaque sits proud of the leather.
  - **Scrollwork caps (44px wide each, spanning both cells):** inlined SVG with two opposing S-curves + a central round boss (dark base ring + tan inner dot + tiny highlight pixel for the brass glint) + a small tendril toward the cells. The right cap is the same SVG mirrored via `transform: scaleX(-1)` so the two ends always match. The caps span the full panel height — they frame the entire pair of cells rather than belonging to either one.
  - **Provider cells (the high-contrast inserts):** cream `#f2e9e4` parchment cards with a faint radial-gradient grain, ink `#1e1e24` text, dark `#2a1c0e` border. Inset top-highlight + bottom-hairline + outer drop shadow give each cell a slight raised relief above the brass. Cream-on-dark-brass is the visual point — the cells pop off the plaque so each provider reads as its own affordance, separated from its sibling by an 8px gap. Hover lifts to `#fbf6f1` with a deeper drop; active presses down 1px.
  - **Stacked, not side-by-side:** the ornate ends need horizontal room, and stacking lets each cell stay full-width-comfortable for icon + label. Panel sits in the OAuth section at the same overall footprint as the previous design.
  - Divider rules and "or continue with" text are tan with a dark text-shadow so they read as gold-tooled lettering against the leather.
  - Currently exposes Google + GitHub; providers must be enabled in the Supabase project's Auth settings or `signInWithOAuth` toasts a clear error. Both provider icons render at their natural colors against the cream cell surface (GitHub octocat is ink, Google "G" is full-color).
- **Hidden when irrelevant:** the OAuth plates are suppressed in the `forgot_password` view since OAuth providers don't accept reset flows.
- **Blind-embossed brand (bottom of cover):** the *only* ornament on the leather. ✦ glyph above "DIGITAL COOKBOOK" in `Lora` bold caps, letter-spaced `0.30em`. Pressed *into* the leather rather than gilded — the text color sits close to the leather tone (`rgba(74, 40, 25, 0.88)`) and two-tone text-shadow (dark above letterforms = the indent's shaded edge, faint highlight below = the indent's lit lip) does the depressed-edge work. Pushed to the bottom of the cover via `margin-top: auto` so the cartouche stays anchored at the top regardless of which view is active.
- **Back-to-recipes button:** floats *outside* the book at top-left of the page (`position: absolute; top:16; left:16; z-index:10`). Paper-shade pill with ink text + soft drop shadow + backdrop blur — reads against the paper-grain page without competing with the cognac cover, and keeps the book itself looking like one closed object rather than a card chopped by chrome.

The cognac palette (`#b07a5a → #5a341f`) uses literal hex values rather than promoting new tokens. Captured at the style level because it's scoped to this one visual — the rest of the app's rustic-paper palette already has the right voice and doesn't need a saddle-brown range introduced.

All textures are namespaced `.auth-book-*`, `.auth-comp-*`, `.auth-patch-*` in [src/index.css](../src/index.css) so they don't collide with the existing `.auth-card` legacy class (still present for any deferred-retint flows that hit it during transition).

### Future styles
Reserved keys / sketches not yet built — file under `src/components/auth/styles/` to add:
- **Open-book layered pages** — two-page spread, login on the left page, signup on the right, with a center fold shadow.
- **Recipe card on a kitchen counter** — index-card cream surface with a wooden-grain background and a paperclip detail.
- **Spine-only minimalist** — just the spine + title, opens to reveal the form on submit.

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

## Sort picker (Stage 13 v2)

A custom dropdown that sits between the search input and the "+ New Recipe" button. The trigger is always a plain "Sort" pill (`bg-paper-shade rounded-full px-3 py-1.5`) — it never reflects the current sort state in its label. This is deliberate: the user is assembling a combination of two independent metrics, and a label that tries to summarise both would either be truncated or constantly changing, which is more disorienting than stable.

**Dropdown anatomy:**
- Two metric rows — Date (ClockIcon) and Likes (HeartIcon) — stacked vertically inside a `paper` background card, `rounded-xl shadow-lg`, 220px wide.
- Each row is `role="menuitemcheckbox" aria-checked={on}` since multiple metrics can be active simultaneously (this is not a radio group).

**Left-side switch toggle (on/off per metric):**
The switch is `aria-hidden="true"` — the row itself is the interactive element and carries the ARIA semantics. Visual state:
- **On:** `bg-rust` track, `bg-paper` thumb at `left-[18px]` — rust fill signals "this metric is in effect," matching the rust primary-action convention elsewhere.
- **Off:** `bg-paper-shade border border-ink/20` track, `bg-ink/30` thumb at `left-0.5` — muted so inactive metrics read as background controls, not affordances fighting for attention.

Clicking the row body calls `toggleMetric(key)` (independent per-metric on/off). The dropdown intentionally does **not** close on toggle click — the user is expected to configure multiple metrics before dismissing.

**Right-side direction chevron:**
Clicking the chevron calls `flipDir(key)` and rotates `180deg` when direction is `asc`. Chevron click is `e.stopPropagation()` so it doesn't also trigger the row's `toggleMetric`.

**Compound sort priority (when both on):** likes is primary (popularity is the dominant signal when explicitly requested), `created_at` is the secondary tiebreaker. `id DESC` is always appended as the final tiebreaker for deterministic pagination across pages.

**Outside-click and Escape:** a `useEffect` mirrors the existing `menuOpen` pattern — clicks outside `sortMenuRef` and `keydown === 'Escape'` both close the dropdown.

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
- **Ingredient-section sub-headings (Stage 21):** groups like "For the sauce" render as `font-display` rust small-caps (`text-sm uppercase tracking-widest`) over a `border-tan/60` hairline — the same voice as CookingMode's "Step N" labels, one register below the serif `Ingredients` heading. Each is a full-width button with a `no-print` chevron that collapses the group (rows hide via `.section-collapsed`; a collapsed heading appends an italic serif `(n)` count). Browser print force-expands via `@media print`; the PDF path clears collapse state in JS before capture instead, since html2pdf renders screen media. The CookingMode ingredients drawer reuses the same heading treatment without the collapse affordance.
- Edit button is rust-primary; Delete button is `rose-dark` (was `red-500` — too modern/alert for this palette; `rose-dark` reads as "warning in the family").

### Bookmark + Like buttons (corners of every card)
- **Bookmark saved:** filled `rust` (was `indigo-600`).
- **Like liked:** filled `rose` (was `rose-500` — Tailwind's bright pink-red). The new dusty `rose` is muted, so the contrast against an unliked outline is less stark than before, but still clearly differentiable from the bookmark's terracotta.
- Outline (unsaved/unliked) state uses `stroke-ink` instead of `stroke-gray-800`.
- The frosted disc background (`bg-white/90`) is unchanged — white still reads cleanest against arbitrary image content.

### Servings stepper (Recipe Detail)
A ± stepper next to the "Servings:" label in the recipe-meta row. Local state only — no server persistence; the multiplier resets on navigation away.

- **± buttons:** `w-8 h-8 rounded-full bg-paper-shade hover:bg-tan/40 text-ink font-semibold` — small circular discs in the paper-shade family so they read as paper ornaments rather than primary actions. The stepper is a fine-tuning control, not a CTA; muted treatment matches its intent.
- **Bounds:** disabled at `1` and `99` (`disabled:opacity-40 disabled:cursor-not-allowed`). Below 1 makes no sense; 99 is a generous upper bound that still feels like a hand-typed recipe rather than industrial.
- **Reset link:** appears inline when `targetServings ≠ baseServings`. Styled as `text-xs text-rose hover:underline underline-offset-2` — the italic-rose family used elsewhere for muted-explanatory text, so reset reads as "undo this small experiment", not a destructive action.
- **Fraction rendering:** the `scaleQuantity()` helper substitutes `½ ¼ ¾ ⅓ ⅔` for the matching decimals so "½ cup" stays "½ cup" at multiplier 1, and "¾ cup" reads naturally at multiplier 1.5. Quantities are stored as NUMERIC in Postgres, so no string parsing is needed.

**Why local-state-only:** the multiplier is a cooking-session affordance, not a preference. Scaling a recipe to 6 servings tonight shouldn't change what the recipe says the next time someone (or you) opens it. Persisting it would muddy the "this is the author's recipe" contract.

## What this branch does *not* touch
- **Profile, MyBookmarks, CreateRecipe** screens are deferred to a follow-up retheme. They currently still use the old indigo/gray tokens — visible mismatch when you navigate to them. Conscious scope cut: home grid + recipe detail are the two highest-traffic surfaces.
- **Auth** has since been rebuilt on the `frontend-vfx` branch under a pluggable-style system; see [Login Experience → Implementation — pluggable styles](#implementation--pluggable-styles) and [Style: Book Cover — Composition Notebook](#style-book-cover--composition-notebook-active).
- The legacy CSS `.auth-card` / `.form-card` / `.recipe-content` classes still exist; their *colors* now match the new palette (`#fbf6f1` paper-card background, `#e8dcd2` borders) so the deferred screens don't look totally broken in the meantime — they just don't get the serif heading + ornamental rule treatment yet. (Auth no longer renders the `.auth-card` class; the new style uses its own `.auth-book-*` namespace.)

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

# Print stylesheet (Stage 8)

The Recipe Detail page is printable as a kitchen card via the browser's native Print dialog (Ctrl+P / ⌘+P). No dedicated Print button is shown — an earlier iteration added one but it was removed once the in-app PDF download landed, since `Download PDF` does the same job in one click and the two buttons sitting next to each other felt redundant. The `@media print` rules stay because Ctrl+P still works and the same rules form the basis of the in-app PDF (html2pdf's `ignoreElements` checks the same `.no-print` class).

## The `.no-print` contract

A single global `@media print { .no-print { display: none !important; } }` rule in [src/index.css](../src/index.css) hides any element tagged at the call site. New components that contain interactive chrome (buttons, banners, drawers) should tag themselves with `no-print` so the printout stays focused on content.

Currently tagged: top action row (Back, Like, Bookmark, Download PDF), servings ± / reset buttons, author actions (Edit / Delete), admin moderation panel, comments section wrapper, env banner. The "Servings: N" text + number is kept since the printout should reflect the scaled servings.

**Shopping list page exception (Stage N+2a):** the `/shopping-list` page tags its own chrome (Back, count, Copy / Print / Clear-all row, per-row ✕) `no-print`, but deliberately lets its item checkboxes print. The RecipeDetail print rule that hides checkboxes is scoped to `.ingredient-list`/`.step-list` only, so the shopping list's boxes survive — a printed shopping list with empty boxes is the whole point (tick items at the store), unlike the recipe kitchen-card where the checkbox is a screen-only affordance.

**Shopping-list provenance chips (Stage N+2c):** the `/shopping-list` page shows a "Recipes in this list" chip row between the action buttons and the items — one `bg-tan-soft text-ink` pill per contributing recipe with a `bg-tan` count badge. Hovering, keyboard-focusing, or tapping a chip highlights that recipe's rows with a 3px `rust` left-stripe + `bg-tan/20` band (the same bookmark-ribbon highlight idiom the Following row uses). The active chip gains `ring-2 ring-rust` and its badge flips to `bg-rust text-paper`. Because touch has no hover, a tap *pins* the highlight (click again to unpin); on desktop, hover previews and click pins. The whole row is `no-print`.

**Shopping-list delete + undo (Stage N+2c, PR #66):** each recipe chip carries a trailing `✕` (its own button, split from the highlight button by a `border-l border-tan/40` inside an `overflow-hidden rounded-md` shell) that removes the recipe **optimistically** — no confirm dialog; the overlap accounting rides in a 6-second Undo toast instead ("Removed X — 1 item removed, 1 shared item reduced", with a `text-rust` **Undo** action on the standard paper-shade toast). Both the chip `✕` and the per-row `✕` drop the removal into a collapsed **"Recently removed (N)"** tray under the list (separated by a `border-t border-paper-shade`; a `▸` chevron rotates 90° on expand). Tray entries reuse the same two-buttons-on-a-pill construction: a `bg-paper-shade` pill showing the item line (or "Recipe · N items") + a muted relative timestamp, then a `↩` restore (`text-rust`) and a `✕` dismiss (`text-ink/30 hover:text-rose-dark`). All `no-print`.

## What's kept vs. dropped

| Kept | Dropped |
|---|---|
| Title (ink, no rule decoration changes) | Top action row (Back / Like / Bookmark / Print) |
| Description (italic, dark-grey) | Servings ± / reset buttons (the number stays) |
| Private badge / tags | Author actions (Edit / Delete) |
| Hero image, capped at 180px | Admin moderation panel |
| Servings text + final number | Comments section |
| Ingredient list (with multiplied quantities + notes) | Env banner |
| Step list (numbered) | Interactive checkboxes inside ingredient/step lists |
| ✦ section divider | Paper-grain texture, card shadows, card borders |

## Page-break rules
- `page-break-after: avoid` on `.recipe-content h3` — section headings stick with their first item.
- `page-break-inside: avoid` on every ingredient/step `<li>` — a single line never splits across pages.

## Surface
Background goes white, text goes black, paper-grain texture and card chrome (shadows, borders, padding) disappear. The page itself becomes the surface. The ✦ ornament between sections keeps its mask-trick background — switched from `#fbf6f1` to `#fff` so the rule line still gets covered.

## Why no header/footer URL
Browsers add their own URL / date header on print by default — re-adding one would double up. If the eventual PDF download (next item) wants a branded footer, that's its own decision to make there, not in the shared CSS.

---

# Meal plan grid (Stage M+1)

The `/plan` week grid (signed-in only) lays out seven day columns (Mon–Sun) × three meal rows (Breakfast / Lunch / Dinner) as a CSS grid with a fixed `70px` label column: `grid-template-columns: 70px repeat(7, minmax(0, 1fr))`. The grid sits in an `overflow-x-auto` wrapper with a `min-w-[640px]` inner track, so on phone widths the columns scroll horizontally rather than crushing to unreadable widths.

- **Filled cell:** `bg-tan-soft` + `border-rust/40` rounded card; truncated recipe title (clickable → recipe detail) + a `rose-dark` remove `✕`.
- **Empty cell:** dashed `border-ink/25` rounded box with a centered `+` in `rose/50`; hover fills `paper-shade`. Tapping opens the bookmark picker for that cell.
- **Today's column header** gets a quiet `bg-tan-soft` highlight; other day headers are plain `text-rose`.
- **Picker:** centered modal (same `fixed inset-0 z-50 bg-ink/40` overlay posture as the Auth slide-in / Fridge modal), backdrop-click + Escape to close, listing the user's bookmarked recipes. ✦ + serif + italic-rose empty-state nudge when the user has no bookmarks yet.

Week navigation is local state (a Monday-anchored `weekStart` date); prev/next walk ±7 days and "This week" jumps home. The viewed week is not persisted — `/plan` always opens on the current week.

**Drag-and-drop (desktop only).** A bookmark **tray** above the grid (`hidden md:block`) is the drag source: each bookmark is a draggable chip, and dropping it on a cell calls the same `addEntry` upsert as the picker. Filled cells are themselves draggable to relocate a planned recipe (drop = `addEntry` destination + `removeEntry` source = a move; dropping on itself is a no-op). The cell under the pointer shows a `ring-2 ring-rust` highlight driven by a `dragOverKey` session value. HTML5 DnD doesn't fire on touch, so the tray is desktop-only and the tap-+ picker stays the universal/mobile path. **From a recipe card (home grid).** Signed-in cards carry an "+ Add to plan" calendar button (`AddToPlanButton`, top-right at `right-16`, just left of the bookmark) that opens `AddToPlanModal` — a centered day+meal picker (navigable week; defaults to today + Dinner) that upserts straight into `meal_plans` via the standalone `addRecipeToPlan` helper. The button is gated to signed-in users (its prop is only passed when a session exists), so anonymous cards are visually unchanged. This is the cross-route path — you can't drag between `/` and `/plan`, so the card affordance is a button + modal rather than a drag.

**Build shopping list from plan (item 2).** A rust "Build shopping list" button in the `/plan` header (disabled on an empty week) sums the visible week's planned recipes' ingredients — scaled by how many times each recipe is planned, minus anything matched in the Fridge Basket — into the Stage N+2a shopping list (one N+2c provenance source per recipe), then routes to `/shopping-list`. Re-building is idempotent (re-send replaces a recipe's contribution rather than double-counting).

---

# Routing (Stage 8)

The app uses `react-router-dom` for URL-driven views as of Stage 8. The state-driven view cascade (`showProfile`/`showBookmarks`/`showCreate`/`selectedRecipe`/`editingRecipe`) was replaced with `<Routes>` so deep links work, the back button behaves naturally, and recipe URLs are shareable.

## URL scheme

| Route | View | Auth |
|---|---|---|
| `/` | Home grid | anonymous + signed-in |
| `/recipe/:id` | Recipe detail | anonymous + signed-in (RLS gates visibility) |
| `/recipe/:id/edit` | Edit form (CreateRecipe in edit mode) | author only — non-authors redirect to `/recipe/:id` |
| `/new` | Create form | signed-in only — anon redirects to `/` |
| `/profile` | Profile | signed-in only — anon redirects to `/` |
| `/bookmarks` | My bookmarks | signed-in only — anon redirects to `/` |
| `/shopping-list` | Shopping list (Stage N+2a) | anonymous + signed-in — localStorage-backed, no auth required |
| `/plan` | Meal plan week grid (Stage M+1) | signed-in only — anon redirects to `/` |
| `*` | Catch-all → `/` (replace) | any — keeps URL bar from displaying a 404 the app can't render |

Auth lives at `/auth`? **No.** It stays as an overlay state (`showAuth`). The slide-in motion (`fixed inset-0 z-50 translate-x-full → translate-x-0`, 450ms ease-out) is documented above as deliberate UX. Treating Auth as a route would either (a) lose the overlay-over-current-page metaphor by replacing the underlying view, or (b) require complex modal-route patterns. Sign-in is invoked in-place from any route, and the URL bar reflects whatever route the user was on when they clicked Sign In — so they return to that exact context after authenticating. A future iteration could expose a `?signin=1` query param if shareable sign-in becomes a need (e.g. an email link to "click here to sign in"), but that's deferred.

## Deep-link fetch cascade

`/recipe/:id` rendering uses a two-tier lookup in `RecipeDetailRoute` (in `src/App.jsx`):
1. **Cache hit** — find the recipe by id in the parent's `recipes` array (already paginated into memory). This is the common case: clicking a card from the grid puts the recipe in cache, so the route is instant.
2. **Cache miss → fetch** — pasting `/recipe/<uuid>` into a fresh tab finds an empty `recipes` array. The component falls back to `supabase.from('recipes').select('*').eq('id', id).maybeSingle()` and renders a `Loading recipe…` placeholder while the fetch is in flight.

RLS handles visibility automatically — private recipes belonging to other users return no row, surfaced as a "Recipe not found" empty state with a "← Back to recipes" CTA. The empty state shares the same ✦ glyph + serif + italic-rose layout as the other empty states in the app.

## Vercel SPA rewrite

`vercel.json` at the repo root rewrites every path to `/index.html`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Vercel's filesystem-first behavior means built assets (`/assets/*.js`, `/assets/*.css`) still resolve normally — the rewrite only catches client routes like `/recipe/<uuid>` that don't exist as files. Without this, deep links and page reloads on sub-routes would 404 in Production. Local dev (`npm run dev`) has Vite's history fallback enabled by default, so the same URLs work without extra config.

## Why not `<Outlet>` with shared layout

A "shell + outlet" structure (header + search row in App, route content rendering inside `<Outlet>`) was considered. Skipped because each view (home grid, recipe detail, profile, bookmarks, create) has its own header treatment — there isn't a single chrome that wraps all of them. A shared shell would either need to be invisible-via-CSS on the non-home views or carry conditional rendering that defeats the point. Routes are simpler at this scale.

## Auth-overlay z-index

The Auth overlay stays at `z-50`, above the Routes. The env banner is `z-[60]` so it remains visible during sign-in (the moment the test/prod mistake could happen). No routing change affects these layers.

The full fixed-overlay stack, low to high: Auth overlay `z-50` → env banner `z-[60]` → **CookingMode `z-[100]`** → CookingMode's ingredient slide-up sheet `z-[110]` → **TimerWidget `z-[120]`** (so a running timer floats over cooking mode) → **TimerSetSheet `z-[130]`** (so you can add a timer from inside cooking mode). The 100+ band is reserved for the cooking-mode family; keep new ad-hoc overlays in the 50–60 band unless they must layer over cooking mode.

## Cooking-mode timer (Stage 19)

The kitchen timer is a single App-level `<TimerWidget>` portaled to `<body>`, so a running timer stays visible across the home grid, recipe detail, and cooking mode — set a pasta timer, browse elsewhere, it still rings.

- **Floating pills, bottom-left.** Each timer is a `bg-paper paper-grain` pill (`rounded-xl shadow-lg border-paper-shade`) with a `font-display` uppercase label, a large `font-serif tabular-nums` countdown, and a control row — pause/resume (rust play disc when paused) · reset · `+1:00` · dismiss `✕`. A "+ Timer" pill below the stack opens the set sheet so the widget is self-sufficient once visible.
- **Expired state** flips the pill to `bg-rose-dark text-paper` with `motion-safe:animate-pulse` and a "TIME'S UP" label; controls collapse to a prominent **Stop** (= dismiss, which also silences the alarm) plus `+1:00`. `aria-live="assertive"` announces completion. Rose-dark carries the alarm tone because the rustic palette has no red — consistent with the Delete / error-toast convention.
- **Footer-collision lift.** The bottom-left corner is also where CookingMode's *Previous* button lives. CookingMode toggles `body.cooking-active`; an index.css rule `body.cooking-active .timer-widget { bottom: 5.75rem }` raises the widget above the footer **only** while cooking — every other surface keeps the low `bottom-4` corner. A global fixed widget inherently overlays scrolling content elsewhere (same posture as the scroll-to-top / Fridge buttons); only the cooking-mode nav warranted a dedicated dodge.
- **Set sheet** is a bottom sheet (centered on `sm+`) with preset chips (1/3/5/10/15/30 min) + a custom `mm:ss` field, matching the CookingMode ingredient-sheet vocabulary. Its Escape handler runs in the **capture phase** with `stopPropagation` so closing it doesn't also trip CookingMode's window-level Escape-to-exit.

## `onAuthStateChange` gotcha

The sign-out-redirect-to-home logic gates on `event === 'SIGNED_OUT'` rather than `!session`. The reason: Supabase fires `INITIAL_SESSION` with `session=null` on every page load for anonymous users — without the event-name gate, every deep link (e.g. `/recipe/:id` pasted into a fresh tab) bounces back to `/` immediately on mount before the route even has a chance to render. A subtle but critical distinction documented in the relevant `useEffect` in `src/App.jsx`.

---

# Profile — book-spread layout (Stage 14)

Both profile surfaces — `/profile` (own, editable) and `/profile/:id` (another author, read-only) — render as an **open book**: a two-page spread with the inside-cover utilities on the left and the book's contents on the right.

## The metaphor

| Page | What lives on it | Why |
|---|---|---|
| **Left page** *(inside cover)* | User info & utilities — avatar, identity, edit forms (own) or read-only identity + follow controls (author) | Cookbooks traditionally carry inscriptions, library plates, owner marks, and notes on their inside cover. Treat that as the user's "self" surface. |
| **Right page** *(contents)* | Recipes — My Recipes (own) or the author's public recipes | A cookbook opened to its first page shows its recipes. Treat that as the content surface. |

The spread is implemented as a shared shell [`<ProfileBookSpread>`](../src/components/ProfileBookSpread.jsx) consumed by both [`Profile.jsx`](../src/components/Profile.jsx) and [`AuthorProfile.jsx`](../src/components/AuthorProfile.jsx). The shell is layout-only — what goes inside each page is the caller's concern, so the editable vs read-only divergence stays in the consumer components where it belongs.

## Visual treatment

- **Spread container:** `paper-grain min-h-screen` extends the page texture to the viewport edges so the spread reads as resting on the cookbook's open surface, not on a generic web page.
- **Pages:** card-paper tone `#fbf6f1` (same tone used by recipe-detail and form cards) with a 1px `paper-shade` border and a soft drop shadow. At `lg+` each page also carries an **inset shadow on its inner (fold-side) edge** — the page subtly darkens toward the binding, suggesting paper curling into the fold.
- **Equal page heights:** the grid uses the default `align-items: stretch`, so both pages take the height of the taller column. When the recipes side grows, the inside-cover paper extends with it — matches a real open book where both pages are the same physical sheet. Content stays anchored to the top of each page; empty paper fills the rest, which is the correct cookbook-inside-cover behavior (the cover doesn't expand to center its contents).
- **Spine:** a 28px-wide vertical band between the two pages at `lg+`. A three-stop tan↔ink↔tan gradient (darker in the center) with two thin dark hairlines along each edge stands in for the binding shadow + the page-edge rule. **Felt, not seen** — strong enough to read as a spine, quiet enough not to overpower the content.
- **Mobile (< lg):** the spread stacks vertically — left page on top, right page below — with `margin-top` on the right page so they read as distinct surfaces. The spine collapses (set to `display: none`); a horizontal separator would have been the obvious mobile counterpart, but the existing page-edge borders already separate the two stacked pages cleanly without one.

The narrow page (left, `minmax(320px, 420px)` at `lg+`) deliberately caps below the wide page so the proportions echo a real book — the inside cover is a fixed-width surface; the contents page is where the volume of material lives.

## What goes on the left page

**`/profile` (own, editable):**
- `Edit Profile` form — email (disabled), username, bio, Update button
- `Change Password` form — new password input, Update button
- No card wrapper around the forms (the page itself is the card surface)

**`/profile/:id` (read-only):**
- Avatar (image or `tan-soft` initial chip — matches Comments / Following row pattern)
- Display name (font-display) + optional `full_name` subtitle (italic, muted)
- Bio (font-serif, ink/80)
- Follow / Following / Unfollow controls + notify-me checkbox

The follow control cluster lives on the left page because following is a relationship to the *author* (an identity/inside-cover concern), not to their recipes.

## What goes on the right page

**`/profile` (own):**
- `My Recipes` grid — Pinterest-style masonry, `columns-1 sm:columns-2 lg:columns-2 xl:columns-3` (one column lower than the home grid since the right page is narrower than the full-bleed home wrapper)

The Following list has been lifted into its own phonebook routing (Stage 14 item 5) — see the "Phonebook book" section below. The detached Following tab on the left page now navigates to `/profile/following` rather than rendering an inline list.

**`/profile/:id` (read-only):**
- `Recipes` grid — public recipes only (RLS already gates visibility), same masonry treatment

## What this stage does *not* do

- **Sidebar tabs `[Account, Appearance, Security, Notifications]`** — Stage 14 item 4 layers these onto the left page. Until then, the left page renders the two existing forms (own) or the existing identity + follow controls (read-only) as a single flow.
- **Backdrop themes** — Stage 14 item 3 adds a backdrop selector, surfaced inside the Appearance tab (which item 4 will add). Default `paper-grain` backdrop ships now.
- **Recipe → book entity** — *(done — Stage 14 item 1)*. RecipeCard now renders as a closed mini-book (cognac spine on the left, page-edges sliver on the right). See the "Recipe as a closed mini-book" section below.
- **Phonebook for following + parallel routing** — *(done — Stage 14 item 5)*. Implemented at `/profile/following` via [`<FollowingPhonebook>`](../src/components/FollowingPhonebook.jsx). See the "Phonebook book" section below.

## Open question pinned forward

The right page renders recipes as cards; clicking one navigates full-page to `/recipe/:id` (Stage 8 routing unchanged). An alternative — inline "page turn" within the spread — was considered and explicitly deferred: it would require nested routing and would entangle with the print/share/PDF flow, which all assume RecipeDetail is the full page. If/when the recipe-as-book treatment (item 1) lands, revisit whether opening a book from inside another book ought to mean a page-turn rather than a route transition.

## Right-page recipes carousel

The recipes section on the right page caps its height to match the left page's intrinsic content height — so the spread stays visually rectangular rather than letting the recipes column run unbounded down the page. When recipes would overflow that cap, they paginate into "book pages" the user navigates through.

Implemented as [`<RecipesCarousel>`](../src/components/RecipesCarousel.jsx); consumed by both [`Profile.jsx`](../src/components/Profile.jsx) (My Recipes) and [`AuthorProfile.jsx`](../src/components/AuthorProfile.jsx) (author's public recipes).

### Height coupling

The parent component (Profile or AuthorProfile) puts a `ref` on the left page content wrapper and a `ResizeObserver` reads its `contentRect.height` whenever it changes (form input focus reflow, bio textarea growth, viewport width changes). That measured height passes to `<RecipesCarousel maxHeight>` and becomes the viewport's fixed height.

Note the measurement is on the **content wrapper**, not the page surface — the grid uses `align-items: stretch` so the page surface itself stretches to row height, which would create a feedback loop. The inner content wrapper's height is stable and gives a clean "intrinsic" reading.

ResizeObserver is feature-detected (`typeof ResizeObserver === 'undefined'` short-circuits the effect). On the rare browser without it, `maxHeight` stays `null` and the carousel falls back to a `minHeight: 420px` viewport — degraded but not broken.

### Cards-per-page

Computed from `maxHeight`: roughly `Math.max(2, Math.floor((maxHeight - 80) / 240) * 2)` — assumes 2 columns and ~240px per row. Minimum 2 cards/page so pagination always makes progress. Defaults to 6 when `maxHeight` is unknown.

This is a heuristic, not exact — variable card heights (image aspect ratios, description length, tag chips) mean some pages may underflow or have a partial last row. Acceptable v1 tradeoff; documented here so the next person doesn't have to rediscover.

### Page navigation

| Input | Effect |
|---|---|
| Wheel down inside the viewport | Next page |
| Wheel up inside the viewport | Previous page |
| Horizontal touch swipe (≥60px, horizontal > vertical) | Page nav in swipe direction |
| `→` / `←` arrows when viewport focused | Next / previous page |
| `Home` / `End` when viewport focused | First / last page |
| Indicator pill numbered buttons | Jump to specific page |
| Indicator `«` / `»` buttons | First / last page |

**Wheel cooldown:** 450ms after a page change, additional wheel events are ignored. Without this, a single trackpad gesture would flip through several pages instantaneously.

**Boundary release:** at page 0 (scrolling up) or last page (scrolling down), the wheel event is NOT prevented — document scroll resumes naturally so the user can scroll past the spread to the Following section / page footer without being trapped.

**Touch direction:** only horizontal swipes navigate (vertical drag stays available for document scroll on phones). The `Math.abs(dx) > Math.abs(dy)` guard means an ambiguous diagonal swipe falls to vertical scroll, not page nav.

### Indicator pill

Sits absolutely positioned at the middle-bottom of the carousel viewport (`bottom: 8px`, centered with `left: 50%; translateX(-50%)`). Reading the bar left-to-right:

1. `«` — jump to first page (disabled when already there)
2. Numbered page buttons in a windowed list — for ≤7 pages all numbers show; for more, first + (current ± 1) + last with `…` ellipses in between
3. `»` — jump to last page (disabled when already there)
4. Italic readout `Page N of M` — also `aria-live="polite"` so screen readers announce page changes

The pill is paper-shade with a soft shadow so it floats over the recipes without interrupting the page texture.

### Single-page fallback

If `recipes.length <= cardsPerPage`, the carousel renders no chrome — just the recipes as a plain `columns-1 sm:columns-2` masonry. The carousel only earns its complexity when there's actually pagination work to do, and the heading + indicator on a one-page collection would just be noise.

### Following section coexistence

Historically `/profile`'s right page also rendered a Following list below the recipes carousel. Stage 14 item 5 lifted that list into its own phonebook routing (see below), so `/profile`'s right page is now recipes-only.

---

## Phonebook book (Stage 14 item 5)

Followed authors live in their own book at `/profile/following` — a parallel surface to `/profile` and `/profile/:id`, all three sharing the [`<ProfileBookSpread>`](../src/components/ProfileBookSpread.jsx) shell. Three books, one shell.

| Page | Contents |
|---|---|
| **Left page** *(phonebook)* | Vertical bookmark-ribbon list of followed authors — one entry per author. Each is a paper-shade pill with a 4px transparent left border; the active row picks up a rust left-accent stripe and shifts 8px to the right via `translateX`, mimicking how a real bookmark protrudes from a book. |
| **Right page** *(contents)* | The selected author's public recipes inside the same `<RecipesCarousel>` used by `/profile` and `/profile/:id`. Header carries "View profile →" (to `/profile/:id`) and "Unfollow" pill controls so the directory entry feels actionable. |

### Why a separate route, not an in-tab section

The followed-authors set is conceptually its own "book", not a section of the user's own profile. Splitting it off lets the recipe-carousel device be reused as the right-page payload — an in-tab list couldn't host a `<RecipesCarousel>` without nesting a carousel inside a fixed-height tab panel.

### Entry point from `/profile`

The detached Following tab on `/profile`'s left page (item 4) carries an `onSelect` override on its `<ProfileTabs>` tab definition that calls `navigate('/profile/following')` instead of swapping the active panel. The detached pill grows a right-side chevron to telegraph the route hop visually. The Following tab is the canonical entry point — there is no inline-list mode anymore.

### Height stability

[`.phonebook-bookmarks`](../src/index.css) uses the same `height: min(75vh, 700px)` cap as `<ProfileTabs>`, so the spread stays a stable rectangle regardless of how many authors the user follows. Without it, a user with one follow would collapse the left page, force the height-coupled right-page carousel to ~80px, and squish every recipe card. The bookmark list scrolls within the panel (`overflow-y: auto`, `overflow-x: hidden` so the active-row `translateX` doesn't create a horizontal scrollbar).

### Per-author notify pref intentionally omitted

The notify-on-new-recipe toggle is NOT exposed in the bookmark list. The phonebook should read like a directory entry — one item per author, minimal chrome. Notify toggles remain reachable on `/profile/:id` (per-author setting) and the header NotificationsBell (the consumption surface), both one click away from any phonebook entry.

### Source of truth & optimistic state

The bookmark list filters through the central `useFollowing` state (`isFollowing`) so an optimistic unfollow elsewhere in the app reflects here without a refetch, and a rollback puts the row back in place. The local `followedAuthors` list is just the profile-data sidecar (avatars / names) so the bookmark UI doesn't N+1-query profiles per row.

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

---

# Polish primitives (Stage 6)

Conventions added during the Stage 6 polish pass. New components/views should follow these so the app stays visually coherent.

## Keyboard focus ring

A single global rule in [src/index.css](../src/index.css) renders a 2px `var(--color-rust)` outline at 2px offset on `button`, `a`, and `[role="button"]` when `:focus-visible` fires. Two specifics worth knowing:

- **`:focus-visible`, not `:focus`** — mouse clicks don't draw the ring; only keyboard focus does. Drawing focus rings on mouse click is the classic "ugly" pattern; this avoids it without sacrificing keyboard accessibility.
- **Inputs and textareas opt out of this** — the search bar and comment textarea have their own `focus:ring-2 focus:ring-rust/40 focus:border-rust` treatment inline. If you add a new input with a custom focus style, use `focus:` (or both `focus:` and `focus-visible:`) — the global rule only covers buttons.

If you build a custom interactive element (e.g. a card-like div that handles click), mark it with `role="button"` and `tabIndex={0}` and the global rule will give it a focus ring for free. RecipeCard does exactly this.

## Loading skeletons

[src/components/Skeleton.jsx](../src/components/Skeleton.jsx) exports a small set of palette-consistent placeholders:

- `<Skeleton className="…" />` — base shimmering box. Compose for one-offs.
- `<SkeletonCard index={i} />` — masonry-friendly card placeholder. Varied heights via the `index` prop so a row of skeletons doesn't all align.
- `<SkeletonComment />` — avatar circle + header + two body lines, matching the real `CommentItem` shape.

All use Tailwind's `animate-pulse` (subtle opacity oscillation) on `bg-paper-shade`. No custom keyframe needed — palette-consistent by construction.

**Accessibility:** each individual skeleton carries `aria-hidden="true"`. The container that wraps a group of skeletons carries `role="status"` + `aria-label="Loading recipes"` (or "ingredients", "comments", etc.) so assistive tech announces the loading state once, not per-shimmer. When the real content arrives, the role/aria-label disappear with the loading branch and screen readers continue normally.

## Empty states

The shared visual recipe across every "nothing here" view: centered text block, generous vertical padding (`py-12` to `py-16`), and three stacked elements top-to-bottom:

```
[ ✦ ]                                              ← text-2xl text-tan
Headline in serif                                   ← font-display text-xl text-ink
Italic-serif subtext explaining what to do next.    ← font-display italic text-rose
[ optional CTA button ]                             ← rust primary, or paper-shade secondary
```

The `✦` glyph is the same one used on the recipe-detail page divider (`.recipe-content hr::after`) — it's the app's quiet "page ornament" mark and gives empty space visual weight without filler.

Two design decisions worth keeping:

- **Always include the next-step CTA when one exists.** The home grid's "no recipes match search" empty state offers Clear search; "signed in, no recipes" offers + New Recipe; "anonymous, no recipes" offers Sign In. Empty states without a path forward feel like dead ends.
- **One empty-state component does not fit all.** App.jsx's `<EmptyGridState>` is local to that file because the messages and CTAs are coupled to grid context. Other views (Profile My Recipes, MyBookmarks, Comments) inline their own small empty blocks following the same visual recipe. If a fourth view duplicates the structure substantially, *then* promote it to a shared component — not before.

## Floating affordances (density toggle, scroll-to-top)

Both floating controls in the home view share one visual treatment so they read as a pair: 48×48 circular buttons (`w-12 h-12 rounded-full`), `bg-paper-shade/90 backdrop-blur-sm shadow-md`, ink-stroked icons. Together they pin to the top corners of the viewport — density toggle top-left, scroll-to-top top-right — and fade in/out together once the user scrolls past the action row (`scrollY > 80`).

**Why fade rather than mount/unmount:** the controls live in the DOM at all times with `aria-hidden={!scrolled}` + `tabIndex={scrolled ? 0 : -1}` + `opacity-0 pointer-events-none` when hidden. Keeping them mounted means CSS handles the entrance smoothly (same pattern as the Auth slide-in overlay) and screen readers / keyboard focus skip them cleanly when invisible.

**Density toggle has an inline twin** in the action row, left of the search input. The twin is always visible at the top of the page; the floating copy takes over once the twin scrolls off. Both buttons share an extracted `densityIcon` JSX const and `densityAriaLabel` string so there's a single source of truth for icon and label — no drift between the two copies. The icon previews the destination state: a 2×2 grid means "tap to densify", two wide bars means "tap to return to default".

Scroll-to-top has no inline twin — there's nothing to do at the top of the page if you're already there. Single floating instance only.

## Infinity-scroll markers

Two ephemeral indicators sit below the grid when more pages are available:

- **"Loading more recipes…"** — italic-serif rose text (matches the existing loading-state copy on the home grid), centered, `py-6`. Carries `role="status"` so screen readers announce it. Shown only while an append fetch is in flight.
- **`✦` end marker** — single tan-colored star glyph, also centered, `py-6`. Appears only after the user has loaded at least one page beyond the first and the server returned a partial final page. A quiet "you've reached the end" without text.

The sentinel `<div>` that drives the IntersectionObserver is `h-1 w-full` and `aria-hidden`. It exists purely to be observed; it has no visual presence.

Search disables the sentinel: when the user is typing in the search bar, "load more" is hidden because the search filters client-side over loaded pages only — appending more rows that may not match the search would surface confusing UX. Documented as a known limitation; the eventual fix is server-side `ilike` filtering with pagination reset on each keystroke.

## Backdrop (Stage 14 item 3)

The "surface the cookbook rests on" is user-selectable from the Appearance tab on `/profile`. Five options ship in v1, all rendered with pure CSS — no image assets, so palette shifts and devicePixelRatio changes don't degrade the visual:

- **Rustic paper** *(default)* — the original `.paper-grain` treatment. Cream cookbook page with offset radial-gradient grain.
- **Wood library** — warm oak grain. Repeating horizontal stripes over a vertical wood-tone gradient. Reads as a kitchen-shelf cookbook resting on wood.
- **Kitchen cabinet** — brushed steel. Fine vertical hairlines over a cool-gray gradient. Modern utility surface.
- **Restaurant notepad** — yellow ruled pad. Horizontal blue rules, red left margin, a perforated top-tear strip. Reads as line-cook reference.
- **Digital space** — flat neutral with a soft radial vignette. Minimal, no texture. v1 ships this as a *light* neutral so dark-ink page chrome (home-grid header, tag chips, action buttons) stays readable without per-element contrast overrides. A genuine dark-mode treatment is a future follow-up — would need a sweep across text-color utilities across the app.

**Implementation.** `useBackdrop()` (in [src/hooks/useBackdrop.js](../src/hooks/useBackdrop.js)) writes `data-backdrop="<id>"` onto `<html>`. Each variant lives in [src/index.css](../src/index.css) as a `html[data-backdrop="<id>"] .paper-grain { ... }` override. The default rustic treatment is the base `.paper-grain` rule; the four alternates each replace `background-color` + `background-image`. **Every consumer surface keeps the same `.paper-grain` className** (HomeView, ProfileBookSpread, RecipeDetail, AuthorProfile, FridgeBasket, MaintenancePage) — swapping backdrop is purely a CSS rebind, no JSX changes at the call sites.

**Persistence.** localStorage (key `cookbook.backdrop`). Per-device, not per-user — anon visitors also browse the home grid and benefit from picking a backdrop, so a `profiles.backdrop_preference` column would force a "must be signed in to choose" UX that doesn't fit. The hook validates the stored value against the known options on read so a corrupted entry falls back to the default rather than serving an undefined attribute. **Upgrade path:** when cross-device sync becomes a real ask, add a `profiles.backdrop_preference` column, have the hook prefer that value when a session exists, and write through to localStorage as a mirror. The hook's API (`{ backdrop, chooseBackdrop }`) stays unchanged.

**Swatches.** The Appearance tab renders a 64×64px preview chip next to each option using the same gradient ingredients at a smaller repeat scale, so the user sees the destination state before committing. Selection is immediate (no Apply button) — the change is reversible and the user should see the page they're configuring change as they pick.

**Forward-looking sketches** (not implemented):
- **Large library bookshelf** — when signing out / switching accounts, the current cookbook closes and recedes into the shelf; login grabs another. Scrolling could push books in/out of the shelf in parallax.

## Recipe Item

- **Each recipe is a book** - Instead of being a card, could represent it as a book that comes out into the middle, opens and can see the ingredients and steps inside. Alternate styles can be supported.

---

# Recipe as a closed mini-book (Stage 14 item 1)

Every recipe card in the home grid, MyBookmarks, AuthorProfile, and the Profile/Phonebook `<RecipesCarousel>` reads as a closed hardcover book on a shelf. The flat card frame is gone; the wrapper is a `.recipe-book` with a leather spine on the left, a page-edges sliver on the right, and the existing cover art (image or cognac leather) between them.

## Anatomy

| Layer | Class | What it is |
|---|---|---|
| Frame | `.recipe-book` | Outer wrapper. Cream paper base, asymmetric `border-radius: 3px 8px 8px 3px` (tighter on the spine side), layered drop shadow. Carries the hover lift + shadow transition. |
| Spine | `.recipe-book-spine` | 8px (desktop) / 6px (phones) dark leather strip down the left edge. A right-fading gradient from deep saddle (binding) to a faint highlight (cover edge) implies the curvature into the fold. Absolute, `z-index: 3`, `pointer-events: none`. |
| Page edges | `.recipe-book-pages` | 4px cream strip down the right edge, inset 4px from top/bottom so it reads as the page block protruding from under the cover. A vertical `repeating-linear-gradient` draws ~hairline marks suggesting individual page edges. Dark hairline borders on both sides. Slides outward 2px on hover. |
| Cover | `.recipe-book-cover` | The actual content area. Fills the whole card; spine + page-edges overlay its outer edges. Two variants below. |

The hover state lifts the book `translateY(-3px)`, deepens the shadow, and slides the page-edges 2px outward — visual metaphor: the user is pulling the book off the shelf to open it.

## Cover variants

**Image cards** — the recipe image fills the cover from edge to edge (with the spine + page-edges overlaying ~12px of art on the outer columns). The existing bottom-gradient overlay still carries the title, with the description + tags revealed on hover. The `sepia-[0.08]` filter softens modern photography toward "old cookbook plate" without going full vintage.

**Image-less cards** (`.recipe-book-cover-leather`) — cognac leather treatment built from layered radial gradients (warm highlight top-left, dark vignette bottom-right). Title in **embossed cream serif** with a two-tone text-shadow (dark on top, faint cream below — the same "pressed into leather" trick as `.auth-book-brand-text`). Title sits centered, followed by a thin cream rule, italic-serif description, tag chips with translucent cream borders, and a small `✦` glyph blind-embossed at the bottom.

## Why overlay the spine instead of pushing the cover inward

The spine and page-edges sit at `z-index: 3` and cover the outer ~12px of cover art. The alternative — `margin-left: 8px; margin-right: 4px` on the cover — was tried and reverted, because the `<RecipesCarousel>` pins card height to fill its grid cell, and the cover margins fought the carousel's `object-fit: cover` image rule. Overlaying is also conceptually correct: on a real closed book viewed front-on, the spine sits in front of the cover.

## Backdrop interaction

The cognac-leather tones don't reference palette tokens (they pre-date the rustic-paper system and match the Auth book's `.auth-book-cover` directly). The card reads against every Stage 14 item 3 backdrop variant — paper, wood, cabinet, notepad, digital — because cognac leather has high contrast against every backdrop tone the project ships. If a future backdrop pushes toward a similar terracotta range, the leather treatment would need a darker fallback; not a current concern.

---

# Recipe detail — sheet vs book-spread layout toggle (Stage 14 item 1)

[RecipeDetail.jsx](../src/components/RecipeDetail.jsx) carries a layout toggle in the action row (alongside Like / Bookmark / Share / PDF). Two modes:

| Mode | Visual | Markup |
|---|---|---|
| `sheet` *(default)* | Single-column scroll, the original layout. Ingredients section, `<hr>` rule, Steps section. | `.recipe-content` |
| `spread` | Two-page open book. Ingredients on the left page, Steps on the right, the standard tan↔ink spine between them at `lg+`. Below `lg` the pages stack vertically and the spine collapses. | `.book-spread.recipe-content-spread` with `.book-page-left` + `.book-spine` + `.book-page-right` |

The toggle reuses the same `.book-spread / .book-page` vocabulary the profile surfaces already use, so users see one consistent "open book" treatment across the app.

**Persistence:** sessionStorage key `cookbook.recipeDetailLayout`. Kitchen-session scope (matches `checkedIngredients` / `checkedSteps` / `lastViewedRecipeId`): the preference travels across recipes inside the same tab session but resets when the tab closes. Per-user-account persistence was considered and rejected — the choice is a screen-real-estate preference, not an identity one; treating it as session-local keeps the schema clean.

**Header, author actions, admin panel, Comments** all stay outside the body branches — single-column regardless of mode. The book metaphor applies to ingredients-and-steps (the recipe's "contents"); everything else is chrome.

**Print / PDF:** `@media print` rules in [src/index.css](../src/index.css) override `.recipe-content-spread` back to a single column when the page is printed. This preserves the existing kitchen-card-friendly print/PDF layout regardless of which mode the user is in on screen. Caveat: html2pdf captures the live DOM via html2canvas, not the print stylesheet, so the in-app PDF download will reflect the current screen mode. Acceptable tradeoff — the user has explicit control via the toggle right before they click Download.

---

# Per-step photos (Stage 15 item 1)

Authors can attach one photo per step in CreateRecipe; readers see a thumbnail inline on RecipeDetail (sheet + spread layouts), expandable into a full-screen lightbox; cooks see the same photo in the bottom-left quadrant of the step canvas in CookingMode, with the Mark-step-done pill paired to its right.

## CreateRecipe authoring affordance

Per-step row, below the instruction textarea: a 24×24 (`w-24 h-24`) thumbnail slot.

- **No photo yet:** dashed-outline tile with a `+` glyph and "Add photo" label. The whole tile is the click target via a wrapper `<label>` that hides the `<input type="file">` — keeps the keyboard semantics of a real file input without the OS-default ugliness.
- **Photo selected (blob URL preview from `URL.createObjectURL(file)`):** the image fills the tile (`object-cover`), with a small ✕ pill at the top-right corner removing both the pending File and any carry-forward `photoPath` (un-attaching the photo entirely). Removing → save writes `photo_path = NULL`.
- **Edit mode (existing photo):** same as "Photo selected" but the preview is the public URL of the existing storage object, not a blob URL. Picking a new file replaces it; ✕ un-attaches.

Help text beside the slot reads: *"Optional. One photo per step, ≤ 5 MB. JPG, PNG, or WebP."* — exactly the limits enforced by the bucket so the user isn't surprised by an upload rejection.

The thumbnail is uncolored chrome — palette stays in line with the rest of CreateRecipe (pre-retint indigo/gray utilities). Retint piggybacks on the existing CreateRecipe-on-retint-list item, not on this stage.

## RecipeDetail thumbnail + lightbox

Each step's `<li>` carries the photo as a separate row beneath the label (not inline with the checkbox + instruction). Indented to match the instruction text alignment (`ml-8`). 32×32 (`w-32 h-32 object-cover`) — large enough to read at arm's length without crowding the step list.

The thumbnail is a `<button>` (not a bare `<img>`) — keyboard focus + screen-reader semantics + the `focus-visible:ring-2 focus-visible:ring-rust` ring all come from `<button>`. Hover bumps the border from `paper-shade` to `rust` so the affordance reads as interactive.

**Lightbox:** a `fixed inset-0 z-[120]` overlay at `bg-ink/85` darkening, the image centered with `max-w-full max-h-full object-contain` so it scales to the viewport without cropping. A `w-11 h-11` ✕ button sits at `top-4 right-4`; backdrop click also closes; Escape closes (via a scoped `keydown` listener mounted only while the lightbox is open). The image itself is `onClick={(e) => e.stopPropagation()}` so a tap on the image doesn't close — the backdrop is the close surface.

z-index `120` sits above CookingMode (`100`) and the ingredients sheet (`110`); the lightbox is intentionally non-stacking with cooking-mode (it's not reachable from there).

The thumbnail and lightbox both carry `.no-print` because Stage 8's print stylesheet already linearizes the step list to text-only; rendering thumbnails in a PDF kitchen-card adds bytes for no functional value when the user is reading it on paper. The html2pdf-based "Download PDF" follows the same `.no-print` filter.

## CookingMode bottom-left quadrant

When a step has no photo: layout is unchanged — kicker / instruction text / Mark-step-done pill centered in a single column.

When a step has a photo: the step canvas grows a `grid-cols-2 gap-4 items-center` row below the instruction text:
- **Bottom-left cell:** the photo, `w-full max-h-64 landscape:max-h-48 object-contain rounded-md justify-self-start`. Contained, not cover-cropped — instructional photos lose meaning under a crop. Landscape gets a tighter cap so the photo doesn't push the pill below the fold on a propped phone.
- **Bottom-right cell:** the existing Mark-step-done pill, centered in its half via `flex justify-center`.

`items-center` vertically centers the pill against the photo's content box, so the pill doesn't sit tight to the bottom edge of a photo that ran shorter than the max-height.

**No lightbox on this surface.** The cooking-mode canvas is already full-screen; opening a lightbox over it is a near-duplicate "make it bigger" gesture, and tapping the photo would steal a tap the user wants free for the pill. The photo here is presentational only — its taps don't trigger any handler.

The swipe gesture (Stage 9 envelope, captured at the cooking-mode root) is unaffected — touches inside the photo region bubble normally through the carousel root, since the photo isn't a button and doesn't intercept.

---

# Cooking mode (Stage 15 item 5)

Full-screen kitchen-focused step view launched from a prominent rust "Start cooking" CTA above the recipe content on [RecipeDetail.jsx](../src/components/RecipeDetail.jsx). [CookingMode.jsx](../src/components/CookingMode.jsx) portals to `document.body` so it overlays any route — header, footer, comments, admin panel all vanish behind it. Surface is the standard `bg-paper paper-grain` so the rustic-paper feel (and any active backdrop) carries straight in.

## Layout

Three regions, stacked column with `flex-col` and `flex-shrink-0` chrome:
- **Header** — exit (`×`) on the left, recipe title centered with a small "Cooking" rust kicker above, ingredients-list trigger on the right. All buttons are `w-11 h-11` (44px tap target) on `bg-paper-shade` circles.
- **Progress strip** — "Step N of M" + percentage on a 1.5px rust progress bar. Sits just under the header, telegraphs how much of the recipe is left.
- **Step canvas (flex-1)** — one step per page, large `font-serif text-2xl sm:text-3xl` with `landscape:text-3xl sm:landscape:text-4xl` so a kitchen-propped phone in landscape gets a meaningful type bump. Step text is `text-center` and limited to `max-w-2xl` so it's readable from arm's reach. A "Mark step done" pill below the text doubles as advance-to-next (or exit on the last step) — the hand is already there.
- **Footer** — Previous / step dots (capped at 12 visible, with `+N` overflow indicator) / Next-or-Finish. Finish on the last step is rust-filled to telegraph the terminal action.

## Step carousel mechanic

All steps are pre-rendered into a single horizontal flex row that `translateX`'s by `(-currentStep * 100) / steps.length%`. The user's drag adds `swipeX` pixels on top of that translate; on commit, React batches `setCurrentStep` + `setSwipeX(0)` into one render so the row animates smoothly from "drag position with old step" to "rest position with new step" — CSS transition takes over once `swipeX === 0`. Each step has its own `overflow-y-auto` so long instructions vertical-scroll independently without disturbing the row's horizontal translation.

The visual feel: a thumb-swipe pulls the next step into view as you drag, then snaps to it on release. No flash of empty content between steps; no React unmount/remount churn.

## Gesture envelope

Same thresholds as the Stage 9 swipe-back: ≥ 80px horizontal travel with < 40px vertical drift commits a step change; under threshold springs back via a 300ms cubic-bezier transition. Tracking lives in a `useRef` (start + last coords + `tracking` flag) so per-frame `touchmove` updates don't churn React state — only `swipeX` (capped at ±200px) goes through state. `touchAction: 'pan-y'` on the carousel root tells the browser horizontal pans are ours and vertical scrolling stays native, so long step text can scroll without hijacking. Multi-touch (`e.touches.length !== 1`) is ignored so pinch-zoom doesn't fire spurious navigation. The mid-gesture `dy > 40 && dy > |dx|` abandon check kills tracking the instant the user is clearly scrolling, not swiping.

`stopPropagation` at the cooking-mode root prevents touches from bubbling through React's synthetic event tree to RecipeDetail's swipe-back-to-home handler. React bubbles by component tree, not DOM tree, so portaling to `document.body` does NOT insulate the parent — the explicit `stopPropagation` is load-bearing.

## Wake Lock

`navigator.wakeLock.request('screen')` on mount; `release()` on unmount. The lock auto-releases when the tab becomes hidden, so a `visibilitychange` listener re-acquires on return-to-visible — otherwise tabbing away and back would let the screen dim mid-recipe. Acquisition failures (missing user gesture, hidden at acquire-time, unsupported browser) are swallowed silently; older Safari (< 16.4) just lets the screen dim normally, the rest of the view works.

## Landscape fullscreen

`handleStartCooking` on RecipeDetail requests fullscreen synchronously **inside the click handler** when the entry happens in landscape (`window.matchMedia('(orientation: landscape)').matches`). The Fullscreen API requires an active user-gesture context — moving the request into a `useEffect` on CookingMode mount would lose the gesture and silently fail. A `fullscreenRequestedRef` tracks whether the cooking-mode entry was the source of the fullscreen state, so `handleExitCooking` only calls `exitFullscreen()` when it was — yanking the user out of a fullscreen they were already in for some other reason would surprise. iOS Safari doesn't support `requestFullscreen` on non-video elements; the `.catch` swallows that and any user denial.

## Ingredients slide-up sheet

`z-[110]` (above the cooking-mode portal's `z-[100]`), bottom-anchored sheet up to `80vh`. Backdrop is a dimmer `bg-ink/40` button so a tap outside the sheet closes it. Ingredients reuse the servings multiplier passed down from RecipeDetail, so quantities scale identically on both surfaces — the user doesn't see one quantity in the recipe view and a different one once they "Start cooking". `scaleQuantity` was extracted from RecipeDetail.jsx into [src/lib/scaleQuantity.js](../src/lib/scaleQuantity.js) for this reason.

## Checklist state continuity

`checkedIngredients` and `checkedSteps` Sets are owned by RecipeDetail and threaded down as props. Toggles inside cooking mode mutate the same Sets, so exiting back to RecipeDetail preserves whatever the user marked off — and re-entering cooking mode picks up where they were. Kitchen-session scope is unchanged: the Sets reset when `recipe.id` changes (the existing Stage 7 effect), so leaving the recipe and coming back starts clean.

## Keyboard

`Escape` closes the ingredients sheet if open, otherwise exits cooking mode. `←` / `→` arrow keys advance/retreat steps. No focus trap inside the dialog (it's full-screen and the only tabbable controls are the cooking-mode chrome itself); `role="dialog"` + `aria-modal="true"` + `aria-label="Cooking {title}"` give screen readers the right framing.

---

# CreateRecipe — Ingredient entry

Ergonomics pass over the ingredient editor in [CreateRecipe.jsx](../src/components/CreateRecipe.jsx): fractions, a unit autocomplete, keyboard-driven row creation/removal, and a column-order toggle. These are all input/display concerns — the `ingredients.quantity` column stays `NUMERIC` and the `unit` column stays free text.

## Unit combobox

Each row's Unit cell is a custom `<UnitCombobox>` ([src/components/UnitCombobox.jsx](../src/components/UnitCombobox.jsx)) rather than a native `<datalist>` (which can't be palette-themed and matches substrings inconsistently across browsers). The input opens a paper-shade dropdown (`#fbf6f1` surface, `#e8dcd2` border, soft drop shadow, `max-height: 220px` with scroll) listing substring matches from [src/lib/measurementUnits.js](../src/lib/measurementUnits.js) — `matchUnits()` searches the canonical label **and** its aliases, so `tbsp` surfaces `tablespoon`. The highlighted option fills with the rust accent (`#b06452` background, `#fbf6f1` text); hover and ↑/↓ both move the highlight. Free text is always allowed — the list is assistance, not a constraint.

## Column-order toggle

A pill button (`.column-layout-toggle`) sits opposite the "Ingredients" heading in a `.form-section-head` flex row. It cycles three presets — **Name · Qty · Unit** → **Qty · Unit · Name** → **Unit · Qty · Name** — and its label always shows the active order. Paper-shade at rest, rust border + rust text on hover. The chosen order drives both the visual layout and the DOM order (so native Tab follows it) and the Enter "last field" target.

## Keyboard affordances

Qty is `type="text"` (placeholder `Qty (e.g. 1 1/2)`) and given a fixed `flex: 0 0 120px` so it doesn't sprawl like Name/Unit. `Enter` on a non-last field advances within the row; on the last field it adds a new row (and focuses it) or jumps to the next row — never submits the form. `Tab` walks the visible order natively. An italic `.ingredient-hint` line beside "Add Ingredient" spells this out, with `<kbd>` chips (`#f2e9e4` fill, `#e8dcd2` border) for `Enter` / `Tab`.

## Removing a row

A trailing `×` button (`.ingredient-remove`) closes each row inside the `.form-row` flex, sitting last regardless of the active column order. Muted glyph (`#9a8a7d`) on a paper-shade fill at rest; on hover it warms to the rust accent (`#b06452` text + border, `#f2e0da` fill) so deletion reads as the slightly-warmer action. It's hidden when only one row remains (there's always ≥1 ingredient row, so no empty state to design). After a removal, focus lands on the first field of whatever row slid into the freed slot — or the new last row when the tail was removed — so keyboard context survives. The button is a normal Tab stop (between Unit and Notes when present), but the `Enter`-to-advance flow never lands on it, so fast entry is undisturbed.

**Steps** reuse the same control. Each step's `.step-head` (a flex row mirroring `.form-section-head`) pairs the "Step N" label with the same `.ingredient-remove` `×`, right-aligned — given an explicit `height: 30px` since, unlike the ingredient row, it has no flex-stretch parent to size against. Same hidden-at-one-row rule. Removing a step renumbers the survivors' labels (the "Step N" label and the saved `step_number` are both positional, so deletion never leaves a gap), and revokes the removed step's pending `blob:` photo preview so the object URL doesn't leak — an existing edit-mode photo (an `https` storage URL) is left to orphan on save, matching the cover-swap posture.

For keyboard entry, `Ctrl`/`Cmd`+`Enter` in a step's textarea adds + focuses the next step (or advances to it). Bare `Enter` is deliberately left alone — a step is a textarea where `Enter` is a newline for prose instructions, so unlike the single-line ingredient inputs the plain key is never repurposed. An `.ingredient-hint` line beside *Add Step* (in a reused `.ingredient-tools` row) spells out the shortcut with `<kbd>` chips.

## Ingredient sections (Stage 21)

Section rows interleave with ingredient rows in the same list. A section row is a single full-width input (`.section-name`): `font-weight: 600` muted-brown text on a `#f7f1ec` paper tint with a 3px `#b06452` rust accent bar on the left — reads as a sub-heading being authored, unmistakable next to an ingredient Name field. "Add Section" sits beside "Add Ingredient" in the `.ingredient-tools` row (same utility-button treatment). Every row — ingredient and section alike — now leads with a `.row-grip` six-dot drag handle (muted `#c9b9ac`, warming to `#6b5d52` on hover; `cursor: grab`), reusing the viewer's `useDragSort` hook, and the `.ingredient-hint` line mentions the drag affordance. Section rows take the same trailing `.ingredient-remove` `×`, always visible (removing one just lets its ingredients inherit the section above). `Enter` keeps the entry flow inside the current section: at the end of a section's last ingredient it inserts a fresh row in place rather than moving focus into the next section's name input.

**Default leading section.** A **new** recipe opens with a blank section row already sitting above the first ingredient — a gentle nudge toward "For the …" grouping rather than a flat list. It carries no data weight: if the author never names it, `stripLeadingEmptySection` ([src/lib/ingredientSections.js](../src/lib/ingredientSections.js)) drops that first row on save, so an untouched new recipe persists exactly like an unsectioned one (only the *leading* blank section is auto-removed — a named leading section, or any blank section further down, is the author's own and is left alone). Edit mode never shows the seed — loading a recipe replaces the rows with its stored structure.

These controls still carry the pre-retint gray/indigo utility buttons that the rest of CreateRecipe uses; retint piggybacks on the existing CreateRecipe-on-retint-list item.

## Public/private visibility toggle

The editor's visibility control is a single pill button (`.visibility-toggle`), not a checkbox, sitting in a flex row opposite the "Create New Recipe" / "Edit Recipe" heading (alongside the Import… button in create mode). Resting (public) state pairs an open-eye glyph with "Public" on the paper treatment — `#f7f1ec` fill, `--color-paper-shade` hairline, muted-brown text. Clicking flips it to a crossed-eye + "Private" in the marked state: ink fill, paper text — the same treatment as the private badge a published card wears on the grid (RecipeCard), so the editor previews the outcome. The eye SVG paths are copied verbatim from that badge; a comment in each file marks the pairing so they stay in sync. `aria-pressed` carries the state for assistive tech, and the button's own label text ("Public"/"Private") doubles as the state name — no separate caption. It renders in **both** create and edit mode — an author must always be able to flip a recipe's visibility. Unlike the rest of this pre-retint screen, the toggle uses rustic tokens directly (same precedent as the Stage 21 `.section-name` input).

## Import modal (Stage 22)

Create mode only: an **Import…** button (same gray utility treatment as Add Ingredient) sits opposite the "Create New Recipe" heading in a flex row; edit mode renders no import affordance at all — importing over a recipe whose comments/likes already reference it would be destructive, so the entry point simply doesn't exist there.

The modal ([ImportRecipeModal.jsx](../src/components/ImportRecipeModal.jsx)) reuses the AddToPlanModal overlay posture — `fixed inset-0 z-50 bg-ink/40`, centered card, backdrop click + Escape + header `×` all close, autofocused textarea — but its surfaces keep the editor's legacy palette (white card, gray borders, indigo primary) so it blends with the form behind it; retint rides the same deferred CreateRecipe pass as everything else on this screen.

**Flow is deliberately two-step.** *Preview* runs the parser ([src/lib/recipeImport.js](../src/lib/recipeImport.js)) and shows a one-line summary — `Detected from pasted text: "Pasta alla Norma" — 5 ingredients in 2 sections, 3 steps, serves 4` — plus an amber ⚠ list of warnings (skipped notes blocks, missing pieces). *Fill form* stays disabled until a parse succeeds, and editing the paste invalidates the previous result so a stale preview can never be applied. Errors (broken JSON, a web page with no embedded recipe data, oversized pastes) render as a red line under the textarea with the modal held open.

**Filling is a plain state hand-off.** The parsed recipe routes through the same setters hand-typing uses (`ingredientsToRows()` turns section labels back into editable section rows), so the form itself is the preview/correction surface and Save runs the unchanged Stage 21 pipeline. A dirty form (anything already typed) gets a native confirm before being replaced — same posture as the delete confirms. On fill, **the visibility toggle flips to Private** and the toast says why ("Recipe imported — draft set to private until you publish it."): republishing someone else's prose is the author's explicit call, not a default.

### File drop + picker (Stage 22 v1.1)

The textarea doubles as a drop zone: dragging a `.txt` / `.md` / `.json` file over it tints the box (`border-indigo-400 bg-indigo-50` — the intensified sibling of the textarea's `focus:ring-indigo-200`, staying in the legacy indigo family since this modal defers its retint) and the helper line below swaps to "Release to import…". A thin gray affordance row under the box — *"Or drag a .txt, .md, or .json file here — choose a file"* — pairs the drop hint with a hidden `<input type="file">` picker for the non-drag path (and for mobile, where file drag isn't available). **Drop auto-previews:** unlike typing (which waits for an explicit *Preview*), a dropped file is a complete document, so it fills the textarea *and* runs the parser in one gesture — the summary/warnings card appears immediately. A **single** dropped/picked file takes this path; **two or more** switch the modal into batch triage (below). Wrong file types are rejected with a red line before any read. The intro copy also now names keyboard **dictation** (the phone mic types straight into the textarea — a free voice-input path, [refs/INPUT.md](./INPUT.md) §2.0) and the own-export round-trip.

### Batch import (Stage 22 v1.2)

Dropping or picking **2+ files** (the picker gains `multiple`) replaces the modal's paste/preview view with a **triage list**: one row per file — a green `✓` (ready, with the same detected-summary line) or a red `✗` (with the skip reason), plus a `· ⚠ N warnings` tail where the parse succeeded but flagged something. A header line counts *"N files — X ready to import, Z skipped."* The footer swaps to **Cancel · Back · Import X recipes** (the primary disabled until at least one file parsed). *Back* returns to the paste view; failed files are listed but never block the batch.

**The review still happens one recipe at a time, in the form** — the modal only stages the queue. Clicking *Import X recipes* closes the modal, loads the first recipe, and shows a persistent **batch banner** at the top of the CreateRecipe card (`bg-indigo-50 border-indigo-200`, legacy palette): *"Batch import — reviewing 2 of 5 · filename.txt"* with **Skip** and **Exit batch** controls. The Save button reads **"Save & next"** until the last item, then **"Save Recipe"**. Saving advances to the next queued recipe *without navigating away* (the app returns home only when the queue drains); Skip advances without saving; Exit batch drops the queue but keeps the current recipe on the form. A failed save holds the current item so it can be retried. Each imported recipe still flips to **private** and runs the unchanged Stage 21 save pipeline — the batch is purely a transport over the existing per-item flow ([refs/INPUT.md](./INPUT.md) §2.2).

### Import notes banner (Stage 22 v1.3)

Parser warnings used to be a flat amber list in the modal preview that **vanished the moment you clicked Fill form** — the correction surface (the form) carried no trace of what the parser was unsure about. Now warnings are structured (`{ code, message, field?, text? }`) and ride into a dismissible **"Import notes"** banner at the top of the CreateRecipe card, below the batch banner when both are present (kept visually separate: indigo = *mode*, amber = *notes*). Amber (`bg-amber-50 border-amber-200 text-amber-800/900`) stays in the modal's legacy family — it rides the deferred CreateRecipe retint like everything else here. Heading is deliberately **"Import notes," not "Errors"** — these describe how the import went; the form isn't broken.

**Hybrid staleness** (the key interaction): the three structural `no-title` / `no-ingredients` / `no-steps` warnings **live-hide** the instant their field gets content (derived at render from `title`/`rows`/`steps`, not stored) — so "No steps detected" disappears as you add the first step, giving satisfying "fixed it" feedback without a validation engine. Placement warnings (`title-in-desc`, `long-desc`) and the recovery warning stay until dismissed or actioned. `multi-recipe` is filtered out of the form entirely — it's informational and already acted on.

**Recovery of skipped text** is the headline fix: the parser stopped discarding Notes/Nutrition blocks (it now keeps the lines in `warning.text`), and that warning row gets **View** (expands a `<pre>` of the retained text) + **Add to description** (appends after a blank-line separator, never overwrites, then drops the warning). Turns the one previously *lossy* warning into a one-tap recover. In **batch triage**, the per-file `⚠ N warnings` count is now a click-to-expand disclosure (`▾`/`▴`) so you can read a file's issues before importing. *Deferred:* jump-to-field links, a Move-to-title quick-fix, per-field inline highlighting.

---

## First-run onboarding tour (Stage M item 2)

A lightweight 6-step welcome overlay shown once to brand-new signed-in users on the home grid ([OnboardingTour.jsx](../src/components/OnboardingTour.jsx)). Deliberately **not** a spotlight/coachmark tour anchored to specific cards — the masonry grid reflows by viewport and library size, so a positioned highlight would be fragile and break at phone width. Instead it's a centered modal that names each affordance in copy with a matching glyph; the grid stays visible behind the scrim so the references land. Steps follow the app's "plan → shop → cook" loop: tap a recipe → save it → plan the week → track the fridge → build a shopping list → add your own.

**Surface.** Backdrop is `fixed inset-0 z-[55] bg-ink/40` (same scrim tone as the AddToPlan modal). `z-[55]` sits above the floating density / scroll-to-top buttons (`z-40`) and the profile/sort dropdowns (`z-50`) but below the EnvBanner strip (`z-[60]`) so the env warning is never occluded; it can't collide with the Auth slide-in (`z-50`) since the tour is signed-in-only and Auth only opens for anonymous users. The card is `bg-paper border border-paper-shade rounded-lg shadow-xl max-w-sm` with `p-6` and centered text.

**Step anatomy.** A 64px `bg-tan-soft` disc holds a `text-rust` glyph (one per step: image-card / filled bookmark / calendar / fridge / cart / plus-in-circle — the fridge and cart glyphs are copied verbatim from the home-grid Fridge and List buttons so the icon maps to the control the user goes looking for), above a `font-display text-xl text-ink` heading and a `font-serif text-ink/70` body line. A row of dot indicators sits below — one per step, the current step filled `bg-rust`, the rest `bg-paper-shade`.

**Controls.** Footer splits a `text-rose` *Skip* link (left) from the navigation cluster (right): a `bg-paper-shade` *Back* button (omitted on step 1) and a `bg-rust text-paper` primary that reads *Next* until the last step, then *Got it*. Both buttons carry `min-h-[44px]` for kitchen-thumb tap targets. The whole thing is dismissible four ways — Skip, finishing the last step, clicking the backdrop ("skip-on-any-click"), or Escape — all routed through the same one-way `onDismiss` that persists `profiles.onboarding_dismissed_at` (see DATABASE_DECISIONS → "Onboarding dismissal flag"). Focus moves to the primary button on mount and on every step change so keyboard users land inside the dialog (`role="dialog"`, `aria-modal`, labelled by the heading + body).

---

## RecipeDetail drag-reorder + timer-sheet declutter (`ui-addons`)

**Drag handle.** Author-only six-dot grip (`DragHandleIcon`, two columns of three filled circles) at the left of every ingredient and step row, rendered only when the viewer is the recipe's author. Resting tone is faint — `text-ink/35` — rising to `text-ink/70` on hover so it reads as a quiet affordance, not chrome competing with the checkbox. Cursor is `cursor-grab` → `active:cursor-grabbing`; the handle carries inline `touch-action: none` so a touch-drag on it never scrolls the page. The grip is a real `<button>` with `aria-label="Drag to reorder …"` and a focus-visible rust ring, and it's tagged `.no-print` so it vanishes from PDF/print output. Each row carries `data-sort-row`; the row being dragged dims to `opacity-60`. Rows wrap their existing content in a `flex items-start gap-2` so the grip sits inline-left without disturbing the checkbox/label or the step `<ol>` marker.

**Save-order banner.** Once a drag changes the order, a `no-print` bar appears above the recipe content: `bg-tan-soft/70 border border-tan rounded-md`, holding the message "You've changed the order of this recipe." with a left-aligned ghost **Discard** and a `bg-rust text-paper` **Save order** primary (reads "Saving…" while writing). It only shows for the author and only while there's unsaved reordering — switching recipes or saving clears it.

**Timer set-sheet — custom field on demand.** [TimerSetSheet.jsx](../src/components/TimerSetSheet.jsx) now opens to just the quick-preset grid plus a full-width dashed-border "Add a custom time" button (`border-dashed border-paper-shade`, plus glyph, `min-h-[44px]`). Tapping it swaps the button for the labelled custom input + rust Start button and moves focus into the field. Re-opening the sheet resets to the collapsed state — the common case (a preset) is one tap, and the keyboard only appears when the user actually wants a custom duration.

