# Database Decisions

Running log of **why** the database is shaped the way it is. The companion to [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) (which describes *what* the schema is) and [supabase_migration.sql](../supabase_migration.sql) (which is the executable source of truth).

Each entry captures a decision, the reason behind it, and the tradeoff accepted. New decisions append to the relevant section as the project evolves — don't rewrite history, add to it.

---

## Platform: Supabase

**Decision:** Use Supabase (managed Postgres + Auth + Storage + RLS) instead of self-hosting Postgres, using Firebase, or rolling auth ourselves.

**Why:**
- **RLS is first-class.** Security lives at the database layer, not the application layer. The React frontend can be a "dumb" client and still be safe — the anon key is allowed to be embedded in the bundle because policies enforce who can read/write what.
- **Postgres, not NoSQL.** Recipes are relational (recipes → ingredients, steps, comments). Joins are cheap; document stores would force denormalization or N+1 reads.
- **Free tier is sufficient** for a solo cookbook with a small social layer.
- **Auth + Storage + DB in one** keeps the operational surface tiny — no separate auth provider, no S3 wiring.

**Tradeoffs:**
- Vendor lock-in to Supabase's specific conventions (`auth.users`, RLS helpers like `auth.uid()`). Migration off would require rewriting policies and the auth wiring.
- Local dev is harder than a pure Postgres setup (Supabase CLI exists but adds friction for a solo project — currently we just point at the cloud project directly).

---

## Security model: RLS-first

**Decision:** Every public table has RLS enabled. Visibility is enforced by SQL policies, not by application code.

**Why:**
- The anon key is in the browser bundle by design. RLS is the only thing standing between a curious user and other people's private data.
- Policies in SQL are easier to audit than scattered `if (recipe.author_id === user.id)` checks in JSX components.
- Frontend can naively `select('*')` and trust the server to filter.

**Pattern in use:**
- **Owner-write** policies use `auth.uid() = author_id` (or equivalent).
- **Public-read with private fallback**: `is_public OR auth.uid() = author_id` — anonymous clients see only `is_public = true` rows; the author sees their own private rows too.
- **Linked-table access** (ingredients, steps): policies join back to the parent recipe and re-check its visibility, so a deeply-nested read still respects the recipe's privacy.
- **Social actions** (like, comment, follow) gate writes on `auth.role() = 'authenticated'` and deletes on `auth.uid() = user_id` (own only).

**Tradeoff:** Complex policies can be hard to reason about and easy to get subtly wrong. Always sanity-check by hitting the API anonymously and as a non-author user when adding/changing policies.

---

## Auto-profile trigger (`on_auth_user_created`)

**Decision:** A Postgres trigger on `auth.users` automatically inserts a row into `public.profiles` when a user signs up.

**Why:**
- Avoids a race window where the app has a session (`auth.uid()`) but no profile row, which would break joins and FK references throughout the app.
- Keeps the signup flow on the client side simple — no "now also create your profile" round-trip after auth.
- The `raw_user_meta_data` JSON passed at signup is mapped into profile fields (`username`, `full_name`, `avatar_url`), so the client can pre-populate the profile in one auth call.

**Tradeoff:** The trigger uses `SECURITY DEFINER` to write into a table the new user technically doesn't own yet — a privilege-escalation surface that has to stay narrow. Keep the function body trivial; don't accept arbitrary input through it.

---

## Cascade-on-delete everywhere

**Decision:** Every foreign key uses `ON DELETE CASCADE`.

**Why:**
- Deleting an account should clean up all of that user's content. Orphaned ingredient rows pointing at a vanished recipe are useless and risk leaking data.
- Saves us from writing manual cleanup logic on the client.

**Tradeoff:** Hard deletes are unrecoverable. There's no "undo account deletion" without a backup. Acceptable for a personal-cookbook scope; would need to revisit (soft delete + retention window) if the app grows to real users.

---

## Storage: `recipe-images` bucket

**Decision:** A single public-read Supabase Storage bucket named `recipe-images` holds all cover images. Writes are authenticated.

**Why:**
- Public read lets anonymous browsers see cover images without a signed URL dance for every card in the grid (would be ~25–100 signed URLs per page load).
- One bucket keeps the operational surface small. Per-recipe or per-user buckets would multiply policy complexity without a clear benefit at this scale.

**Tradeoff:**
- Anyone with the URL can fetch the image, even if the parent recipe is private. **This is a real privacy gap for `is_public = false` recipes** — the recipe data is hidden by RLS but the image is not. Acceptable today (the cover image alone leaks little); revisit before launching to non-friends.

---

## Migration convention

**Decision:** Migrations are SQL files in the repo root, named `supabase_migration[_NNN_name].sql`, run manually via the Supabase Dashboard SQL editor.

