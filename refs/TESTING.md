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

### What gets seeded

The script's 15 recipe templates each carry full **ingredients** (8–14 each, with `quantity`, `unit`, and optional `notes`) and full **steps** (5–7 each, with `instruction` text). Templates cycle for accounts with more than 15 recipes — repeats are suffixed with `(v2)`, `(v3)`, etc. so the title list stays unique. A full re-seed inserts ~570 ingredient rows and ~360 step rows across the 5 content accounts.

This enrichment was added so the Stage 10 fridge-basket filter is exercisable end-to-end against seeded data — without ingredients, the basket would match nothing regardless of what you typed. The earlier seed only populated titles + descriptions + tags.

### When to re-seed

- After a schema change that adds new recipe columns — to populate them with sensible defaults
- After tweaking the image-URL strategy in the script (e.g. swapping picsum.photos for real food photos)
- If a test account's data gets corrupted by manual edits
- Whenever the density-tier thresholds in [src/App.jsx](../src/App.jsx) change — re-tune `recipeCount` in the script to land each account squarely in its tier
- After editing `RECIPE_TEMPLATES` (adding/removing recipes, editing ingredient lists) — the script is the only path that gets the new shape into the DB

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
- [ ] **Mobile swipe-resume (Stage 9)** — after swiping back to the home grid, thumb-swipe left → re-opens the recipe you just left; in a fresh tab (no `lastViewedRecipeId`), the same left-swipe does nothing and the page doesn't visibly slide

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

## Sort metrics checklist

> Verifies the Stage 13 v2 custom sort picker. Requires migration 014 applied in Supabase (`supabase_migration_014_recipe_like_counts_view.sql` — run via Dashboard → SQL Editor). Use `test-large@example.com` (34 recipes, varied like counts) for the most meaningful ordering signal.

- [ ] **Sort trigger visible** in the action row between the search input and "+ New Recipe" button — pill labelled "Sort" at all times (label never changes to reflect active state)
- [ ] **Opens dropdown** on click — two rows: Date (clock icon) and Likes (heart icon); dropdown is 220px wide, rounded, paper background
- [ ] **Closes on outside click** — click anywhere outside the dropdown card → closes; trigger retains focus
- [ ] **Closes on Escape** — with dropdown open, press Escape → closes
- [ ] **Does NOT close on toggle click** — click the Date or Likes switch; dropdown stays open (this is intentional — user is expected to configure multiple metrics before dismissing)
- [ ] **Date toggle on/off** — switch flips to rust-filled on; grid re-fetches sorted by `created_at`; switch reverts to muted off; grid returns to default order
- [ ] **Likes toggle on/off** — switch on → grid re-fetches from `recipes_with_counts` ordered by `like_count DESC`; recipes with more likes appear first; switch off → returns to default
- [ ] **Direction chevron — Date** — click chevron next to Date row (while Date is on); chevron rotates 180°; grid re-fetches with `created_at ASC` (oldest first)
- [ ] **Direction chevron — Likes** — same: flips between most-liked and least-liked
- [ ] **Both on — compound sort** — enable both Date and Likes; grid sorts by `like_count` (primary) then `created_at` (tiebreaker); recipes with the same like count appear in date order within that group
- [ ] **Both off** — disable both switches; grid falls back to implicit `created_at DESC` (newest first) — grid is never nondeterministic
- [ ] **Pagination resets on sort change** — with infinity-scroll loaded to page 2, toggle a metric; page resets to 0 (no duplicate/missing cards from the mixed-sort window)
- [ ] **Anonymous sort** — log out; Sort trigger is visible and functional; grid re-fetches (only public recipes are returned — RLS still applies through the view)
- [ ] **`recipes_with_counts` — like counts accurate** — like a recipe as one account; sign out and back in as another; sort by Most liked; the liked recipe appears above recipes with 0 likes

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

## Comment likes checklist

> Verifies Stage 15 item 4 — small heart pill on each comment row. Requires migration 019 applied (`supabase_migration_019_comment_likes.sql` — creates the `comment_likes` join table + RLS). The seed script doesn't seed comments, so post a few from at least two test accounts before walking this checklist.

- [ ] **Heart pill renders on every comment row** — inline below the content next to Delete / Report; small outline heart, no count when 0 likes
- [ ] **Signed-in click toggles the heart filled rose + count appears** — first click goes to `1`; click again returns to outline with no count
- [ ] **Anonymous click opens the Auth overlay** — log out, click any heart; same `onRequireAuth` path the comment form uses, no row mutation
- [ ] **Optimistic-then-rollback on failure** — disable Wi-Fi briefly, click a heart; the fill + count flip immediately, then revert when the network insert errors out (check console for the logged error)
- [ ] **Sort floats liked comments to the top** — on a thread with mixed liked / unliked comments, all liked rows appear above all zero-tier rows; within each tier, newest-first holds
- [ ] **Ties break on `created_at DESC`** — two comments both at 1 like sort newest-first; flip the like on the older one to make it 2 and watch it move above
- [ ] **Counts persist across reload** — like a few comments, refresh the page; counts and filled state survive
- [ ] **Public counts visible to anonymous viewers** — log out, open the same recipe; counts and rose-filled hearts on others' likes remain visible (the rose fill is from `userLikedComment` which is false anonymously — so anon viewers see outline hearts with counts, not filled)
- [ ] **Admin-delete cascades** — admin deletes a comment that has likes; reload; the comment is gone and the FK cascade cleaned its `comment_likes` rows (verify by re-creating a comment and checking no stale rows pollute new counts)
- [ ] **Self-like rejected by RLS** — open browser devtools, attempt `supabase.from('comment_likes').insert({ comment_id: '<some-id>', user_id: '<other-user-uuid>' })`; insert returns 401/403 (the `WITH CHECK (auth.uid() = user_id)` policy denies)

