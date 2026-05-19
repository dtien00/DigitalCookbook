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
- Future migrations should be numbered: `supabase_migration_002_tags.sql`, `supabase_migration_003_*.sql`, etc.

**Why manual / no Supabase CLI yet:**
- Solo side project — the migration cadence is slow enough that the Dashboard's SQL editor is faster than wiring up the CLI.
- One source-controlled file per migration keeps history visible in git without a separate migration runner.

**Tradeoff:** No automatic ordering or rollback. If the project gets a second contributor or a staging environment, adopt the Supabase CLI (`supabase db push`) instead.

---

## Future considerations (not yet decided)

These come up repeatedly in roadmap planning. Capturing here so the decision is conscious when it happens:

- **Aggregate like-counts** — Stage 4 of the roadmap. Per-recipe `COUNT(likes)` either runs as a subquery per card (cheap at this scale, becomes N+1 at scale) or as a materialized view / database view. No decision yet.
- **Realtime subscriptions** — Supabase channels can push new likes/comments to clients live. Out of scope for early stages but worth noting that the table structure supports it cleanly.
- **Soft delete on recipes** — Today, deleting a recipe is irrecoverable. If users start curating large collections, an `archived_at` column is preferable to `DELETE`.
- **Bucket privacy for private recipes** — The storage gap noted above. A signed-URL approach would close it but at a UX cost.
- **Full-text search on ingredients** — Currently search is title/description LIKE in JS. Postgres `tsvector` or trigram indexes would unlock ingredient-based search (Stage 7).