**Current state:**
- `supabase_migration.sql` — initial schema (all tables, RLS, indexes, auto-profile trigger).
- `supabase_migration_002_tags.sql` — adds `tags TEXT[] NOT NULL DEFAULT '{}'` to `recipes` + GIN index `idx_recipes_tags`. Idempotent (`IF NOT EXISTS` on both column and index).
- `supabase_migration_003_favorites.sql` — adds `created_at TIMESTAMPTZ` + covering index to `favorites`, *and* attaches the three RLS policies that migration 001 forgot. Idempotent (`IF NOT EXISTS` for column/index, `DROP POLICY IF EXISTS` + `CREATE POLICY` for policies).
- `supabase_migration_004_likes.sql` — adds `created_at TIMESTAMPTZ` to `likes` and tightens the INSERT policy (was `auth.role() = 'authenticated'`, now `auth.uid() = user_id`). Idempotent.
- `supabase_migration_006_profiles_insert.sql` — adds the INSERT policy on `profiles` that migration 001 forgot. Required so `Profile.jsx`'s `upsert(...)` (which compiles to `INSERT ... ON CONFLICT DO UPDATE`) passes RLS. Idempotent.
- Future migrations: `supabase_migration_007_*.sql`, etc. *(Note: number 005 is reserved for the `stage-5-comments` branch — `supabase_migration_005_comments.sql` will land in this list when that branch merges.)*
- `supabase_migration_005_comments.sql` — tightens the comments INSERT policy (same gap as the original likes policy) and adds a covering `(recipe_id, created_at DESC)` index for the per-recipe newest-first list. Idempotent.
- `supabase_migration_007_ingredient_notes.sql` — adds nullable `notes TEXT` column to `ingredients`. No RLS changes (the existing ingredients policies gate on parent recipe visibility). Idempotent.
- `supabase_migration_008_admin.sql` — adds the `is_admin` flag on profiles, admin-override DELETE policies, self-promotion-prevention trigger, and two SECURITY DEFINER RPCs (`admin_delete_user`, `bootstrap_admin`). Idempotent. See "Admin role + moderation policies" below for the rationale.
- `supabase_migration_009_admin_visibility.sql` — adds additive admin-override SELECT policies on `recipes`, `ingredients`, `steps`. Migration 008 gave admins DELETE rights but not SELECT, so they could moderate content they couldn't see. Idempotent.
- `supabase_migration_010_admin_trigger_fix.sql` — fixes the over-eager `prevent_self_admin_grant` trigger from migration 008 that was reverting legitimate UPDATEs from the SQL editor (no JWT → `auth.uid()` NULL → `is_admin()` false → trigger reverts) and from `bootstrap_admin()` itself (caller isn't admin *yet* during promotion → same trigger path → no-op). New trigger skips when `auth.uid() IS NULL` and when a transaction-local GUC opts out. Idempotent.
- `supabase_migration_011_canonical_ingredient.sql` — adds nullable `canonical_ingredient_id UUID` column to `ingredients`. No FK target yet (the canonical table doesn't exist), no RLS changes. Forward-compatibility hook for Stage 10's fridge-basket feature — see "Canonical ingredient hook + token-match filter" below for the rationale. Idempotent.
- `supabase_migration_012_follows_notifications.sql` — hardens the `follows` INSERT policy (same gap as migrations 004/005), adds `notify_on_new_recipe` + `created_at` columns + covering index + own-only UPDATE policy on `follows`, creates the `notifications` table with own-only SELECT/UPDATE/DELETE (no client INSERT — server trigger only), and adds an AFTER INSERT trigger on `recipes` that fans out notifications to opted-in followers when the recipe is public. See "Follows hardening + in-app notifications (migration 012, Stage 11)" below. Idempotent.
- `supabase_migration_013_oauth_profile_trigger.sql` — patches `handle_new_user()` to correctly populate `username` and `avatar_url` for OAuth signups (Google and GitHub), which use different metadata key names than email/password. See "OAuth provider metadata mapping in `handle_new_user()`" below for the key-mapping rationale. Idempotent (`CREATE OR REPLACE FUNCTION`).
- Future migrations: `supabase_migration_014_*.sql`, etc.

**Why manual / no Supabase CLI yet:**
- Solo side project — the migration cadence is slow enough that the Dashboard's SQL editor is faster than wiring up the CLI.
- One source-controlled file per migration keeps history visible in git without a separate migration runner.

**Tradeoff:** No automatic ordering or rollback. If the project gets a second contributor or a staging environment, adopt the Supabase CLI (`supabase db push`) instead.

---

## Tags column on `recipes` (migration 002)

**Decision:** Add `tags TEXT[] NOT NULL DEFAULT '{}'` to `public.recipes` and a `GIN` index on it.

**Why:**
- **`TEXT[]` instead of a join table:** Tags are simple labels with no metadata of their own. A `tag_id`/`recipe_tags` two-table model would add joins for every recipe read with no benefit at this scale. Postgres arrays + GIN are first-class and stay fast for containment queries (`WHERE tags @> ARRAY['vegan']`) up to millions of rows.
- **`NOT NULL DEFAULT '{}'`:** Avoids `null`-vs-empty-array branching in the frontend. Every recipe always has a `.tags` property; it's either populated or empty.
- **GIN index, not B-tree:** B-tree on an array is useless for "contains tag X" queries. GIN is the standard index type for array membership and Postgres `@>`, `&&`, `<@` operators.
- **Lowercase, deduped at the app layer (CreateRecipe.jsx):** Keeps `"Vegan"`, `"vegan"`, `"VEGAN"` from spawning three buckets. The DB doesn't enforce this — a future API client could insert mixed-case tags — but the app's only insert path normalizes.

**Tradeoffs:**
- No referential integrity on tags. A typo creates a new "tag." This is fine for a personal cookbook; a tag-cloud UI later can surface canonical tags via aggregation. If the project ever wants strict tag governance, migrate to a join table at that point.
- Tag-renaming or merging is harder than with a tags table (need to `UPDATE recipes SET tags = array_replace(tags, 'old', 'new')`). Acceptable for current scale.
- No RLS policy changes needed: the existing recipes-read policy (`is_public OR auth.uid() = author_id`) covers tag visibility automatically since tags live on the recipe row.

## Favorites RLS + created_at (migration 003)

**Decision:** Add `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` and a `(user_id, created_at DESC)` index to `public.favorites`, plus three RLS policies (own-only SELECT / INSERT / DELETE). Bookmarks are private — no one but the user can see what they've saved.

**Why:**
- **Migration 001 forgot the policies.** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` was applied but no `CREATE POLICY` statements followed, meaning no one — not even the row's own user — could read or write `favorites`. The feature was inert. This migration fixes that.
- **Own-only SELECT (not public):** A user's bookmark list is personal — closer to a private notes folder than a public profile. A "trending bookmarks" or "X also saved this" feature is conceivable later (Stage 7 territory) and would need a different aggregate-only view that doesn't expose the raw user→recipe pairs. Until then, default to private.
- **Insert policy uses `WITH CHECK (auth.uid() = user_id)`:** Prevents a user from inserting a favorite row claiming to be someone else.
- **`created_at` for sortability:** The original favorites table was just a `(user_id, recipe_id)` composite primary key with no timestamp. "My Bookmarks" needs to show most-recent first, so we add the column with a `NOW()` default. Existing rows (none expected in a fresh dev project, but possible) get the migration time as their timestamp — acceptable.
- **Covering index `(user_id, created_at DESC)`:** The dominant query is `WHERE user_id = $1 ORDER BY created_at DESC`. This index serves both the filter and the sort with no extra sort step.

**Tradeoffs:**
- **No "popularity" signal exposed.** With own-only SELECT, we can't show "this recipe has been bookmarked 47 times" without a different mechanism (likely a materialized view or a counter column updated by a trigger). Will revisit when we want that surface.
- **One write per toggle** (Insert or Delete). An UPSERT-style toggle would be cleaner but requires a different schema (a `favorited boolean` column with a unique constraint, or a stored procedure). Two-statement logic in the hook is fine at this scale.

## Likes: INSERT policy hardening + count strategy (migration 004)

**Decision (policy):** Replace the migration-001 INSERT policy `WITH CHECK (auth.role() = 'authenticated')` with `WITH CHECK (auth.uid() = user_id)`.

**Why:**
- The original policy only verified that the request came from a *logged-in* user — it didn't verify the `user_id` column matched the authenticated user. A crafted client could `INSERT INTO likes (user_id, recipe_id) VALUES ('<other-user-uuid>', '<recipe-uuid>')` to like a recipe on someone else's behalf. The new policy closes that gap.
- The DELETE policy (`USING (auth.uid() = user_id)`) and SELECT policy (`USING (true)` — likes are public information) were already correct and don't change.

**Decision (count strategy):** Bulk-fetch all likes once into a client-side `Map<recipe_id, count>` rather than a Postgres view or a counter column with triggers.

**Why:**
- **Scale.** At 50 recipes × low single-digit likes each = ~150 rows total. A single `SELECT recipe_id, user_id FROM likes` returns in <100ms and gives us both the per-recipe count *and* the current user's liked set (one query, two derived data structures).
- **Reversibility.** The `useLikes` hook's public API (`likeCount(id)`, `userLiked(id)`, `toggleLike(id)`) is independent of how the data is sourced. If the table grows past ~5k rows, the implementation can swap to a Postgres view (left join + `COUNT`) or a denormalized counter column + AFTER INSERT/DELETE trigger without touching any consumer. We don't pay the complexity cost until we benefit from it.

**Tradeoffs:**
- **Privacy.** Bulk-fetching includes every like row's `user_id`. The migration-001 public SELECT policy on `likes` explicitly allows this — likes are designed as public information. If a future requirement wants likes to be private (e.g., "anonymous likes"), the SELECT policy needs to flip to own-only + a separate aggregate view for counts.
- **created_at column added but unused** in this stage. Defensive — when Stage 7's "trending" / "recently liked" features land, the timestamp is already there. The cost of an `IF NOT EXISTS` column add now is negligible.

## Profiles INSERT policy (migration 006)

**Decision:** Add `CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id)`.

**Why:**
- **Migration 001 forgot the INSERT policy.** Profiles had SELECT (public) and UPDATE (own-only) but no INSERT. The `handle_new_user()` trigger creates profile rows via `SECURITY DEFINER`, bypassing RLS, so the gap was invisible during signup.
- **`upsert()` exposes the gap.** `Profile.jsx` calls `supabase.from('profiles').upsert(updates)`. Postgres implements upsert as `INSERT ... ON CONFLICT DO UPDATE` — both branches require the INSERT RLS check to pass, even when the row already exists and the statement takes the UPDATE branch. With no INSERT policy, every Profile save was rejected with `new row violates row-level security policy for table "profiles"`.
- **`WITH CHECK (auth.uid() = id)`:** matches the existing pattern from migration 004 (likes INSERT tightening). A user can only INSERT a profile row whose `id` equals their own auth uid — they can't claim another user's id during the conflict path.

**Tradeoffs:**
- **None significant.** The policy is strictly additive — it unblocks the upsert that was already supposed to work. The `SECURITY DEFINER` trigger continues to work unchanged (it bypasses RLS regardless).
- **Alternative considered:** rewriting `Profile.jsx` to use `.update()` instead of `.upsert()`, since the row should always exist by the time the user reaches the Profile screen. Rejected — `.upsert()` is the more defensive choice (handles edge cases where the trigger didn't fire, legacy users imported without it, etc.) and the missing policy was the actual bug, not the upsert semantics.

## Test-account seeding (`scripts/seed-test-accounts.js`)

**Decision:** Seed test data via a Node script that uses the regular Supabase signup flow (anon key + `auth.signUp`), not the `service_role` key. Seeded recipes are marked `is_public = false`.

**Why:**
- **Anon key only:** Keeps the `service_role` key out of the project entirely — one less highly-privileged credential to manage for a side project. The cost is that "Confirm email" must be temporarily disabled in Supabase Auth settings while seeding (signup needs to return a session immediately).
- **Private recipes (`is_public = false`):** Each test account needs to see a *different* recipe count to exercise the [[refs/COSMETICS.md]] density tiers. If recipes were public, every account would see the union of all seeded recipes (~50) and every account would land in the densest tier. Private-per-account makes each tier observable when logging in as that account.
- **Idempotent re-seed:** The script deletes existing recipes scoped to `author_id = test_account.id` before inserting, so it's safe to re-run. The scoping means the user's real account is never touched even if they re-run by accident.
- **Picsum.photos for images:** No external API key, no Storage upload, varied heights to actually exercise the masonry layout. Real food photos can replace these later via the in-app create flow.

**Tradeoffs:**
- Temporary auth-policy change required. Re-enable "Confirm email" after seeding.
- Test accounts use a shared password sourced from `.env.local` (`TEST_PASSWORD`) — fine for local/dev Supabase projects, not for any project that touches real users. The literal previously lived in the seed script; once the repo went public on GitHub it was leaked, rotated in Supabase, and moved to `.env.local` so the source is credential-free. Same pattern for the admin account (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
- Profile bios are written via a separate `UPDATE` on `profiles` because the `handle_new_user` trigger only handles username/full_name/avatar_url from `raw_user_meta_data`.

## Comments: INSERT policy hardening + covering index (migration 005)

**Decision (policy):** Replace the migration-001 INSERT policy `WITH CHECK (auth.role() = 'authenticated')` with `WITH CHECK (auth.uid() = user_id)`. Identical gap and identical fix as migration 004 for `likes`.

**Why:**
- The original policy verified the request came from a logged-in user but didn't verify the `user_id` column matched the authenticated caller. A crafted client could `INSERT INTO comments (recipe_id, user_id, content) VALUES (..., '<other-user-uuid>', 'imposter comment')` and the policy would accept it. The new policy closes that gap.
- The DELETE policy (`USING (auth.uid() = user_id)`) and SELECT policy (`USING (true)` — comments are public information, same model as likes) were already correct and don't change.

**Decision (covering index):** Add `idx_comments_recipe_created` on `(recipe_id, created_at DESC)` alongside the existing `idx_comments_recipe (recipe_id)` from migration 001.

**Why:**
- The dominant query for the comments UI is `WHERE recipe_id = $1 ORDER BY created_at DESC` — the new compound index serves both the filter and the sort with no separate sort step. The original index covers the filter only.
- Both indexes coexist intentionally. The write amplification on `INSERT` is minimal (one extra index entry per comment) and Postgres can choose whichever index has the lower estimated cost per query. The original isn't strictly redundant — it's narrower and may win for `EXISTS`-style predicates that don't care about ordering.

**Tradeoffs:**
- **Comments are public.** Anonymous viewers can read every comment on every public recipe. This matches the social model of casual recipe hubs and mirrors the likes policy. If a future requirement wants comments to be visible only to signed-in users (or only to followers), the SELECT policy needs to flip — but no aggregate-count complication, since unlike likes there's no public count to preserve.
- **No moderation hooks yet.** A comment is `DELETE`-able only by its author or via a manual SQL delete (which RLS doesn't gate for the `service_role`). If the project grows beyond personal use, a `reports` table + admin-only moderation UI is the natural next step.
- **No edit-comment support.** The schema technically allows it (no policy blocking UPDATE by the author — there's no policy at all, so RLS denies by default). If editing becomes a requirement, add an UPDATE policy `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` and a `updated_at` column.

## Admin role + moderation policies (migration 008)

**Decision:** Add a binary `is_admin BOOLEAN NOT NULL DEFAULT FALSE` column on `public.profiles` and four additive admin-override DELETE policies (one per moderation-relevant table). Self-promotion is blocked by a BEFORE UPDATE trigger. User deletion runs through a `SECURITY DEFINER` RPC that cascades from `auth.users`.

**Why a column, not a separate table:**
- A single binary role doesn't need a join table. A future "roles" table with row-per-user-per-role makes sense if we ever introduce moderator/editor/owner distinctions; today there's one moderation role and one column is the cheaper representation.
- Querying admin status from RLS becomes a one-liner: `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin)`. Wrapped in a helper `public.is_admin()` so policies stay readable.

**Why additive policies, not policy replacement:**
- Postgres RLS OR's all policies for the same action. Adding `CREATE POLICY "Admins can delete any recipe" FOR DELETE USING (public.is_admin())` to a table that already has `CREATE POLICY "Authors can manage their recipes" FOR ALL USING (auth.uid() = author_id)` means a regular user keeps owner-only delete access AND an admin gains any-row delete access — no behavior change for non-admins.
- Tables affected: `recipes`, `comments`, `likes`, `favorites`. Profiles is intentionally NOT in this list — deleting a profile row without deleting the underlying `auth.users` row would leave an orphaned auth account; user deletion goes through the RPC instead.

**SELECT side of the same story (migration 009):** The DELETE overrides above only matter if the admin can find the content. The visibility-gated tables (`recipes`, `ingredients`, `steps`) get matching admin-SELECT overrides in migration 009. `likes` and `comments` SELECT is already `USING (true)` (public-read), so no change. `favorites` SELECT stays own-only — admins can wipe a recipe's bookmarks without needing to enumerate who held them.

**Why a self-promotion trigger:**
- The existing UPDATE policy on profiles is `USING (auth.uid() = id)` — any user can update their own row, including `is_admin`. A naive bad actor could `UPDATE profiles SET is_admin = TRUE WHERE id = auth.uid()` and grant themselves admin. The `prevent_self_admin_grant()` BEFORE UPDATE trigger silently reverts `is_admin` changes from non-admin callers (`NEW.is_admin := OLD.is_admin`), so the existing UPDATE policy doesn't need to be split. Existing admins can still demote each other / themselves through the same trigger path since `public.is_admin()` returns true for them.
- Alternative considered: dropping the UPDATE policy and replacing it with one that explicitly excludes the `is_admin` column. Postgres RLS doesn't natively gate at the column level for UPDATE policies, so that would require either (a) revoking UPDATE on the `is_admin` column via column-level GRANTs, or (b) the same trigger. Trigger is cleaner.

**Why a SECURITY DEFINER user-delete RPC:**
- `auth.users` is owned by the `supabase_auth_admin` role; a regular authenticated caller cannot DELETE from it directly. The `admin_delete_user(target_id)` function is `SECURITY DEFINER`, runs as the function owner (typically `postgres`, which has DELETE on `auth.users`), and explicitly checks `public.is_admin()` before executing the delete. Without `SECURITY DEFINER`, the admin would need service_role to delete users, which can't be exposed to the browser.
- Cascade chain: `auth.users` ON DELETE CASCADE → `profiles` (FK declared in migration 001) → `recipes`, `comments`, `likes`, `favorites` (all FKs declared with ON DELETE CASCADE). One DELETE removes everything the user owned.
- Self-protection guard: `IF target_id = auth.uid() THEN RAISE EXCEPTION ...`. Prevents an admin from accidentally locking the project out of admin access — the Supabase Dashboard remains the escape hatch for "delete the last admin".

**Why the `bootstrap_admin()` allowlist RPC:**
- The seed account `admin@example.com` is created via the standard signup flow with the anon key — same path as the test accounts. After signup the account has `is_admin = false` (default). The self-promotion trigger blocks a plain UPDATE.
- `bootstrap_admin()` is `SECURITY DEFINER` and is gated by a hardcoded email allowlist (`admin@example.com` only) that checks the caller's email from `auth.users`. Anyone else who calls it gets `RAISE EXCEPTION`. Worst-case if an attacker calls it as the seed email: they re-promote an already-promoted account, no-op.
- Real (non-seed) admin promotion is intentionally a manual SQL step by an existing admin (`UPDATE profiles SET is_admin = TRUE WHERE ...`). For a personal-cookbook project, a self-service admin-promotion UI would be a privilege-escalation footgun without commensurate benefit.
- **Migration 010 fix:** `SECURITY DEFINER` alone does NOT bypass `BEFORE UPDATE` triggers — they fire regardless of the function's executor role. Migration 008 shipped with `bootstrap_admin` silently no-opping for this reason: its UPDATE ran but `prevent_self_admin_grant` reverted the change because the caller wasn't admin *yet* during promotion. Migration 010 fixes this by having `bootstrap_admin` set a transaction-local GUC (`app.bypass_admin_trigger = 'true'`) right before its UPDATE; the trigger checks for that GUC and skips. The GUC's third-arg `true` (`set_config(..., true)`) makes it transaction-local so it can't leak across requests on a pooled connection. Same migration also teaches the trigger to skip when `auth.uid() IS NULL` so SQL-editor UPDATEs work too — those sessions are inherently privileged.

**Tradeoffs:**
- **Orphaned auth rows if profiles are deleted directly.** A path that deletes from `public.profiles` (instead of going through `admin_delete_user`) would leave the `auth.users` row intact. The UI doesn't expose such a path; all admin user-deletion routes through the RPC. Documented here in case a future feature needs to delete profile-without-auth.
- **No audit log.** Admin actions don't write to a moderation log. Acceptable for a portfolio project; would need an `admin_actions` append-only table before this app ever sees real users.
- **Bucket privacy unchanged.** Admin deletion of a recipe cascades through the DB but does not delete the cover image from the `recipe-images` bucket. This is the same gap noted in "Storage: `recipe-images` bucket" above; orphaned images cost storage but don't leak data beyond what their URL already exposed.
- **Client-side `isAdmin` is a UI signal, not authorization.** The `useAdmin` hook drives whether buttons render, but every admin action's authorization is re-checked server-side by the `is_admin()` SQL helper inside RLS policies / RPC bodies. Forging `isAdmin = true` in the bundle just renders dead controls.

---

## Home-grid pagination: offset + count-on-every-page (mobile branch)

**Decision:** Paginate the home-grid `recipes` query with Supabase's `.range(from, to)` (offset-style) and pass `{ count: 'exact' }` on every page fetch.

**Why:**
- **Offset over cursor for now.** Cursor pagination on `created_at` would be more robust against insert/delete drift (a new recipe added during the user's session won't shift offsets), but offset is dead-simple and the home grid isn't seeing concurrent writes from other users — only the signed-in author adds/deletes. The drift cost is hypothetical at this scale.
- **`count: 'exact'` on every page.** The total visible row count drives the column-density tier (1/2/3/3/4 etc. — see [refs/COSMETICS.md "Browse / Recipe Grid"](./COSMETICS.md)). If `totalCount` were computed only once on the initial fetch, deletes would leave a stale count and the column tier could mis-size after page 2. Recomputing on each fetch costs one extra index scan per request — negligible at this scale and the count is naturally authoritative. Respected by RLS, so anon users get the public count, signed-in users get public + own.
- **PAGE_SIZE = 20.** Balances request overhead vs initial-paint speed on a phone. Drop to ~6 in dev when seed data has fewer than 20 recipes (otherwise infinity scroll never triggers and you can't see it work).

**Tradeoffs:**
- **Offset drift.** If a recipe is inserted or deleted between page fetches, the offsets shift and the user could see a duplicate (or skip a row). Acceptable for a solo cookbook without realtime. Switch to cursor pagination on `created_at` if/when the app gains concurrent writers.
- **Search is still client-side.** The search box filters loaded pages only; "Loading more" is hidden during search to avoid surfacing recipes the user can't see. The eventual full-fidelity fix is server-side `ilike` filtering with pagination reset on each keystroke — listed in Stage 7 as part of "Tags filtering UI + ingredient search".
- **Count cost.** Each fetch runs an extra `SELECT COUNT(*)` against the visible row set. Fast (indexed), but if the recipes table ever grows past ~100k rows the per-page count starts to dominate. Switch to `count: 'estimated'` (a planner-stats fast estimate, accurate enough for tier-sizing) before then.

---

## Canonical ingredient hook + token-match filter (migration 011, Stage 10 fridge basket)

**Decision (schema):** Add nullable `canonical_ingredient_id UUID` to `public.ingredients` with no FK target and no consumer reading it today.

**Decision (filter):** Client-side word-boundary token match — tokenize each ingredient `name` on `/\W+/`, lowercase, and require every basket token to appear in some ingredient's token set. AND-combined with the existing tag/text search filter.

**Decision (fetch):** The home-grid `recipes` query embeds `ingredients(name)` via PostgREST relationship inference (`select('*, ingredients(name)', { count: 'exact' })`) so the filter has ingredient data to match against without N+1 round-trips.

**Why this hybrid:**
- **Token match (not substring) kills the egg/eggplant bug.** A raw substring filter would match "egg" against "eggplant"; tokenizing on `/\W+/` produces `["eggplant"]` for "eggplant" so the standalone token "egg" doesn't hit. The user explicitly called this out as the false-positive that mattered for v1 UX.
- **Multi-word basket entries decompose into all-must-match.** "olive oil" in the basket tokenizes to `["olive", "oil"]` and both tokens must appear in the recipe's ingredient token set — so "olive oil" matches "extra-virgin olive oil" but NOT a recipe that only has "olives".
- **No canonical table today, but the column exists.** Building a canonical ingredients table + seed data + fuzzy-match UI before validating the MVP is exactly the "design for hypothetical future" the project's CLAUDE.md warns against. Defaulting `canonical_ingredient_id` to NULL keeps the schema ready for a later backfill (script or LLM-assisted parse) without a painful migration when normalization actually pays off — grocery-list aggregation, nutrition lookups, substitution graphs.
- **Client-side over server-side for v1.** PostgREST doesn't expose `to_tsvector` filtering through the JS client cleanly, and at current corpus size (~50 recipes × ~6 ingredients × ~2 tokens) a per-recipe token-set build runs in <1ms per filter recompute. Moving to server-side is a swap of the call site — the basket hook's API and the `recipeMatchesBasket` boundary are designed so the implementation behind them can change without rippling.
- **Embedding ingredients in the grid query** trades ~6KB extra per page (5–8 ingredients × ~30 bytes name × 20 recipes) for eliminating N+1 fetches. The count: 'exact' value continues to refer to the parent `recipes` row count, not the embedded-rows count — PostgREST handles this correctly.
- **Visibility piggybacks on recipe RLS.** Embedded ingredient rows inherit the parent recipe's visibility — anonymous viewers see ingredients for public recipes only, just as they see the recipes themselves. No new policies needed.

**Tradeoffs:**
- **Pagination still client-side.** Like the existing search filter, the basket filter only operates over recipes already paginated into memory. "Loading more" is hidden whenever search OR basket is active so the infinite-scroll sentinel doesn't appear broken (the next page might add zero visible cards). The eventual full-fidelity fix is the server-side `tsvector` path — a `to_tsvector('simple', name)` GIN-indexed column on `ingredients` + a single SQL query that ANDs all basket tokens with `@@`. Punted until corpus size justifies it.
- **Plural/singular forms are distinct tokens.** "eggs" matches "eggs" but not "egg" (and vice versa). Stemming (Porter, snowball) or the canonical_ingredient_id path is the long-term fix; for v1 the user can add both forms if they care. Documented in the UI's placeholder voice ("Add an ingredient (e.g. eggs)").
- **Quantity ignored.** A basket containing "egg" matches a recipe requiring 12 eggs equally well as one requiring 1. Parsing quantities mid-filter is a rabbit hole worth its own stage; for now the basket is presence-only and the modal copy reflects that.
- **Tokens that only appear on unloaded pagination pages are invisible.** Same limitation as the tag chip row — basket filter works over what's loaded. Acceptable at current corpus size; the server-side upgrade above closes this too.
- **Empty `canonical_ingredient_id`.** Until a canonical table exists, the column is dead weight (one nullable UUID per ingredient row = 16 bytes/row, negligible). The cost of having it now is far less than the cost of a future migration that has to backfill historical data without a destination FK.

---

## Follows hardening + in-app notifications (migration 012, Stage 11)

**Decision (policy):** Replace the migration-001 follows INSERT policy `WITH CHECK (auth.role() = 'authenticated')` with `WITH CHECK (auth.uid() = follower_id)`.

**Why:** Identical gap to the original likes (migration 004) and comments (migration 005) policies. The original verified that the request came from a signed-in user but did not verify that `follower_id` matched the caller — a crafted client could `INSERT INTO follows (follower_id, following_id) VALUES ('<other-user>', '<author>')` and impersonate a follow. The new policy closes that gap. SELECT (`USING (true)`) and DELETE (`USING (auth.uid() = follower_id)`) were already correct and don't change.

**Decision (mutable preference):** Add `notify_on_new_recipe BOOLEAN NOT NULL DEFAULT FALSE` on `follows`, plus the missing UPDATE policy `USING (auth.uid() = follower_id) WITH CHECK (auth.uid() = follower_id)`.

**Why:**
- A column on `follows`, not a separate `follow_preferences` join table, because there is exactly one preference per follow row today. A join table is the right shape if/when preferences multiply (mute schedule, digest cadence, per-kind opt-in) — at one bit per row, the column is the cheaper representation.
- `DEFAULT FALSE` — opt-in by default. Stage 11 reframed the spec's "email sent" to in-app delivery, but the same conservative default applies regardless of channel. Users should not receive unsolicited pings just because they tapped Follow.
- The migration-001 follows table had no UPDATE policy at all; with RLS enabled that meant any UPDATE was denied. The new policy mirrors the favorites pattern from migration 003 — own row only, both `USING` (for visibility of the target row) and `WITH CHECK` (so the caller can't reassign `follower_id` mid-update).

**Decision (notifications table):** New `public.notifications` table with shape `(id, user_id, kind, actor_id, recipe_id, created_at, read_at)`. RLS policies: own-only SELECT / UPDATE / DELETE, **no INSERT policy** (RLS denies by default — only the SECURITY DEFINER trigger below can create rows).

**Why this shape:**
- **Generic `kind TEXT`** rather than a `notification_type` enum. Postgres enums require a migration for every new kind, and notifications historically grow in categories the schema couldn't predict (new comment on your recipe, someone replied to your comment, your recipe got a like milestone, etc.). String + a CHECK constraint later if the set stabilises is the cheaper path.
- **`actor_id` and `recipe_id` both nullable** (well, `recipe_id` is, `actor_id` could be too if a system notification ever fires — left non-null today, can be relaxed). This keeps the schema reusable for future kinds that don't have a recipe context. The `'new_recipe'` kind populates both; a future `'system_announcement'` could populate neither.
- **`read_at TIMESTAMPTZ` not `is_read BOOLEAN`.** Stores both the boolean (`read_at IS NULL` = unread) and the read timestamp. Cheap, and the timestamp is useful for "you read this 3 days ago" displays later.
- **No INSERT policy.** The whole point of notifications is that the recipient didn't create them — someone else's action did. Letting clients INSERT would let a malicious follower spam fake notifications into another user's bell. The trigger writes rows from a SECURITY DEFINER context that bypasses RLS; that's the only authorised write path.

**Decision (fan-out trigger):** `AFTER INSERT ON recipes WHEN NEW.is_public = TRUE` invokes `notify_followers_on_new_recipe()`, which inserts one notification per follower with `notify_on_new_recipe = TRUE`. Wrapped in `BEGIN/EXCEPTION WHEN OTHERS/END` so a delivery failure logs a `RAISE WARNING` but does not abort the recipe insert.

**Why:**
- **AFTER, not BEFORE.** The notification references `NEW.id`, which only exists after the INSERT.
- **WHERE `is_public = TRUE`.** A follower can't see the author's private recipes (RLS gates them out of the grid), so a notification pointing at one would resolve to a "not found" page. Better to skip the ping entirely than to ship a broken link.
- **`SECURITY DEFINER` + no INSERT policy.** Together these enforce "only the trigger writes notifications." Running the function with elevated privileges is the standard Postgres pattern when an RLS table needs server-controlled inserts; the alternative (a public INSERT policy with a `WHERE EXISTS (...)` guard against the follows table) is harder to audit and easier to misconfigure.
- **Wrapped exception handler.** The notification fan-out is auxiliary to the recipe creation. If a follower's row has a bad foreign key reference (which shouldn't happen, but defensively), failing the recipe insert because of a derived hint write would be a usability disaster — the author loses their work for a reason that has nothing to do with their action. The `RAISE WARNING` lands in Postgres logs for diagnosis; the caller never sees the failure.

**Decision (index choice):** Two indexes on notifications:
- `idx_notifications_user_created ON (user_id, created_at DESC)` — backs the bell-dropdown query (`WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`).
- `idx_notifications_user_unread ON (user_id) WHERE read_at IS NULL` — partial index for the unread-count badge. The badge re-renders on every notification mutation; the partial index keeps it tiny since most rows are read most of the time, so the count is cheap to compute.

**Tradeoffs:**
- **Trigger runs synchronously inside the recipe INSERT transaction.** For a recipe author with 10 000 followers all opted-in, the trigger does 10 000 inserts before the author's `POST /recipes` returns. Acceptable at portfolio-project scale (single-digit followers per author at most); upgrade path is to flip the trigger to write to a `notification_outbox` table and process the fan-out via a background worker (Supabase Edge Function or `pg_cron`).
- **No `UPDATE` trigger.** Changing a recipe from private → public after creation does NOT retroactively notify followers. Deliberate: the user might toggle visibility multiple times during editing, and re-triggering on every public flip would spam. A separate "publish" action could be the trigger source later if visibility-toggle becomes a common publish workflow.
- **Cascade interaction.** `notifications` FKs to `profiles(id)` (actor) and `recipes(id)` both with `ON DELETE CASCADE`. So when an admin deletes a user via `admin_delete_user()` (migration 008), every notification mentioning them as the actor disappears too. That's the right behaviour — the link is dead. The downside is the recipient loses the notification's read/unread state for those rows; for a moderation action this is fine.
- **`actor_id NOT NULL`.** Could be relaxed later if system-generated notifications need to exist. Tightening NOT NULL now keeps the immediate kind (`'new_recipe'`) honest; loosening is one migration line away.
- **No realtime channel.** The bell badge doesn't update live — the user sees new notifications when they refresh or remount the App. Realtime via Supabase channels (`postgres_changes` on `notifications` filtered by `user_id`) is a clean upgrade; held off to keep Stage 11 scoped.

---

## OAuth provider metadata mapping in `handle_new_user()` (migration 013, Stage 12)

**Decision:** Replace the fixed `raw_user_meta_data->>'username'` and `raw_user_meta_data->>'avatar_url'` reads in `handle_new_user()` with COALESCE chains that try each provider's key before falling back.

**The mapping problem:**

| Field populated | Email/password signup | Google OAuth | GitHub OAuth |
|---|---|---|---|
| `username` | ✅ `username` (set by `useAuthForm`) | ❌ not provided | ❌ `user_name` (different key) |
| `full_name` | ❌ not set | ✅ `full_name` | ✅ `full_name` |
| `avatar_url` | ❌ not set | ❌ `picture` (different key) | ✅ `avatar_url` |

Without the patch, every OAuth signup produced a profile row with `username = NULL` and `avatar_url = NULL` (for Google), breaking the recipe card byline ("Anonymous chef" fallback) and the comment avatar chip.

**COALESCE order chosen:**

```sql
-- username
COALESCE(
  NULLIF(TRIM(raw_user_meta_data->>'username'),  ''),   -- email/password
  NULLIF(TRIM(raw_user_meta_data->>'user_name'), ''),   -- GitHub
  NULLIF(TRIM(SPLIT_PART(raw_user_meta_data->>'email', '@', 1)), ''),  -- Google fallback
  SUBSTRING(new.id::text, 1, 8)                         -- UUID prefix (last resort)
)