## Comment result photos checklist

> Verifies Stage 15 item 3 — commenters can attach one "here's how mine turned out" photo to their comment. Requires migration 020 applied (`supabase_migration_020_comment_photos.sql` — adds nullable `photo_path TEXT` on `comments`) AND the `comment-photos` Storage bucket created in the dashboard (public, 5 MB cap, `image/jpeg|png|webp`, INSERT/UPDATE/DELETE gated on `bucket_id='comment-photos' AND auth.role()='authenticated'`).

**Compose:**
- [ ] **"Add photo" button visible** below the textarea, inline with "Post Comment"; clicking it opens the OS file picker (mobile sheet shows both Camera + Photo Library)
- [ ] **Pick a JPG/PNG/WebP** under 5 MB → preview thumb (w-32 h-32) appears below the textarea with an × remove button; button label flips from "Add photo" to "Replace photo"
- [ ] **× clears the preview** — back to "Add photo", thumbnail gone, blob URL revoked (check devtools Network → no leaked object URL)
- [ ] **Non-image rejection** — try to pick a `.pdf` via devtools (override `accept`); toast "Please pick an image file." appears, no preview
- [ ] **Over-5 MB rejection** — pick a large image; toast "Photo must be under 5 MB." appears, no preview
- [ ] **Submit with text + photo** — button label transitions `Post Comment → Uploading… → Posting…`; on success, textarea + photo state clear and the new comment appears at the top of the list with the photo

**Display:**
- [ ] **Thumbnail renders below the comment text** (w-40 h-40, rounded, paper-shade border) — above the Like / Delete / Report action row
- [ ] **Tap the thumbnail opens the lightbox** with `aria-label="Comment photo"`; ✕ button, backdrop click, and Escape all close
- [ ] **Reload page, photo persists** — proves the path is stored in `comments.photo_path` and the public URL is stable
- [ ] **Anonymous viewer sees the thumbnail + lightbox** — log out, open the recipe; the photo is visible (public-read bucket), tap-to-expand works, no Sign-in CTA on the thumbnail itself

**Cross-recipe + state:**
- [ ] **Two comments on the same recipe, one with photo one without** — text-only renders without the photo region (no empty box), photo comment renders with thumb; rhythm stays consistent
- [ ] **Delete own comment with photo** — comment vanishes immediately (optimistic), reload confirms the row is gone; the storage object is left behind (orphan-accepted posture per DATABASE_DECISIONS) — verify via Supabase Dashboard → Storage → comment-photos that the object still exists under `<recipe_id>/`
- [ ] **Admin delete-with-photo** — log in as admin, delete someone else's comment with a photo; row removed; storage object orphaned (same posture)

**Failure modes:**
- [ ] **Insert error after upload succeeds → storage cleanup** — open devtools, intercept the comment INSERT request and force a 500; the upload should have succeeded but the comment row should not exist on reload, AND the storage object should be auto-removed (`storage.remove([path])` ran). This proves the rollback path works.
- [ ] **Upload error → no row created** — break the bucket name temporarily (e.g. rename the bucket); submit a comment with photo; toast surfaces the error, no comment row appears, draft + photo preview preserved so the user can retry

**Mobile (phone width):**
- [ ] **Compose form fits at 375px** — "Add photo" and "Post Comment" wrap to a single row with comfortable spacing; tap targets ≥44px
- [ ] **Thumbnail renders below text without overflow** — w-40 h-40 fits within the comment's content column
- [ ] **Lightbox fills the viewport** with the photo `object-contain`'d, ✕ button stays reachable in the top-right

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

## Report handling checklist

> Verifies the Stage 16 item 1 reports surface. Requires migration 017 applied (`supabase_migration_017_reports.sql`) and the admin account already enrolled in MFA (from Stage 16 item 2). Seed script does not yet seed reports — exercise the flow live.

**Reporter side (any non-admin test account, e.g. `test-medium`):**
- [ ] **Recipe-level Report** — open any recipe the test user does NOT author; an icon-flag "Report" button appears in the action cluster alongside Share / Book / PDF. Hidden on your own recipes.
- [ ] **Comment-level Report** — on a recipe with at least one comment from another user, each non-own comment row shows a "Report" text link next to the username/timestamp area. Hidden on your own comments.
- [ ] **Author-level Report** — navigate to `/profile/<other-user-id>`; a paper-shade "Report" pill appears below the Follow / Unfollow / Notify cluster. Hidden when viewing your own profile (the route redirects to `/profile` first anyway).
- [ ] **Anonymous click → Auth overlay** — sign out, click any Report affordance; the Auth slide-in opens instead of the report dialog.
- [ ] **Dialog UX** — clicking Report opens a centred dialog with the reason textarea focused, a character counter (1000 ceiling), and a disabled Submit until non-whitespace text is entered. Escape, × close, backdrop click, and Cancel all dismiss without submitting and restore focus to the trigger.
- [ ] **Successful submission** — submit with a reason → toast "Reported — thanks for flagging this {comment/recipe/author}"; dialog closes.
- [ ] **Spam cap** — file 10 open reports back-to-back; the 11th attempt surfaces toast "You have 10 open reports. Wait for admin review before filing more." and the row is rejected by the BEFORE INSERT trigger. (Easier: have an admin Dismiss 5 of them first, then file 5 more — confirms the cap is on `status = 'open'` only, not lifetime.)
- [ ] **Reporter own-view** — `await supabase.from('reports').select('*')` in the devtools console returns only the rows the test user filed. Other users' reports are invisible.

