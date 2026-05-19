# Testing

Operational reference for testing the app — seeded test accounts, how to refresh them, and a visual review checklist for changes that touch the recipe grid. Companion to [ROADMAP.md](./ROADMAP.md) (scope), [COSMETICS.md](./COSMETICS.md) (visuals), and [DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md) (schema rationale).

---

## Test accounts

Four seeded accounts each exercise one of the four library-size density tiers documented in [COSMETICS.md](./COSMETICS.md) → *Browse / Recipe Grid*. Logging in as each account shows a different grid density without any code change — useful for visual regression checking when touching the grid.

| Email                       | Password       | Recipes | Username    | Density tier shown |
|-----------------------------|----------------|---------|-------------|--------------------|
| `test-tiny@example.com`     | `TestPass123!` | 2       | `tiny_tim`  | ≤ 3 → up to 2 columns (large hero cards) |
| `test-small@example.com`    | `TestPass123!` | 6       | `small_sam` | 4–8 → up to 3 columns |
| `test-medium@example.com`   | `TestPass123!` | 14      | `medium_mia`| 9–20 → up to 4 columns |
| `test-large@example.com`    | `TestPass123!` | 28      | `large_lou` | 21+ → 5 columns (the density floor) |

All four accounts share the password `TestPass123!`. Recipes are `is_public = false` so each account sees only its own count when logged in — without that, every account would see the union of all seeded recipes and always render the densest tier.

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

Run through this after any change to the recipe grid, card layout, or hover behavior. Open four browser tabs/windows, one per account:

- [ ] **test-tiny** (2 recipes) — verify 1–2 column layout with large hero cards
- [ ] **test-small** (6 recipes) — verify 2–3 columns, medium cards
- [ ] **test-medium** (14 recipes) — verify 3–4 columns
- [ ] **test-large** (28 recipes) — verify the 5-column floor; cards remain ≥ ~250px wide at 1280px viewport (not pixel-mappy)
- [ ] **Hover behavior** — image scales gently, description fades in *above* the title, card shadow deepens, all coordinated
- [ ] **Search stability** — typing in the search box filters the grid but doesn't change card size (density is keyed off total library count, not filtered count)
- [ ] **Empty / sparse states** — log out and look at the public landing (when implemented in Stage 2), or check the tiny account's 2-card layout doesn't look broken
- [ ] **Mobile (≤ 640px viewport)** — every tier collapses to 1–2 columns; cards stay legible; titles don't overflow

---

## Future testing notes

Areas to flesh out as the app matures:

- **E2E coverage** — Playwright/Vitest browser tests for the auth flow (login, signup, password reset), recipe CRUD, and social actions once those exist.
- **RLS verification** — a small script that hits the Supabase REST API as an anonymous client and confirms private recipes are not leaked.
- **Storage privacy** — once the `recipe-images` bucket privacy gap from [DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md) is addressed, add a check that confirms private recipes' covers aren't fetchable without auth.
- **Mobile snapshot tests** — once enough UI is settled, screenshot the grid at common breakpoints to catch unintended layout regressions.