-- avatar_url
COALESCE(
  NULLIF(TRIM(raw_user_meta_data->>'avatar_url'), ''),  -- GitHub / manually set
  NULLIF(TRIM(raw_user_meta_data->>'picture'),    '')   -- Google
)
```

**Why email prefix for Google username:**
- Google provides `email` in `raw_user_meta_data` but no `username` field.
- `email.split('@')[0]` is the same heuristic `useAuthForm.js` already uses for email/password signups — familiar to any user who's seen their own profile.
- NULLIF(TRIM(...), '') guards against blank strings from any provider that returns an empty field instead of omitting it.

**Why UUID prefix as last resort:**
- `username` is `UNIQUE` on the profiles table. Falling back to NULL would let multiple OAuth signups stack up with username = NULL (Postgres UNIQUE doesn't constrain NULLs), silently degrading the display.
- `SUBSTRING(new.id::text, 1, 8)` is always non-null, always unique (UUIDs are unique by construction), and makes it obvious the username is auto-generated (a user who sees `a3f8b2c1` in their profile will know to update it).

**Why `CREATE OR REPLACE FUNCTION`:**
- The trigger binding (`on_auth_user_created`) already exists and remains unchanged. Replacing only the function body is the cleanest idempotent path — no DROP/CREATE cycle that could leave a window without the trigger.

**Tradeoffs:**
- **Email prefix collisions.** Two users with email prefixes `john@gmail.com` and `john@yahoo.com` would both derive username `john` — the second signup would hit the UNIQUE constraint and fail at the DB level. The UUID-prefix last resort only activates if SPLIT_PART itself returns empty (i.e., no email at all in metadata), not on a uniqueness collision. Real fix: catch the unique violation in the trigger and append a short random suffix (e.g. `john_a3f8`). Deferred — collision probability at portfolio scale is negligible and the UUID fallback exists as a safety net.
- **`full_name` stays uncoalesced.** Both Google and GitHub use `full_name` so no chain is needed. Email/password signups don't set it; that's intentional — the Profile edit screen is where those users fill it in.
- **Existing OAuth rows are not backfilled.** The trigger only fires on new signups. Any OAuth account created before migration 013 keeps its null username/avatar_url until the user visits the Profile edit screen and saves. A backfill script (reading `auth.users.raw_user_meta_data` via the service-role key) could patch historical rows; held off since the table is empty in dev and the live app had no OAuth users prior to this stage.

---

## `recipes_with_counts` view for popularity-sort (migration 014, Stage 13 v2)

**Decision:** Add a read-only Postgres view that joins `recipes` to an aggregated `likes` subquery and exposes `like_count`. Use it as the table source in `fetchRecipes` when the home grid's sort mode is popularity-based.

**Why:**
- **Server has to order the page.** Stage 4's bulk-fetch (a `Map<recipe_id, count>` built client-side) was enough for *rendering* counts on already-paginated rows, but the server can't order by something the client computes. Popularity-sort needs the count in SQL.
- **No drift.** A view is a pure read; counters maintained by triggers can drift if a trigger is ever bypassed (manual SQL, future RPC writes). Drift is silent and only shows up as wrong order on the home grid — exactly the surface where being wrong is most visible.
- **No backfill.** Adding counter columns to a populated table means writing a backfill query and getting it right under concurrent writes. The view sidesteps this entirely.
- **Upgrade path is clean.** When corpus size makes the join expensive, swap the view's body to read from a denormalised column; callers don't change.

**RLS:** `WITH (security_invoker = true)` so the view runs as the *caller*, not the view's owner. Without this, the view would bypass the `recipes` RLS and leak private recipes to anonymous viewers. The `likes` subquery is safe under invoker semantics because `likes` has a public SELECT policy (migration 001) — counts come out correct for anon and authenticated alike.

**Why bookmarks-sort isn't in this migration:** `favorites` is private (own-only SELECT, migration 003). Under `security_invoker`, an aggregated `bookmark_count` would be 0 for everyone except the owner of those bookmarks — useless as a sort key. Adding it requires a privacy decision: either expose `bookmark_count` publicly via a SECURITY DEFINER function (the user "X people saved this" signal) or keep aggregates private and sort by them only for the recipe's author. Deferred to its own sub-stage so the trade-off is conscious.

**Tradeoffs:**
- **Join cost at query time.** A LEFT JOIN to a GROUP BY subquery is computed on every read. Fine at thousands of recipes; warrants revisit at hundreds of thousands. The two-tier upgrade (view → counter columns) is documented above.
- **PostgREST embedded relations on views.** PostgREST 11+ detects inherited FKs through views that select the PK transparently (which this one does via `r.*`), so `ingredients(name)` and `author:profiles!author_id(...)` embeds keep working. If a future schema cache reload ever fails to pick the inheritance up, the explicit hint `ingredients!recipe_id(...)` is the fix.

---

## Cookbooks + cookbook_recipes (migration 015, Stage 14 item 1)

**Decision:** Two-table model — `cookbooks` (one row per collection) + `cookbook_recipes` (join, ordered by `position`). Cookbooks are owner-curated and optionally public; cookbook_recipes inherit their parent cookbook's visibility for reads but are gated on parent ownership for writes.

**Why two tables, not an array column on `cookbooks`:**
- A recipe needs to live in many cookbooks (many-to-many), so an array on either side would denormalise.
- Ordering (`position`) and per-membership metadata (`added_at`) need somewhere to live.
- Reverse-lookup ("which cookbooks contain this recipe?") for the future "Add to cookbook…" affordance on RecipeDetail needs an index on the recipe-id side; an array column would force a GIN scan instead of a B-tree probe.

**Curation model — Option A (own-only), not collaborative:** Only the cookbook's `owner_id` can add, reorder, or remove recipes. Mirrors `favorites` (a private personal collection) rather than `comments` (multi-author). Collaborative cookbooks would need a `cookbook_collaborators` table, more RLS surface, and a "who invited whom" UX — none of which the audience has asked for. Decision is reversible later: add a collaborators table and widen the EXISTS check in the write policies; existing single-owner cookbooks keep working.

**RLS — parent-visibility-inherited pattern (new in this project):** Existing join-ish tables in the project (`favorites`, `likes`, `comments`) gate writes on `auth.uid() = user_id` directly because each row carries the actor's id. `cookbook_recipes` rows don't — they carry `cookbook_id` and `recipe_id`, neither of which is the actor. So the policies use:

```sql
EXISTS (
  SELECT 1 FROM public.cookbooks c
  WHERE c.id = cookbook_recipes.cookbook_id
    AND c.owner_id = auth.uid()  -- for INSERT/UPDATE/DELETE
)
```

For SELECT the policy drops the `owner_id` check — the EXISTS just confirms the parent cookbook is visible to the caller, and the parent's own RLS (`is_public OR auth.uid() = owner_id`) does the actual filtering. This is the first migration in the project that uses an EXISTS-on-parent pattern for write gating. Future join tables (e.g., `cookbook_collaborators`, `meal_plans`'s recipe slots) should follow the same shape — it's the right pattern any time the actor isn't on the row itself.

**Cover image — nullable URL + client-side fallback:** `cookbooks.cover_image_url TEXT` is nullable. When null, the client composes a cover from the first N recipe thumbnails (zero-effort default). When set, points into the existing `recipe-images` bucket — no new bucket / storage policy needed. An author who wants a polished cover can upload one; an author who doesn't gets a reasonable auto-cover for free.

**Cascade behavior:**
- Deleting a cookbook drops its `cookbook_recipes` rows (own-only).
- Deleting a recipe drops it from every cookbook that contained it (`ON DELETE CASCADE` on `cookbook_recipes.recipe_id`). This means a user's cookbook can shrink without their action when an author they bookmarked deletes a recipe. Acceptable: the alternative (orphaned references) is worse.
- Deleting a user drops all their cookbooks via the existing `profiles` cascade chain.

**Tradeoffs:**
- **EXISTS subquery cost on every INSERT.** Negligible at any realistic scale — the cookbooks PK lookup is a single index probe.
- **No uniqueness on `(cookbook_id, position)`.** Two recipes can share a position. Acceptable for v1 — client-side reorder assigns fresh positions, and visual ordering ties break by `added_at` if it ever happens. A unique index would force a more involved reorder transaction.

---

## Password policy: stay on Supabase defaults (Stage 16 item 3)

**Decision:** Keep Supabase Auth's default password policy (8-character minimum, no required character classes). Do not enable additional complexity requirements, expiry, or history checks.

**Why:**
- **Threat model is low-stakes.** The worst-case account compromise leaks recipes, bookmarks, follows, and comments — no payments, no PII beyond email and a self-written bio, no health/financial data. The blast radius of a brute-forced casual account is "someone reads private cookbook entries", not "identity theft".
- **Strict policies hurt the actual audience.** The intended users are friends and family, not adversaries. Forcing "symbol + digit + uppercase + 12 chars" raises the sign-up friction tax that demonstrably tanks completion rates in casual apps, with no commensurate security gain at this risk level. NIST SP 800-63B (2017+) explicitly recommends against the older composition rules for similar reasons — they push users toward predictable substitutions (`Password1!`) without raising entropy meaningfully.
- **Defense-in-depth lives elsewhere.** Higher-value protections for this app are already in place: admin actions are gated on TOTP MFA (Stage 16 item 2), the anon key is RLS-bounded, and Supabase Auth rate-limits sign-in attempts server-side. Password complexity is the wrong lever to push.
- **Documenting this stops it being an open question.** Past stage planning kept reopening "should we tighten passwords?" — capturing the answer + reasoning here closes the loop until a real signal forces a revisit.

**Revisit when any of these become true:**
- The app starts storing PII beyond email / displayName / bio (e.g., shipping addresses for the shopping-list partner integration in Stage N+2b).
- A real attack signal appears (credential-stuffing spike in Supabase Auth logs, reports of account takeover).
- The audience expands beyond friends/family — public sign-ups from strangers shift the calculus.
- A specific feature requires elevated trust (e.g., direct messaging, payment flows).

If revisited, the lever order is: (1) enable Supabase's HaveIBeenPwned check (free, zero UX cost on the happy path — blocks passwords known from public breach corpora like LinkedIn/Adobe/Collection #1 via the `haveibeenpwned.com` Pwned Passwords API; one toggle in Project Settings → Authentication → Password Settings); (2) require MFA for all signed-in users, not just admins; (3) raise minimum length to 12 — only as a last step, since length is the highest-friction lever for legitimate users.

**Tradeoffs:**
- **Weak passwords are possible.** A user can choose `password` (8 chars) and Supabase Auth will accept it. That account is more vulnerable to credential stuffing than one with a 16-char random password. Acceptable given the threat model; the user wears the consequence within their own data.
- **No password expiry.** Same NIST guidance — periodic rotation pushes users toward weak variants of a remembered password. Not adding it.
- **No password history.** A user who changes their password could reuse a prior one. Negligible at this risk level; the history table isn't justified.

---

## Future considerations (not yet decided)

These come up repeatedly in roadmap planning. Capturing here so the decision is conscious when it happens:

- ~~**Aggregate like-counts** — Stage 4 of the roadmap. Per-recipe `COUNT(likes)` either runs as a subquery per card (cheap at this scale, becomes N+1 at scale) or as a materialized view / database view. No decision yet.~~ *Resolved at Stage 13 v2 with the `recipes_with_counts` view (migration 014) — see decision entry above.*
- **Realtime subscriptions** — Supabase channels can push new likes/comments to clients live. Out of scope for early stages but worth noting that the table structure supports it cleanly.
- **Soft delete on recipes** — Today, deleting a recipe is irrecoverable. If users start curating large collections, an `archived_at` column is preferable to `DELETE`.
- **Bucket privacy for private recipes** — The storage gap noted above. A signed-URL approach would close it but at a UX cost.
- **Full-text search on ingredients** — Currently search is title/description LIKE in JS. Postgres `tsvector` or trigram indexes would unlock ingredient-based search (Stage 7).