**Admin side (`admin@example.com`):**
- [ ] **Profile dropdown** — header → Profile → dropdown now shows a rose-dark "Reports" entry between Bookmarks and Log out. Non-admin accounts do NOT see this entry.
- [ ] **Route access** — click "Reports" or visit `/admin/reports` directly. Anonymous → bounces to `/`. Non-admin signed-in → bounces to `/`. Admin without MFA enrolled → "Enable two-factor authentication…" message linking to Profile Security tab. Admin enrolled at AAL1 → inline MFA challenge form. Admin at AAL2 → full reports list.
- [ ] **Deep-link reload** — paste `/admin/reports` into a fresh tab, press Enter; "Checking access…" shows briefly while session + admin flag resolve, then the gate or the list renders. Does NOT bounce to `/` before the auth state restores.
- [ ] **Status filter chips** — Open / Reviewing / Resolved / Dismissed / All. Default is Open. Active chip is rust-filled.
- [ ] **Row content** — each report shows: target-type chip (Comment / Recipe / Author), status badge (color-coded), relative time, reason text, "Filed by {reporter}" with a profile link, and a target summary. Comment targets show a 240-char excerpt + link to the parent recipe. Recipe targets show title + "Private" badge if applicable. Author targets show display name + link.
- [ ] **Target-deleted state** — delete the target of an open report (e.g. as that recipe's author), reload `/admin/reports`; the row now reads "Target no longer exists (deleted)." in italic instead of a clickable link.
- [ ] **Optimistic status flip** — click Mark reviewing / Resolve / Dismiss; badge changes instantly + toast "Marked {status}". If the current filter no longer matches, the row drops out of the list. Switch filter chips to find it.
- [ ] **Reopen** — on a resolved or dismissed row, a "Reopen" button appears and flips status back to `open`. The auto-stamp trigger clears `resolved_at` / `resolved_by` in this transition.
- [ ] **Resolution audit trail** — after resolving a report, `await supabase.from('reports').select('id, status, resolved_at, resolved_by').eq('id', '<id>')` in the devtools console returns the admin's UUID in `resolved_by` and a non-null `resolved_at`. Without manual stamping; the BEFORE UPDATE trigger handled it.

**RLS axes (one-off SQL Editor checks if you want belt-and-suspenders):**
- [ ] **Anonymous SELECT** — sign out, `await supabase.from('reports').select('*')` returns `[]` (RLS denies, not an error).
- [ ] **Anonymous INSERT** — same session, `await supabase.from('reports').insert({...})` returns an RLS error.
- [ ] **Non-admin INSERT spoofing** — signed in as `test-tiny`, attempt `await supabase.from('reports').insert({ reporter_id: '<other-uuid>', ... })` → RLS error (the INSERT policy requires `auth.uid() = reporter_id`).
- [ ] **Non-admin UPDATE attempt** — `await supabase.from('reports').update({ status: 'resolved' }).eq('id', '<your-own-report-id>')` → zero rows affected (no UPDATE policy for reporters).

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

## Fridge basket checklist

> Verifies the Stage 10 fridge basket — modal shell, cumulative ingredient list, and the token-match filter against recipe ingredients. localStorage-backed (no schema needed; migration 011 is a forward-compat hook only).

- [ ] **Trigger button visible** at the right of the tag chip row on the home view (paper-shade pill with fridge icon + "Fridge" label); count badge appears in the top-right corner once the basket has items
- [ ] **Trigger button always present** even when no tag chips exist (e.g. fresh anonymous view of a tagless library)
- [ ] **Open modal** — click trigger → modal opens, focus lands in the ingredient input, body scroll locks
- [ ] **Add ingredient** — type `garlic` + Enter (or Add button) → chip appears, preview line updates to `N of M loaded recipes match.`, badge on the trigger increments
- [ ] **Normalize on add** — type `  TOMATO  ` → chip stored as `tomato`; verify via the chip text or `localStorage.getItem('cookbook.fridgeBasket')`
- [ ] **Dedupe** — add `eggs` twice → only one chip; basket size stays the same
- [ ] **Empty-after-trim rejected** — submit `   ` (whitespace only) → no chip added, input retains its value
- [ ] **Remove via ×** — click the × on a chip → chip disappears, preview + badge update
- [ ] **Clear all** — adds wipe all chips; button disabled when basket is empty
- [ ] **Egg ≠ eggplant** — add `egg` (singular) → does NOT match a recipe that only has `eggplant` (word-boundary tokenization, not substring). Easiest way to verify: edit a test recipe to have only "1 eggplant" as an ingredient, basket `egg` excludes it.
- [ ] **Multi-word ingredient** — `olive oil` matches `extra-virgin olive oil`; does NOT match a recipe with only `kalamata olives` (the token `oil` is missing)
- [ ] **AND with tag filter** — add a basket ingredient + click a tag chip → grid shows recipes that pass BOTH filters; empty state copy mentions the fridge
- [ ] **Empty-state copy** — non-matching basket on a non-empty library → "Nothing in your fridge matches." with an "Open fridge" button
- [ ] **CTA label** — empty basket: `Done`; basket with N matches: `Show N recipe(s)` (singular/plural); basket with zero matches: `Back to recipes`
- [ ] **CTA closes modal, no filter mutation** — pressing the CTA just closes; the filter applies regardless of how the modal exits (CTA, ×, Escape, backdrop click)
- [ ] **Escape closes** — pressing Escape closes the modal and restores focus to the trigger button
- [ ] **Backdrop closes** — clicking outside the dialog card closes the modal
- [ ] **Persistence across reload** — add ingredients, refresh the page → basket survives (localStorage)
- [ ] **Persistence across routes** — add ingredients, navigate into a recipe detail and back → basket still present, badge still showing
- [ ] **Anonymous works** — log out, basket interactions still function (no auth gate; client-side only)
- [ ] **Loading-more sentinel hidden when basket active** — with basket items, scroll to bottom → no "Loading more recipes…" appears even if `hasMore` is true (matches the search-filter behavior)
- [ ] **Mobile (≤ 640px)** — modal is full-screen height; tap targets ≥ 44px; chip removers are reachable with a thumb

---

## Shopping list checklist

> Verifies Stage N+2a — the cumulative `/shopping-list` page, the "Add to shopping list" button on RecipeDetail, and the localStorage store (`cookbook.shoppingList`). Client-only, no schema, no auth. Sits next to Stage 18's clipboard "Copy shopping list" button (different destination, same unchecked source).

- [ ] **"List" trigger visible** — home action row, right of the tag chips, next to "Fridge" (cart icon + "List"); rust count badge appears once the list has items, updates live as recipes are added
- [ ] **"Add to shopping list" present** — open any recipe with ingredients → button sits next to "Copy shopping list" in the Ingredients footer; both hidden while ingredients load and on a zero-ingredient recipe
- [ ] **Add all (fresh session)** — nothing checked → click Add → toast "Added N ingredients to your shopping list"; badge shows N
- [ ] **Unchecked filter** — tick an ingredient (e.g. "I already have salt") → Add → that item is excluded; toast count drops by one
- [ ] **Servings scaling carries** — bump servings (e.g. ×2) before Add → stored quantities are the scaled values (verify on the page or `localStorage.getItem('cookbook.shoppingList')`)
- [ ] **Notes carry** — an ingredient with a Stage 7 note shows the note as an italic sub-line on the list page and in parentheses in the clipboard copy
- [ ] **Dedupe by name + unit** — send a second recipe sharing an ingredient (same unit) → quantities sum (e.g. ¼ cup + ¼ cup → ½ cup), one row; different units stay as separate rows
- [ ] **Fraction display** — summed/scaled decimals render as ½ ¼ ¾ ⅓ ⅔ where applicable
- [ ] **Check off on the page** — tick a row → `line-through`, muted; session-scoped (not persisted — refresh clears the ticks but keeps the items)
- [ ] **Copy to clipboard** — produces a header line + `- qty unit name (notes)` rows; success toast with item count
- [ ] **Print** — Ctrl+P / Print button → chrome hidden, item checkboxes DO print as empty boxes (intentional, unlike the recipe kitchen-card)
- [ ] **Remove via ✕** — removes a single row; badge updates
- [ ] **Clear all** — confirm dialog → empties the list, shows the ✦ empty state, "Shopping list cleared" toast
- [ ] **Empty state** — no items → ✦ + "Your shopping list is empty." + italic-rose prompt to add from a recipe
- [ ] **Persistence across reload + routes** — add items, refresh / navigate away and back → list survives (localStorage)
- [ ] **Anonymous works** — logged out, the whole flow functions (no auth gate)
- [ ] **Deep link** — paste `/shopping-list` into a fresh tab → page resolves (SPA rewrite), shows persisted items
- [ ] **Mobile (≤ 640px)** — header + Copy/Print/Clear row fit; long item names wrap; full-row tap targets

**N+2c provenance — data model (PR #63) behaviors testable now (no new UI yet):**
- [ ] **Re-send replaces, not stacks** — send a recipe to the list, reopen the same recipe, send again → the shared quantities stay the same (no doubling). *(N+2a summed re-sends; N+2c replaces a recipe's prior contribution.)*
- [ ] **Provenance recorded** — after adding, `localStorage.getItem('cookbook.shoppingList')` shows each item carrying a `sources` array with the contributing `recipeId` / `recipeTitle`
- [ ] **Legacy list migrates** — put an old-shape value (item objects with no `sources`) into `cookbook.shoppingList`, reload → list still renders with quantities preserved, each row gains one synthesised source (`recipeId: null`), no console error

**N+2c provenance — chip bar (PR #64):**
- [ ] **Chip per recipe** — /shopping-list shows a "Recipes in this list" row with one chip per contributing recipe: title + a count badge of how many rows it feeds; chips ordered by when the recipe was first added
- [ ] **Hover / focus preview** — hovering (or keyboard-focusing) a chip tints its rows with a rust left-stripe + tan band; moving away clears it
- [ ] **Tap-to-pin** — clicking/tapping a chip pins the highlight (persists after the pointer leaves); clicking it again unpins; clicking a different chip switches the pin
- [ ] **Overlap** — an ingredient shared by two recipes (e.g. coconut milk) highlights under *either* recipe's chip; non-contributing rows stay plain
- [ ] **Mobile (≤ 640px)** — chips wrap to fit, highlight bands fit, tap pins (no hover needed)

**N+2c provenance — delete + undo (PR #66):**
- [ ] **Per-recipe delete** — a chip's `✕` removes that recipe optimistically (no dialog): rows it solely owns disappear, shared rows stay and drop by its share (e.g. coconut milk 3→2 cups), its chip vanishes
- [ ] **Overlap-aware undo toast** — the toast names the split, e.g. "Removed Coconut Rice — 1 item removed, 1 shared item reduced", with an **Undo** that fully restores (shared quantity back up, chip back)
- [ ] **Per-item delete toast** — a row's `✕` shows "Removed {item}" with an Undo action
- [ ] **Recently removed tray** — a collapsed "Recently removed (N)" appears; expanding shows each removal (item line, or "Recipe · N items") with a timestamp, a `↩` restore, and a `✕` dismiss
- [ ] **Restore is lossless** — `↩` on a recipe entry re-raises shared quantities and re-creates sole rows; on an item entry re-folds it source-aware
- [ ] **Persistence + cap** — the tray survives reload (`localStorage` key `cookbook.shoppingList.removed`), is capped at the last 10, and **Clear all** empties it
- [ ] **Re-send prunes** — delete a recipe, then re-send it from its page → the stale tray entry auto-drops (no double-restore)
- [ ] **Mobile (≤ 640px)** — chip `✕`, toast Undo, and tray restore/dismiss are all tappable

---

## Meal plan checklist

> Verifies Stage M+1 item 1 — the `/plan` week grid. **Requires migration 021 applied** (`supabase_migration_021_meal_plans.sql` — run via Dashboard → SQL Editor); until then the grid renders but adds fail with an error toast. Signed-in only. Use any private account (e.g. `test-medium`) and **bookmark a couple of recipes first** — the cell picker reads from your bookmarks, and the seed script doesn't seed favorites.

- [ ] **Route gate** — signed out, visit `/plan` → bounces to `/`. Signed in → grid renders.
- [ ] **Discovery** — header → Profile dropdown → "Meal Plan" (between Bookmarks and Log out) navigates to `/plan`.
- [ ] **Grid shape** — seven day columns Mon–Sun with dates, three rows Breakfast / Lunch / Dinner; today's column header is highlighted.
- [ ] **Week nav** — ‹ / › walk ±7 days and the label updates (e.g. "Jun 22 – 28", cross-month "Jun 29 – Jul 5"); "This week" returns to the current week.
- [ ] **Add from picker** — tap an empty cell's `+` → modal lists your bookmarks → pick one → the cell fills instantly (optimistic) with the recipe title.
- [ ] **Add from a recipe card (signed in)** — on the home grid, each card's top-right cluster shows a calendar "+ Add to plan" button left of the bookmark. Sign out → the button is gone (anonymous cards unchanged).
- [ ] **Add-to-plan modal** — click that button → modal opens titled with the recipe; pick a day (navigable week, today highlighted) + a meal (defaults to Dinner) → "Add to plan" → success toast; open `/plan` and confirm the recipe landed in that cell.
- [ ] **Modal dismiss** — Escape, ×, backdrop click, and Cancel all close it without adding.
- [ ] **One per cell** — a filled cell shows the recipe chip (title + `✕`), not a `+`; the DB enforces one row per `(date, slot)` via the unique constraint, so there's never a duplicate.
- [ ] **Remove** — click a filled cell's `✕` → cell empties immediately; reload → stays empty (persisted server-side).
- [ ] **Open recipe** — click a filled cell's title → navigates to that recipe's detail page.
- [ ] **Persistence** — add a few cells, reload → they survive (DB-backed, not localStorage). Sign in in another browser → the same plan appears (own-only RLS, server-side).
- [ ] **Empty picker** — on an account with zero bookmarks, the picker shows the ✦ "No bookmarks yet" nudge.
- [ ] **No leakage** — `await supabase.from('meal_plans').select('*')` in devtools returns only your own rows; signed out returns `[]`.
- [ ] **Desktop drag — tray → cell (≥ 768px)** — a "Drag a bookmark into the week" tray of chips appears above the grid; drag a chip onto a cell → it fills (same result as the picker). The hovered cell shows a rust ring while dragging.
- [ ] **Desktop drag — move a planned recipe** — drag a filled cell onto another cell → the recipe moves (source clears, destination fills/replaces); dropping a cell back on itself is a no-op.
- [ ] **Tray hidden on mobile** — at ≤ 640px the tray is not rendered (HTML5 drag doesn't work on touch); the tap-+ picker is the only add path there.
- [ ] **Mobile (≤ 640px)** — the grid scrolls horizontally (640px inner track); `+`, chip remove `✕`, and picker rows are all tappable.

**Build shopping list from plan (item 2):**
- [ ] **Button state** — the rust "Build shopping list" button (top-right of the `/plan` header) is disabled on an empty week; plan at least one recipe → it enables.
- [ ] **Build** — with recipes planned, click it → toast "Added N items from M recipes…" and you land on `/shopping-list` with those ingredients, each attributed to its recipe (provenance chip).
- [ ] **Repeated planning sums** — plan the same recipe in two cells → Build → its quantities are doubled, under one provenance source (not two).
- [ ] **Idempotent rebuild** — click Build again → quantities don't double again (re-send replaces that recipe's contribution).
- [ ] **Fridge subtraction** — add an ingredient a planned recipe uses to the Fridge Basket, then Build → that ingredient is skipped; the toast notes "N skipped (in your fridge)".
- [ ] **All-in-fridge** — if every ingredient of the planned recipes is in the basket → toast "Everything those recipes need is already in your fridge"; nothing added.

---

## Per-step photos checklist

> Verifies Stage 15 item 1 — author can attach one photo per step in CreateRecipe; reader sees a thumbnail + lightbox on RecipeDetail; CookingMode shows the photo in the step canvas. Requires migration 018 applied and the `recipe-steps` Storage bucket created per DATABASE_DECISIONS.md → *Storage: `recipe-steps` bucket*.

**Author flow (CreateRecipe):**
- [ ] **Slot visible on every step row** — adding a step shows the dashed "Add photo" tile below its instruction textarea
- [ ] **File picker accepts JPG/PNG/WebP** — system picker shows images filtered to those types
- [ ] **Reject of disallowed MIME** — try to attach a HEIC or SVG (rename a file's extension if needed); Supabase rejects on upload, toast surfaces the error, recipe stays saved minus that step's photo
- [ ] **File > 5 MB rejected** — try uploading a >5 MB image; Supabase rejects on upload, surfaces toast, recipe still saves
- [ ] **Preview shows immediately** — picking a file replaces the dashed tile with the chosen image (blob URL, no upload yet)
- [ ] **Remove (✕) clears the slot** — click ✕ on a previewed photo; slot returns to the dashed "Add photo" state
- [ ] **Save uploads pending files** — Save Recipe with N pending step photos; Supabase Storage dashboard shows N new objects under `recipe-steps/<recipe_id>/`
- [ ] **photo_path patched per row** — after save, `SELECT id, step_number, photo_path FROM steps WHERE recipe_id = '<new-id>'` shows the path on each row that uploaded a photo, NULL on the rest
- [ ] **Partial failure tolerated** — temporarily revoke Storage write permission (or unplug network mid-upload) on one of multiple pending uploads; recipe saves successfully, toast surfaces "N photos failed to upload", DB has the rest patched correctly

**Step keyboard entry:**
- [ ] **Ctrl/Cmd+Enter adds a step** — in the last step's textarea press `Ctrl`+`Enter` (`⌘`+`Enter` on Mac) → a new empty step appears and focus lands in its textarea
- [ ] **Plain Enter still inserts a newline** — `Enter` alone in a step textarea adds a line break inside the instruction; it does NOT add a step or submit the form
- [ ] **Ctrl/Cmd+Enter on a middle step advances** — with 3 steps, `Ctrl`+`Enter` in step 1's textarea moves focus to step 2 without adding a new step

**Step row removal:**
- [ ] **Remove button hidden at one step** — a fresh recipe with a single Step row shows no `×` in the "Step N" header
- [ ] **Remove appears with ≥2 steps** — add a second step; each step header now shows a trailing `×` matching the ingredient-row delete
- [ ] **Remove middle step** — with 3 steps (instructions A/B/C), `×` on step 2 → A and C remain, their text intact, and the labels renumber to "Step 1"/"Step 2"
- [ ] **Can't remove the last step** — delete down to one step → the `×` disappears (always ≥1 step)
- [ ] **Removing a step frees its pending photo** — attach a photo to a step (blob preview shows), then remove that step; no console error and the object URL is revoked (no leak). Save still uploads only the surviving steps' photos
- [ ] **step_number stays gapless after removal** — remove a middle step, Save; `SELECT step_number FROM steps WHERE recipe_id='<new-id>' ORDER BY step_number` is a contiguous 1..N with no gap

**Edit-mode carry-forward:**
- [ ] **Existing photo renders in the slot** — edit a recipe with a step photo; the slot shows the existing image (not the dashed tile)
- [ ] **No changes → no re-upload** — Save without touching photos; Storage object count is unchanged; `photo_path` values match pre-edit
- [ ] **Replace photo on an existing step** — pick a new file on a slot with an existing photo; Save; the storage object at the old path remains (orphan) but `photo_path` now points at the new upload
- [ ] **Remove photo via ✕ on edit** — clear an existing photo's slot, Save; the row's `photo_path` is now NULL; old storage object still exists (orphan, same as the recipe-images precedent)

**Reader flow (RecipeDetail):**
- [ ] **Sheet layout shows thumbnail** — in default `sheet` layout, a step with `photo_path` shows a 128×128 thumbnail indented under the instruction
- [ ] **Spread layout shows thumbnail** — toggle to `spread`; same thumbnail renders inside the right page's step list
- [ ] **Steps without photos render unchanged** — mixed recipe (some steps with photos, some without) shows thumbnails only where data exists
- [ ] **Anonymous viewers see thumbnails on public recipes** — sign out; open a public recipe with step photos; thumbnails render (public-read bucket)
- [ ] **Lightbox opens on click** — tap a thumbnail; full-screen dark overlay appears with the image centered, ✕ at top-right
- [ ] **Lightbox closes via ✕** — click the ✕ button; lightbox closes, focus returns to the thumbnail button
- [ ] **Lightbox closes via backdrop** — click outside the image; lightbox closes
- [ ] **Lightbox closes via Escape** — keyboard Escape closes the lightbox; pressing Escape with no lightbox open does nothing harmful
- [ ] **Tap on the image doesn't close** — clicking directly on the photo (not the backdrop) keeps the lightbox open
- [ ] **Thumbnail keyboard-accessible** — Tab to a step thumbnail; focus ring renders; Enter / Space opens the lightbox
- [ ] **Print / PDF excludes the thumbnail** — Ctrl+P preview hides thumbnails; "Download PDF" output is text-only steps (`.no-print` filter)

**CookingMode placement:**
- [ ] **No photo → unchanged layout** — Start cooking on a step with no photo; instruction text + Mark step done pill remain centered as before
- [ ] **Photo → bottom-left quadrant** — Start cooking on a step with a photo; the photo renders in the bottom-left half of the canvas, contained (not cropped)
- [ ] **Mark step done → bottom-right, vertically centered** — pill sits in the right half, vertically centered relative to the photo
- [ ] **Photo NOT tappable** — clicking the photo inside cooking mode does NOT open a lightbox (different from RecipeDetail)
- [ ] **Photo doesn't break swipe** — swiping left/right starting inside the photo region still advances/retreats the step
- [ ] **Mixed steps reflow correctly** — a recipe with some photo'd and some text-only steps; advancing through them reflows each step's layout independently
- [ ] **Photo scales for landscape** — same recipe on a phone in landscape (or devtools landscape emulation); photo caps shorter (`max-h-48`) so the pill stays above the fold

**Storage privacy gap (documented, not blocked):**
- [ ] **Private-recipe URL still public-fetchable** — get the `photo_path` for a step on a private recipe (signed-in author); construct the public URL; fetch it while signed out — image returns 200. Same gap as `recipe-images`; accepted per DATABASE_DECISIONS.md.

---

## Cooking mode checklist

> Verifies Stage 15 item 5 — the full-screen step-focus view launched from "Start cooking" on RecipeDetail. Client-only; no migration. Wake Lock + Fullscreen behaviors are browser-dependent, so the checklist calls out where graceful fallback is expected.

- [ ] **CTA visible** — every RecipeDetail with at least one step shows a full-width rust "Start cooking" button above the recipe content; recipes with zero steps hide it
- [ ] **CTA hidden during initial fetch** — the button does not render until `loading === false` (so it can't be tapped before steps exist)
- [ ] **Enter cooking mode** — tap "Start cooking" → full-screen overlay appears, header shows recipe title + Cooking kicker, progress strip shows "Step 1 of N" / `1/N%`, first step text rendered in the canvas
- [ ] **Body scroll locked** — RecipeDetail behind the overlay does not scroll while cooking mode is open; restored on exit
- [ ] **Exit returns to RecipeDetail** — tap `×` in the header → cooking mode closes, scroll position on RecipeDetail is preserved
- [ ] **Wake Lock acquires** — devtools → Application → … → Sensors / `navigator.wakeLock` (Chromium): on entry, screen-lock should be active; release on exit
- [ ] **Wake Lock re-acquires on tab return** — switch tabs and back; lock should still report active after returning (re-acquired by the `visibilitychange` listener)
- [ ] **Wake Lock graceful fallback** — Safari < 16.4 / unsupported browsers should still open the view; the screen may dim, but nothing else regresses
- [ ] **Landscape fullscreen on entry** — on a phone (or devtools mobile emulator) in landscape, tapping Start cooking should also enter browser fullscreen; portrait entry should NOT request fullscreen
- [ ] **Fullscreen restored on exit** — exiting cooking mode releases the fullscreen the entry acquired; if you were already in fullscreen for some other reason, exit does NOT yank you out
- [ ] **Swipe-left advances** — on a touch device (or devtools touch emulation), thumb-swipe right-to-left ≥ 80px → next step
- [ ] **Swipe-right retreats** — thumb-swipe left-to-right ≥ 80px → previous step
- [ ] **Sub-threshold spring-back** — swipe < 80px → row springs back to the current step on release
- [ ] **Vertical scroll preserved** — long step text scrolls vertically inside its panel without triggering a horizontal step change (`touchAction: pan-y` + the dy > 40 abandon check)
- [ ] **Arrow keys** — `→` advances, `←` retreats, both clamped at the ends
- [ ] **Escape behavior** — Escape closes the ingredients sheet if open; otherwise exits cooking mode
- [ ] **Step dots** — bottom row shows up to 12 step dots; the current one is rust at 1.25× scale; completed ones are rust at 40% opacity. Recipes with > 12 steps show `+N` after the dots
- [ ] **Dot jump** — tapping any dot jumps to that step
- [ ] **Mark step done** — the "Mark step done" pill on the current step toggles its checked state AND advances to the next step (or exits cooking mode on the last step)
- [ ] **Finish on last step** — on the last step, the Next button is replaced by a rust Finish button that closes cooking mode
- [ ] **Checkbox state persists back to RecipeDetail** — mark ingredients and steps inside cooking mode, exit; the ingredient + step checkboxes on RecipeDetail reflect the same state
- [ ] **Checkbox state persists across re-entry** — exit and re-tap Start cooking; previously checked items are still checked
- [ ] **Checkbox state resets across recipes** — navigate to a different recipe and into its cooking mode; checkboxes start empty (kitchen-session scope, matches Stage 7)
- [ ] **Ingredients sheet** — tap the right-side header button → bottom sheet slides up showing ingredients; backdrop dims the cooking page; tap outside or the header `×` closes it
- [ ] **Ingredients scale with servings multiplier** — set servings to a non-default value on RecipeDetail, enter cooking mode, open the ingredients sheet; quantities should reflect the multiplier (fractions render as ½ ¼ ¾ ⅓ ⅔)
- [ ] **Toggling ingredients in the sheet updates RecipeDetail** — check off an ingredient in the sheet, exit cooking mode; the same ingredient is checked on RecipeDetail
- [ ] **Swipes don't bubble to RecipeDetail** — a thumb-swipe right inside cooking mode should advance/retreat steps, NOT trigger Stage 9's swipe-back-to-home. Exiting and then swiping right on RecipeDetail should still navigate home as usual
- [ ] **Anonymous works** — log out, open a public recipe, Start cooking; all of the above behaviors still work (no auth gate on a client-side cooking aid)
- [ ] **Empty steps fallback** — if a recipe has zero steps the CTA is hidden (already covered above); if somehow opened (manual state change), the canvas shows "No steps to cook through." rather than crashing

---

## CreateRecipe ingredient entry checklist

> Verifies the ingredient-editor ergonomics pass on [CreateRecipe.jsx](../src/components/CreateRecipe.jsx) — fractions, the unit autocomplete, keyboard row creation/removal/navigation, and the column-order toggle. Client-only; no migration. Reach it via "Create Recipe" (signed-in) and, for the edit-mode row, the "Edit" affordance on a recipe you authored.

- [ ] **Fraction accepted** — in Qty type `1 1/2`; Save; on RecipeDetail the line reads `1 ½ <unit> <name>` (not `1.5`)
- [ ] **Simple fraction** — `1/2` saves and renders as `½`; `3/4` → `¾`
- [ ] **Unicode glyph** — pasting `½` into Qty saves to `0.5`
- [ ] **Empty Qty** — leaving Qty blank still saves (stores `0`, same as before)
- [ ] **Unit autocomplete opens** — focus a Unit field → dropdown shows the unit list on the paper-shade surface
- [ ] **Substring match** — type `spo` → `teaspoon` and `tablespoon` appear; type `tbsp` → `tablespoon` appears (alias match)
- [ ] **Select by mouse** — click a suggestion → it fills the Unit field and the list closes
- [ ] **Select by keyboard** — `↓` to highlight (rust background), `Enter` selects it and stops (does NOT add a row); a second `Enter` then commits the row
- [ ] **Free text allowed** — type a unit not in the list (e.g. `knob`) → it saves as typed
- [ ] **Enter on last column adds a row** — with the default Name · Qty · Unit order, `Enter` in the Unit field of the last row creates a new empty row and focus lands in its first field
- [ ] **Enter advances within a row** — `Enter` in Name focuses Qty; `Enter` in Qty focuses Unit; no accidental form submit at any point
- [ ] **Remove a row** — add 3 rows; click the trailing `×` on the middle one → it disappears, the other two remain, and focus moves to the row that took its slot
- [ ] **Last row can't be emptied away** — delete down to one row → the `×` button disappears (you can't remove the final row)
- [ ] **Remove preserves data** — fill rows A/B/C, delete B → A and C keep their Name/Qty/Unit/Notes intact (no shift corruption)
- [ ] **Tab order** — `Tab` walks Name → Qty → Unit → (× remove, when >1 row) → Notes → next row's first field in the visible order
- [ ] **Column toggle cycles** — the pill by the "Ingredients" heading cycles Name · Qty · Unit → Qty · Unit · Name → Unit · Qty · Name; the inputs reorder and the label tracks the order
- [ ] **Last-column target follows layout** — switch to Qty · Unit · Name; now `Enter` in the Name field (last) adds the new row
- [ ] **Edit-mode prefill** — edit a recipe with a `0.5`-quantity ingredient; the Qty field shows `½`, and `1.5` shows `1 ½`

---

## Open Graph unfurl checklist

> Verifies the Stage M item-1 Vercel Edge Middleware ([`middleware.js`](../middleware.js)) that injects per-recipe Open Graph / Twitter-card meta tags for link unfurls. **Cannot be tested under `vite dev`** — the Edge runtime only runs on Vercel, so verify against a deployed **Preview** URL (push the branch; Vercel auto-builds a Preview). Use `curl -A <crawler-ua>` to impersonate a scraper without a real social client. Needs a **public** recipe id (any `test-public@example.com` recipe) and a **private** id (any private recipe from accounts 1–4) to exercise the RLS-safe fallback.

- [ ] **Crawler gets a recipe card** — `curl -A facebookexternalhit '<preview>/recipe/<public-id>'` returns HTML whose `<title>` and `og:title` are the recipe title, `og:description` the (truncated) description, `og:image` the cover URL, and `twitter:card` is `summary_large_image`
- [ ] **Image-less recipe → summary card** — a public recipe with no `image_url` omits `og:image` and sets `twitter:card` to `summary`
- [ ] **Private recipe → generic card (RLS-safe)** — `curl -A facebookexternalhit '<preview>/recipe/<private-id>'` returns the generic "Digital Cookbook" card with NO recipe title/description/image leaked, `og:url` pointing at `/`
- [ ] **Non-existent id → generic card** — a random UUID that isn't a recipe returns the same generic card
- [ ] **Malformed id → generic, no crash** — `/recipe/not-a-uuid` returns the generic card
- [ ] **Edit sub-route → generic** — `curl -A facebookexternalhit '<preview>/recipe/<public-id>/edit'` returns the generic card (edit pages aren't shareable)
- [ ] **Human gets the SPA** — `curl '<preview>/recipe/<public-id>'` with a normal browser UA (or no `-A`) returns the SPA `index.html` (has `<div id="root">`), NOT the crawler card
- [ ] **Search engines get the SPA** — `curl -A Googlebot '<preview>/recipe/<public-id>'` returns the SPA, not a stub (Googlebot is intentionally excluded from crawler detection)
- [ ] **XSS-safe** — a recipe whose title contains `<`, `>`, `"`, `&` renders them escaped in the meta tags (no raw markup injected)
- [ ] **Real unfurl sanity** — paste a public `/recipe/:id` Preview URL into Slack/Discord (or the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) / [Twitter Card Validator]) and confirm the card shows title + image

---

## Future testing notes

Areas to flesh out as the app matures:

- **E2E coverage** — Playwright/Vitest browser tests for the auth flow (login, signup, password reset), recipe CRUD, and social actions once those exist.
- **RLS verification** — a small script that hits the Supabase REST API as an anonymous client and confirms private recipes are not leaked.
- **Storage privacy** — once the `recipe-images` bucket privacy gap from [DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md) is addressed, add a check that confirms private recipes' covers aren't fetchable without auth.
- **Mobile snapshot tests** — once enough UI is settled, screenshot the grid at common breakpoints to catch unintended layout regressions.
