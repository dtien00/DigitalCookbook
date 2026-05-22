# Testing

Operational reference for testing the app — seeded test accounts, how to refresh them, and a visual review checklist for changes that touch the recipe grid. Companion to [ROADMAP.md](./ROADMAP.md) (scope), [COSMETICS.md](./COSMETICS.md) (visuals), and [DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md) (schema rationale).

---

## Environments

The project runs on a **single Supabase backend** shared by every deployment — there is no separate test database. The test/prod boundary is enforced by convention, not by infrastructure:

- **Production** is the `main` branch on Vercel — [digital-cookbook-ruddy.vercel.app](https://digital-cookbook-ruddy.vercel.app). Real users (if any) sign in here.
- **Preview** is every other branch / PR. Vercel auto-deploys these to `digital-cookbook-*-git-*.vercel.app` URLs. Treat these as the test environment.
- **Local dev** (`npm run dev`) hits the same Supabase project as both of the above.

### The convention

> Never sign in as a real user on a non-production URL. Use the seeded test accounts (below) instead.

A bad insert or a buggy migration *can* still touch real data on Preview / local — there is only one DB. The discipline above keeps the human-error surface small. When a change is risky enough to need a true firewall, the upgrade path is a second Supabase project scoped to Preview env vars; document the migration in [DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md) when that happens.

### The visual cue

[EnvBanner](../src/components/EnvBanner.jsx) renders a fixed top strip on any deployment where `VITE_ENV_LABEL` is set. It sits above the Auth overlay (z-index 60 vs 50) so the warning is visible at the moment a sign-in mistake would happen.

To wire it up in Vercel:

1. Project → **Settings** → **Environment Variables** → **Add New**
2. Name: `VITE_ENV_LABEL`, Value: `test`
3. **Environments**: check **Preview** only (leave **Production** and **Development** unchecked).
4. Save, then redeploy any open Preview to pick up the var.

Local dev is unaffected unless you add `VITE_ENV_LABEL=local` to `.env.local`.

---

## Test accounts

Four seeded accounts each exercise one of the four library-size density tiers documented in [COSMETICS.md](./COSMETICS.md) → *Browse / Recipe Grid*. Logging in as each account shows a different grid density without any code change — useful for visual regression checking when touching the grid.

| Email                       | Password       | Recipes | Visibility | Username        | Tier when logged in (incl. public set) |
|-----------------------------|----------------|---------|------------|-----------------|---|
| `test-tiny@example.com`     | see `.env.local` `TEST_PASSWORD` | 2       | private    | `tiny_tim`      | 8 visible → tier 2 (4–8 cols) |
| `test-small@example.com`    | see `.env.local` `TEST_PASSWORD` | 6       | private    | `small_sam`     | 12 visible → tier 3 (9–20 cols) |
| `test-medium@example.com`   | see `.env.local` `TEST_PASSWORD` | 14      | private    | `medium_mia`    | 20 visible → tier 3 (9–20 cols) |
| `test-large@example.com`    | see `.env.local` `TEST_PASSWORD` | 28      | private    | `large_lou`     | 34 visible → tier 4 (21+ cols) |
| `test-public@example.com`   | see `.env.local` `TEST_PASSWORD` | 6       | **public** | `public_paula`  | 6 visible (own + own, no other public) → tier 2 |
| see `.env.local` `ADMIN_EMAIL` | see `.env.local` `ADMIN_PASSWORD` | 0       | n/a        | `admin_aria`    | sees public set + admin moderation controls    |

**Anonymous (not signed in):** sees only `test-public`'s 6 public recipes → tier 2 (4–8 cols).

All seed-account credentials live in `.env.local` (gitignored). The five non-admin accounts share a single `TEST_PASSWORD`; the admin uses a separate `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The literal values were rotated in Supabase and removed from source after the admin branch's public push exposed them. Accounts 1–4 are private (`is_public = false`) so each only sees its own recipes plus whatever is public. The 5th account's recipes are public, which means:
- Anonymous visitors see 6 recipes (test-public's set).
- Logged-in test accounts see `their own count + 6` because RLS returns `is_public OR auth.uid() = author_id`.

The density tier *shifts upward* for logged-in accounts vs the original "private-only" model: tier mappings are no longer 1:1 with the account name. The tier-2/3/4 differentiation still holds across accounts, but `test-tiny` no longer demos the ≤3-recipe hero tier when logged in (use the anonymous view for that — log out and refresh).

> ⚠️ **Credentials live in `.env.local` rather than this doc.** The literals previously embedded here (`TestPass123!` / `AdminPass123!`) were leaked once the repo went public on GitHub and have since been rotated in Supabase. Never restore them to source. The same password should never be reused for any project that touches real-user data.

---

## Seeding / re-seeding

```powershell
npm run seed:test
```

Runs [scripts/seed-test-accounts.js](../scripts/seed-test-accounts.js) against the Supabase project pointed at by `.env.local`. Re-running is safe — it wipes each test account's existing recipes (scoped by `author_id`) and reinserts a fresh set. Non-test accounts are never touched.

### Pre-flight requirement

Apply migrations 008, 009, and 010 (`supabase_migration_008_admin.sql`, `supabase_migration_009_admin_visibility.sql`, `supabase_migration_010_admin_trigger_fix.sql`) before seeding.
- Without 008: the admin account is created but the `bootstrap_admin()` RPC doesn't exist yet, so the admin won't be promoted (the seed log will note this and the recovery is to apply the migration and re-run).
- Without 009: the admin can log in and moderate but won't see other users' private recipes in the grid — they have DELETE rights without SELECT visibility on private content.
- Without 010: `bootstrap_admin()` silently no-ops because the migration-008 trigger reverts its UPDATE. The seed log will say "Promoted to admin" but `SELECT is_admin FROM profiles WHERE ...` still returns false. If you applied 008 alone before 010 existed, run 010 then either re-run `npm run seed:test` or `UPDATE public.profiles SET is_admin = TRUE WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@example.com')` in the SQL editor.

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
- [ ] **Mobile swipe-back (Stage 9)** — on a real phone (touch events don't fire from desktop trackpads), thumb-swipe right from any recipe detail page returns to the home grid; vertical scroll within the recipe still works; pinch-zoom doesn't trigger a navigation

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

## Admin moderation checklist

> Requires migration 008 applied (`supabase_migration_008_admin.sql`) and the seed admin account promoted via `bootstrap_admin()` (handled by `npm run seed:test`).

**Setup:**
- [ ] **Log in as the admin account** (email + password from `.env.local`'s `ADMIN_EMAIL` / `ADMIN_PASSWORD`) — header shows the same Profile dropdown as any user (no admin badge in this iteration; the controls themselves are the signal)
- [ ] **Home grid shows every recipe across every account, including other users' private recipes** — proves migration 009 is applied. The private-recipe badge (lock icon) appears on each non-public card. If the grid only shows `test-public`'s 6 recipes, migration 009 hasn't been applied.
- [ ] **Open any other user's recipe (e.g. one of `test-medium`'s)** — RecipeDetail now shows a dashed-border "Admin moderation" panel below the (hidden, since you're not the author) Edit/Delete row

**Admin-only controls visible:**
- [ ] **Delete recipe** — moderation-orange button, only on recipes you don't own
- [ ] **Reset likes** — paper-shade button, always visible to admins (even on your own recipes — admins may want to reset their own counts)
- [ ] **Reset bookmarks** — same treatment, always visible
- [ ] **Delete author** — moderation-orange button, only on recipes you don't own

**Action: Delete any recipe**
- [ ] Confirm dialog quotes the recipe title; click OK → toast "Recipe deleted" + you're returned to the grid; the recipe is gone for everyone (verify by signing in as another account and confirming it no longer appears)
- [ ] Cancel the confirm → no change

**Action: Delete any comment**
- [ ] On a recipe with comments from other users, each non-own comment now shows a "Delete (admin)" link (own comments still say plain "Delete")
- [ ] Click an admin-delete link → confirm dialog → comment disappears immediately; reload to confirm persistence
- [ ] Log in as the original commenter → their comment is gone

**Action: Reset likes**
- [ ] Pick a recipe that has likes (give some via other test accounts first if needed)
- [ ] Click Reset likes → confirm → toast "Likes reset"; the heart pill on the detail page drops to 0 and goes outline
- [ ] Navigate back to the home grid → the same recipe's card pill also shows 0
- [ ] Log in as a previous liker → the heart is outline for them too (their like row was actually deleted)

**Action: Reset bookmarks**
- [ ] Pick a recipe that's bookmarked by other test accounts
- [ ] Click Reset bookmarks → confirm → toast "Bookmarks reset"
- [ ] Log in as a previous bookmarker → "My Bookmarks" no longer contains that recipe

**Action: Delete any user**
- [ ] On a non-admin author's recipe, click Delete author → confirm dialog
- [ ] Toast "User deleted"; you're returned to the grid; ALL of their recipes are gone (cascade) and any of their comments on other recipes are also gone
- [ ] Attempt to log in as the deleted user with their old password → "Invalid login credentials" (the `auth.users` row is gone)

**Self-protection guards:**
- [ ] **Admin cannot delete their own author row** via the Delete author button — the button is hidden on your own recipes, and the RPC raises an exception if called with `target_id = auth.uid()` anyway
- [ ] **Non-admin cannot self-promote** — log in as `test-tiny`, run `await supabase.from('profiles').update({ is_admin: true }).eq('id', userId)` in the devtools console → the UPDATE returns success but the value silently reverts (the BEFORE-UPDATE trigger). Reload and confirm `is_admin` is still false.
- [ ] **Non-admin cannot delete others' content** — log in as `test-tiny`, attempt `await supabase.from('recipes').delete().eq('id', '<other-author-recipe-id>')` → success-but-zero-rows-affected (RLS filters the WHERE clause; the row doesn't match for them).
- [ ] **Non-admin cannot call `admin_delete_user`** — `await supabase.rpc('admin_delete_user', { target_id: '...' })` → returns an error from the RAISE EXCEPTION

## Servings multiplier checklist

> Verifies the Stage 7 servings stepper on RecipeDetail. Local-state-only — no migration required.

- [ ] **Stepper visible** on every RecipeDetail page next to the "Servings:" label
- [ ] **Bounds: minimum** — click `−` until `targetServings = 1`; button becomes disabled (40% opacity, not-allowed cursor) and further clicks do nothing
- [ ] **Bounds: maximum** — click `+` until `targetServings = 99`; button disables the same way
- [ ] **Quantities scale live** — pick a recipe with `0.5 cup` or `0.25 tsp` ingredients and bump servings; quantities update on each click without page reload
- [ ] **Fractions render** — at multiplier values that produce `.25 / .5 / .75 / .33 / .67`, the ingredient line shows `¼ ½ ¾ ⅓ ⅔` (e.g. `0.5 cup` × 1.5 = `¾ cup`)
- [ ] **Whole + fraction** — `1 cup` × 1.5 renders as `1 ½ cup`, not `1.5 cup`
- [ ] **Reset link** — appears as soon as `targetServings ≠ baseServings`; disappears when you return to baseline; clicking it restores `baseServings`
- [ ] **No persistence** — navigate away and back; servings resets to the recipe's original value. Refresh the page; same result. (The author's recipe contract is preserved.)
- [ ] **Anonymous users** — stepper works for signed-out viewers too (no auth gate on a client-side cooking aid)

---

## Future testing notes

Areas to flesh out as the app matures:

- **E2E coverage** — Playwright/Vitest browser tests for the auth flow (login, signup, password reset), recipe CRUD, and social actions once those exist.
- **RLS verification** — a small script that hits the Supabase REST API as an anonymous client and confirms private recipes are not leaked.
- **Storage privacy** — once the `recipe-images` bucket privacy gap from [DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md) is addressed, add a check that confirms private recipes' covers aren't fetchable without auth.
- **Mobile snapshot tests** — once enough UI is settled, screenshot the grid at common breakpoints to catch unintended layout regressions.
