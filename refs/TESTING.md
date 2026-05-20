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

## Toasts checklist

> Verifies the Stage 6 toast migration. Each item exercises a path that used to fire a native `alert(...)` browser modal and should now surface as a top-center toast.

**Auth flow ([Auth.jsx](../src/components/Auth.jsx)):**
- [ ] **Signup success** — sign up with a fresh email → green-checkmark toast: "Check your email for the confirmation link!" (requires "Confirm email" ON in Supabase Auth, otherwise the session is created immediately and the toast is skipped — that's expected)
- [ ] **Forgot password** — click "Forgot Password", enter an email, Send → green toast: "Password reset link sent to your email!" + view switches back to Login
- [ ] **Auth error** — try logging in with a wrong password → red toast with the Supabase error message (e.g. "Invalid login credentials"), 5-second duration

**Recipe CRUD ([CreateRecipe.jsx](../src/components/CreateRecipe.jsx), [RecipeDetail.jsx](../src/components/RecipeDetail.jsx)):**
- [ ] **Create recipe** — fill the form, Save → green toast: "Recipe created successfully!" + redirect back to grid
- [ ] **Edit recipe** — open an existing recipe, Edit, change something, Save → green toast: "Recipe updated successfully!"
- [ ] **Save error** — Supabase write failure (rare; can simulate by temporarily killing network) → red toast with the error
- [ ] **Delete recipe failure** — author tries to delete and hits an RLS or network error → red toast: "Error deleting recipe: ..." (the native `window.confirm` dialog beforehand still fires — that's intentional, blocking destructive actions belongs to a future modal-confirm component)

**Profile ([Profile.jsx](../src/components/Profile.jsx)):**
- [ ] **Profile load error** — rare; if Supabase is down on first profile fetch → red toast
- [ ] **Profile update success** — change Bio, Save → green toast: "Profile updated!"
- [ ] **Profile update error** — RLS violation or network failure → red toast with error
- [ ] **Password update success** — change password → green toast: "Password updated successfully!" + password input clears
- [ ] **Password update error** — invalid password (too short) → red toast

**General toast behavior:**
- [ ] **Position** — toasts appear top-center, above all content (including the recipe-detail page, the Auth overlay slide-in, and modal-ish forms)
- [ ] **Stacking** — fire multiple actions in quick succession; toasts stack vertically and dismiss in order
- [ ] **Duration** — success toasts auto-dismiss after ~3.5s; error toasts stay ~5s
- [ ] **Dismissible** — clicking anywhere on a toast dismisses it immediately (enabled via a custom-render wrapper in [main.jsx](../src/main.jsx) — `react-hot-toast` does NOT ship click-to-dismiss by default; the wrapper around `<ToastBar>` adds the affordance)
- [ ] **Hover-pause** — hover over a toast mid-display; its auto-dismiss timer freezes until you mouse off. This is `react-hot-toast`'s default behavior and explains why an error toast you're inspecting may appear to outlast its 5s duration (the timer is paused while your cursor is over it).
- [ ] **No `alert()` regressions** — perform every action above with the browser devtools console open; expect zero `alert is not defined`-style errors and zero native modal dialogs (apart from `window.confirm("Are you sure you want to delete this recipe?")` which is intentionally kept)
- [ ] **Screen reader hookup** — success toasts get `role="status"`, error toasts get `role="alert"` (react-hot-toast does this automatically); verify with browser devtools accessibility tree if curious

---

## Future testing notes

Areas to flesh out as the app matures:

- **E2E coverage** — Playwright/Vitest browser tests for the auth flow (login, signup, password reset), recipe CRUD, and social actions once those exist.
- **RLS verification** — a small script that hits the Supabase REST API as an anonymous client and confirms private recipes are not leaked.
- **Storage privacy** — once the `recipe-images` bucket privacy gap from [DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md) is addressed, add a check that confirms private recipes' covers aren't fetchable without auth.
- **Mobile snapshot tests** — once enough UI is settled, screenshot the grid at common breakpoints to catch unintended layout regressions.
