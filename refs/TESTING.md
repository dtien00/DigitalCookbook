# Testing

Operational reference for testing the app — seeded test accounts, how to refresh them, and a visual review checklist for changes that touch the recipe grid. Companion to [ROADMAP.md](./ROADMAP.md) (scope), [COSMETICS.md](./COSMETICS.md) (visuals), and [DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md) (schema rationale).

---

## Test accounts

Four seeded accounts each exercise one of the four library-size density tiers documented in [COSMETICS.md](./COSMETICS.md) → *Browse / Recipe Grid*. Logging in as each account shows a different grid density without any code change — useful for visual regression checking when touching the grid.

| Email                       | Password       | Recipes | Visibility | Username        | Tier when logged in (incl. public set) |
|-----------------------------|----------------|---------|------------|-----------------|---|
| `test-tiny@example.com`     | `TestPass123!` | 2       | private    | `tiny_tim`      | 8 visible → tier 2 (4–8 cols) |
| `test-small@example.com`    | `TestPass123!` | 6       | private    | `small_sam`     | 12 visible → tier 3 (9–20 cols) |
| `test-medium@example.com`   | `TestPass123!` | 14      | private    | `medium_mia`    | 20 visible → tier 3 (9–20 cols) |
| `test-large@example.com`    | `TestPass123!` | 28      | private    | `large_lou`     | 34 visible → tier 4 (21+ cols) |
| `test-public@example.com`   | `TestPass123!` | 6       | **public** | `public_paula`  | 6 visible (own + own, no other public) → tier 2 |

**Anonymous (not signed in):** sees only `test-public`'s 6 public recipes → tier 2 (4–8 cols).

All five accounts share the password `TestPass123!`. Accounts 1–4 are private (`is_public = false`) so each only sees its own recipes plus whatever is public. The 5th account's recipes are public, which means:
- Anonymous visitors see 6 recipes (test-public's set).
- Logged-in test accounts see `their own count + 6` because RLS returns `is_public OR auth.uid() = author_id`.

The density tier *shifts upward* for logged-in accounts vs the original "private-only" model: tier mappings are no longer 1:1 with the account name. The tier-2/3/4 differentiation still holds across accounts, but `test-tiny` no longer demos the ≤3-recipe hero tier when logged in (use the anonymous view for that — log out and refresh).

> ⚠️ **These credentials are documented because the test accounts only exist on the project owner's personal Supabase project.** The same password should never be reused for any project that touches real-user data. If this repo ever gains other contributors or a shared environment, rotate the password and move it out of source control.

---

## Seeding / re-seeding

```powershell
npm run seed:test
```

Runs [scripts/seed-test-accounts.js](../scripts/seed-test-accounts.js) against the Supabase project pointed at by `.env.local`. Re-running is safe — it wipes each test account's existing recipes (scoped by `author_id`) and reinserts a fresh set. Non-test accounts are never touched.

### Pre-flight requirement

The script uses the regular signup flow with the anon key (no `service_role` involvement). For signup to return a session immediately, **"Confirm email" must be disabled** in Supabase Auth:

> Supabase Dashboard → **Authentication** → **Sign In / Up** → **User Signups** → **Confirm email** → **OFF** → Save changes

Re-enable it after seeding if you want real signups to require email verification again. See [DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md) → *Test-account seeding* for the rationale behind this approach.

### When to re-seed

- After a schema change that adds new recipe columns — to populate them with sensible defaults
- After tweaking the image-URL strategy in the script (e.g. swapping picsum.photos for real food photos)
- If a test account's data gets corrupted by manual edits
- Whenever the density-tier thresholds in [src/App.jsx](../src/App.jsx) change — re-tune `recipeCount` in the script to land each account squarely in its tier

---

## Visual review checklist

Run through this after any change to the recipe grid, card layout, or hover behavior. Open browser tabs for each scenario:

- [ ] **Anonymous (logged out)** — verify the home grid shows test-public's 6 recipes; header shows "Sign In" button (not Profile/Logout); "+ New Recipe" button is hidden; clicking a card opens the detail view without Edit/Delete buttons
- [ ] **Anonymous → Sign In flow** — click "Sign In", click "← Back to recipes" to dismiss; click Sign In again, log in successfully, header switches to Bookmarks/Profile/Logout, "+ New Recipe" appears
- [ ] **test-tiny** — 8 visible recipes (own 2 + public 6), tier 2 (3 cols)
- [ ] **test-small** — 12 visible, tier 3 (4 cols)
- [ ] **test-medium** — 20 visible, tier 3 (still 4 cols, at the upper bound)
- [ ] **test-large** — 34 visible, tier 4 (5-col floor)
- [ ] **test-public** — 6 visible (own only — test-public's public recipes overlap with its own count)
- [ ] **Hover behavior** — image scales, description fades in *above* the title, tag chips animate between, card shadow deepens
- [ ] **Search stability** — filters the grid without changing card size
- [ ] **Mobile (≤ 640px viewport)** — every tier collapses to 1–2 columns; cards stay legible; titles don't overflow

## Bookmarks checklist

- [ ] **Bookmark icon visible on every card** (top-right corner of image, outline state initially)
- [ ] **Click bookmark, icon flips to filled (indigo) immediately** — no spinner, no delay (optimistic UI)
- [ ] **Bookmark click does NOT open the detail view** (e.stopPropagation working)
- [ ] **Reload page, bookmark state persists** (proves the Supabase write succeeded)
- [ ] **Click bookmark on RecipeDetail page** (larger variant top-right) — same behavior
- [ ] **"Bookmarks" header button → My Bookmarks view** lists saved recipes, sorted most-recent first
- [ ] **Unbookmark from My Bookmarks view → card disappears immediately** (filter against isFavorited)
- [ ] **Empty bookmarks state** — log in as a fresh account, navigate to Bookmarks → "No bookmarks yet" empty state
- [ ] **Anonymous bookmark click → Auth view opens** instead of toggling
- [ ] **Anonymous click "← Back to recipes" returns to grid** with anonymous header unchanged
- [ ] **Bookmark state syncs across views** — bookmark from home grid, navigate to Profile (My Recipes), the same recipe's icon there is filled too

## Likes checklist

- [ ] **Like pill visible top-left of every card** — heart icon, outline state initially (rose-filled if you've already liked it from a prior session)
- [ ] **Count rendered only when > 0** — a recipe with zero likes shows just the heart, no `0`
- [ ] **Click heart, fill flips to rose-500 immediately + count increments** — no spinner (optimistic UI)
- [ ] **Click again, fill reverts to outline + count decrements** — toggle off works the same way
- [ ] **Like click does NOT open the detail view** (e.stopPropagation working)
- [ ] **Reload page, like state persists** — proves the Supabase write succeeded
- [ ] **Like button on RecipeDetail page** (larger variant top-right, alongside bookmark) — same behavior, same persistence
- [ ] **Counts are public** — log in as account A, like a recipe; log out → the anonymous view of that recipe shows the incremented count
- [ ] **Anonymous like click → Auth view opens** (heart visible, but tap prompts sign-in)
- [ ] **Like state per-user** — A likes a recipe; B logs in, the heart shows outline for B (the count is shared but the fill state is per-user)
- [ ] **Counts and bookmarks are independent** — liking does NOT bookmark, and vice versa; both can be active simultaneously

## Comments checklist

> Requires migration 005 applied in the Supabase project (`supabase_migration_005_comments.sql` — tightens the INSERT policy and adds the covering index). Run it via the Supabase Dashboard SQL editor before testing.

- [ ] **Comments section visible at the bottom of every RecipeDetail page** — below the steps, heading "Comments" with `(N)` count when comments exist
- [ ] **Empty state shows on a fresh recipe** — `"Be the first to comment."` italic gray
- [ ] **Signed-in: Add-comment form is visible** — textarea + "Post Comment" button; button disabled when draft is empty or whitespace-only
- [ ] **Anonymous: form is replaced by Sign-in CTA** — `"Sign in to join the conversation."` panel with a Sign In button → opens the Auth overlay
- [ ] **Post a comment** — appears immediately at the top of the list (optimistic UI), draft clears, no page reload
- [ ] **Comment shows author username + relative timestamp** — `"tiny_tim · just now"`, then `"5s ago"`, `"2m ago"`, etc. as time passes
- [ ] **Avatar fallback to initials** — seeded accounts have no `avatar_url`; show colored chip with first two letters of username uppercased (e.g. `TI` for `tiny_tim`)
- [ ] **Reload page, comments persist + order is newest-first** — proves the insert succeeded and the order-by is correct
- [ ] **Delete-own comment** — own comments show a small red "Delete" link below the content; click → confirm → removed immediately (optimistic); reload confirms persistence
- [ ] **Delete control hidden on other users' comments** — log in as account A, view a recipe with comments from account B; B's comments have no Delete control
- [ ] **Comments visible to anonymous viewers** — log out, open a recipe with comments; the list renders (counts and content are public), only the form is replaced by the CTA
- [ ] **Optimistic-add survives network success** — the temp-id row is replaced by the real server row carrying the joined `profiles` data (username + avatar render without a second fetch)
- [ ] **Multi-line content preserves newlines** — paste a comment with embedded `\n`; rendered with `whitespace-pre-wrap` so line breaks survive
- [ ] **Long words / URLs don't overflow the column** — `break-words` keeps a 200-character no-spaces string from blowing out the layout

---

## Future testing notes

Areas to flesh out as the app matures:

- **E2E coverage** — Playwright/Vitest browser tests for the auth flow (login, signup, password reset), recipe CRUD, and social actions once those exist.
- **RLS verification** — a small script that hits the Supabase REST API as an anonymous client and confirms private recipes are not leaked.
- **Storage privacy** — once the `recipe-images` bucket privacy gap from [DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md) is addressed, add a check that confirms private recipes' covers aren't fetchable without auth.
- **Mobile snapshot tests** — once enough UI is settled, screenshot the grid at common breakpoints to catch unintended layout regressions.
