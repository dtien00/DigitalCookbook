# FABLE.md — Improvement & Optimization Review

*Reviewed 2026-07-01 by Claude Fable 5. Scope: whole-project pass over the codebase, [README.md](./README.md), [refs/ROADMAP.md](./refs/ROADMAP.md), [refs/DATABASE_DECISIONS.md](./refs/DATABASE_DECISIONS.md), and a production build. Prior development was done with Opus 4.8 and earlier models; this document asks "what would a fresh set of eyes flag?"*

## How to read this

The project is in notably good shape for a solo side project: every schema decision has a written rationale, RLS gaps were found and fixed stage-by-stage, optimistic-UI patterns are consistent, and the roadmap is a genuinely live document. Many "obvious" reviewer suggestions (TypeScript, Next.js, realtime, counter columns, server-side rendering) were **already considered and consciously deferred** with documented revisit triggers — this review respects those decisions and does not re-litigate them. What follows is the residue: things that are either new findings, deferrals whose trigger conditions have arguably now fired, or debt that accumulated faster than the docs acknowledge.

Findings are grouped by theme. Each carries an **impact / effort** estimate so they can be triaged into a maintenance stage.

---

## 1. Performance

### 1.1 No route-level code splitting — single 623 KB main chunk *(high impact / low effort)*

A production build (`vite build`, 2026-07-01) emits:

| Chunk | Raw | Gzip |
|---|---|---|
| `index.js` (everything) | 623 KB | 172 KB |
| `html2pdf.js` (dynamic import) | 982 KB | 286 KB |
| `index.css` | 87 KB | 16 KB |

Vite itself warns about the 500 KB threshold. Every visitor — including an anonymous phone user opening one shared recipe link — downloads the admin reports panel, MFA enrollment dialog, meal-plan grid, cooking mode, shopping list, onboarding tour, and the create/edit form before first paint.

The fix is mechanical and the project already has the precedent (html2pdf is dynamically imported): convert the route-only components in [App.jsx](./src/App.jsx) to `React.lazy` + a `<Suspense>` fallback that reuses the existing skeleton vocabulary. Best candidates, roughly by weight × rarity of use:

- `AdminReports`, `MfaEnrollDialog`/`MfaChallengeGate` (admin-only)
- `CreateRecipe` (authors only, and only when authoring)
- `MealPlan`, `ShoppingList`, `FollowingPhonebook`, `CookbookDetail`, `Profile`
- `CookingMode` (mounted from RecipeDetail on demand — already a natural split point)

The home grid + RecipeDetail should stay in the entry chunk (they are the two real entry paths). Expected result: entry chunk plausibly halves, which matters most on the kitchen-phone use case the project explicitly optimizes for.

A `build.rollupOptions.output.manualChunks` pass to give `react`/`react-dom`/`react-router-dom`/`@supabase/supabase-js` a stable vendor chunk would additionally let returning visitors keep the framework cached across app deploys.

### 1.2 `useLikes` fetches the entire likes table *(medium impact now, grows with usage / medium effort)*

[src/hooks/useLikes.js](./src/hooks/useLikes.js) pulls **every row of `likes` platform-wide** on every app mount, for every visitor including anonymous ones. The hook's own comment sets a ~5k-row revisit threshold, and at seed-data scale it's genuinely fine — but two things have changed since Stage 4:

1. Migration 014's `recipes_with_counts` view **already exists** and already serves like-counts to the popularity sort. The count half of this hook is now redundant infrastructure: the home grid could read `like_count` straight off the view rows it already fetches (make the view the default source, not just the likes-sort source).
2. The user-liked half (`Set` of own likes) only needs `WHERE user_id = auth.uid()` — a query whose size scales with *one user's* enthusiasm, not the platform's.

Splitting the hook along that line removes the only App-level query with unbounded growth. The other bulk hooks (`useFavorites`, `useFollowing`, `useCookbooks`, `useNotifications`) are all correctly scoped to the caller's own rows and don't share this problem.

### 1.3 Image pipeline is half-built *(medium impact / low–medium effort)*

[src/lib/resizeImage.js](./src/lib/resizeImage.js) (client-side canvas downscale to 1200px, JPEG q=0.85) exists and works — but it's only wired into **comment photos**. Recipe cover images and step photos still upload the raw camera file (bounded only by the 5 MB bucket cap), and then that multi-MB original is served to every grid visitor. Reusing the existing helper in [CreateRecipe.jsx](./src/components/CreateRecipe.jsx) for covers and step photos is a small change with compounding payoff (storage, bandwidth, and grid paint time all improve; masonry cards never render wider than ~500 CSS px anyway).

Related, smaller: grid `<img>`s have `loading="lazy"` (Stage 6) but no `width`/`height` or `aspect-ratio` hints, so the masonry reflows as images arrive (CLS). Persisting the image's intrinsic dimensions at upload time (two columns or a `meta JSONB`) would let cards reserve space. This is the one item here that wants a migration.

### 1.4 Home grid embeds `ingredients(name)` for everyone *(low impact / low effort — flag only)*

The paginated grid query embeds every recipe's ingredient names so the Fridge Basket filter can token-match without N+1 (documented in DATABASE_DECISIONS). The cost is paid by 100% of visitors for a feature a minority activates per-session. If payload size ever shows up in profiling, the embed could fetch lazily on first basket activation — but at current corpus size this is a note, not a recommendation.

### 1.5 Notifications never refresh after mount *(low impact / low effort)*

[useNotifications](./src/hooks/useNotifications.js) fetches once per session; a user who keeps the tab open all day has a permanently stale bell. Full Supabase realtime is already a documented deferral — but a `refetch()` on `visibilitychange`/`focus` (the tab-return moment, which is when people actually glance at the bell) is ~5 lines and closes most of the gap without touching the realtime decision.

---

## 2. Architecture & code health

### 2.1 App.jsx is 1,753 lines and the prop-forwarding trap has bitten twice *(high impact on maintainability / medium effort)*

[App.jsx](./src/App.jsx) currently owns: 13 App-level hooks, session bootstrap, the paginated fetch + sort + filter engine, `HomeView`, `RecipeDetailRoute`, `EditRecipeRoute`, the auth overlay, four modals, and a `recipeDetailProps` object of ~20 entries that each route wrapper re-destructures by explicit allow-list.

The roadmap itself records two production bugs caused by exactly this shape — the silently-dropped `mfa` prop (Stage 16: admin panel could never reach AAL2) and the silently-dropped `onOpenTimerSheet` (Stage 19: clock buttons no-op'd). A third is statistically on its way; each new RecipeDetail capability must be added in *three* places to work.

Two-step remedy, incremental and low-risk:

1. **Extract by file, no behavior change**: `HomeView` (+ its sort/filter/pagination state), `RecipeDetailRoute`/`EditRecipeRoute`, and the icon components into their own modules. App.jsx drops to a few hundred lines of composition. This also unlocks finer-grained code splitting (§1.1).
2. **Replace the mega-prop object with context** for the genuinely cross-cutting concerns — `session`/`isAdmin`/`mfa`, the timer API, the shopping-list API, cookbooks. A single `<AppServicesProvider>` (or 2–3 focused contexts) means a new capability is added *once* and consumed where needed; the destructure allow-list trap ceases to exist. The hooks themselves don't change — only where their return values live.

### 2.2 The big components are next *(medium / medium)*

[RecipeDetail.jsx](./src/components/RecipeDetail.jsx) (919 lines), [Profile.jsx](./src/components/Profile.jsx) (651), and [CreateRecipe.jsx](./src/components/CreateRecipe.jsx) (649) are each carrying multiple distinguishable responsibilities (RecipeDetail: fetch + sheet/spread layouts + admin panel + swipe gesture + action cluster + reorder mode). None is urgent, but any future feature landing in RecipeDetail is a good moment to pay this down opportunistically rather than as a dedicated refactor stage.

### 2.3 Dead file & CSS audit *(trivial)*

- [src/App.css](./src/App.css) is **0 lines** but still imported by App.jsx line 4 — delete both.
- [src/index.css](./src/index.css) is 2,223 lines across several bespoke namespaces (`.auth-book-*`, `.recipe-book-*`, `.book-spread`, five backdrop variants, print rules). Worth a one-time dead-selector sweep (e.g. anything orphaned by the Stage 14 profile rework), then leaving alone — the namespace organization itself is sound.

### 2.4 TypeScript — the deferral's trigger condition may have fired *(strategic, not urgent)*

The Stage 7 deferral ("wait for the project to stabilize, then port file-by-file") was correct at the time. But the two prop-drilling bugs in §2.1 are precisely the class of error a type checker eliminates, and the codebase now has a stable core that would type cleanly. A **zero-migration middle path** exists: `// @ts-check` + JSDoc typedefs on just the shared shapes (`Recipe`, `ShoppingItem`, `Source`, the hook return objects) gives editor-level checking of the prop-forwarding seams without renaming a single file. If §2.1's context refactor happens, that's the natural moment — new context modules can be born typed.

---

## 3. Testing

### 3.1 Coverage is two files; the cheap wins are sitting untested *(high value / low effort)*

The Vitest suite covers exactly [shoppingListCore.js](./src/lib/shoppingListCore.js) and [dragSortCore.js](./src/lib/dragSortCore.js) — chosen well (pure, complex, framework-free). But the same "pure lib, no DOM" criterion now matches **six more untested modules**:

- [parseQuantity.js](./src/lib/parseQuantity.js) — fraction parsing (`"1 1/2"`, unicode glyphs) feeding a NUMERIC column; a silent misparse corrupts saved data
- [parseDuration.js](./src/lib/parseDuration.js) — `mm:ss`/`h:mm:ss` parsing driving timers
- [scaleQuantity.js](./src/lib/scaleQuantity.js) — the multiplier + fraction-substitution shown to cooks and exported to shopping lists
- [week.js](./src/lib/week.js) — date math (week-start boundaries, the classic timezone/DST bug habitat)
- [measurementUnits.js](./src/lib/measurementUnits.js) — alias matching for the unit combobox
- The `parseSearch` / fridge-basket token-match logic currently inlined in App.jsx — extracting it to a lib (mirroring the `shoppingListCore` pattern) would make it testable *and* advance §2.1

CI already runs `vitest` on every push, so every test written here is enforced for free. The Stage N+2c throwaway "reducer harness (35 assertions)" mentioned in the roadmap suggests tests are already being written and then discarded — capturing them as committed specs costs nearly nothing extra.

### 3.2 The manual checklists in TESTING.md want a Playwright skeleton *(medium / medium)*

refs/TESTING.md's per-feature checklists are executed by hand each stage-wrap. The three or four highest-traffic flows (anonymous browse → open recipe; sign in → bookmark → My Bookmarks; create recipe → verify on grid; send to shopping list → remove recipe → undo) would convert to Playwright specs against the seeded test accounts and slot into the existing GitHub Actions workflow. The route-guard regressions the roadmap records (deep-link reload bouncing off protected routes, `sessionLoaded` sentinel) are exactly the class of bug E2E catches and unit tests can't.

---

## 4. Resilience & UX robustness

### 4.1 No React error boundary anywhere *(medium impact / trivial effort)*

A grep confirms zero `ErrorBoundary`/`componentDidCatch` in `src/`. Any render-time exception in any component currently white-screens the entire app — the worst possible failure mode for a cook mid-recipe with flour on their hands. One boundary at the route level (inside `<Routes>`, so the header survives) with a rustic-palette "Something went wrong — reload" card matching the existing ✦ empty-state voice is an afternoon of work and turns every future render bug from a blank page into a contained apology.

### 4.2 Failed reads are silent *(low / low)*

The bulk hooks' fetch failures `console.error` and render as empty state — a user on flaky kitchen Wi-Fi can't distinguish "you have no bookmarks" from "the fetch failed." The hooks already track `loading`; adding an `error` flag and letting the empty states branch on it ("Couldn't load — retry") reuses the existing toast/empty-state vocabulary. Worth doing when each surface is next touched, rather than as a sweep.

---

## 5. Documentation debt

### 5.1 Root README.md is badly stale *(high visibility / low effort — and it's a portfolio repo)*

Already flagged in the Stage N+2a wrap; still outstanding, and it has gotten worse since. Current inaccuracies:

- "Status: Early-stage scaffold" — the app is ~20 shipped stages in, deployed on Vercel, with MFA, moderation, meal planning, and cooking mode.
- "Planned" list names masonry grid, public browse, bookmarks, likes, comments, tags — **all shipped in 2025's Stages 1–7.**
- File-structure section lists 4 components; there are ~45, plus `hooks/` and an 18-file `lib/`.
- Points to `supabase_migration.sql` at repo root; migrations live in `supabase_migration/` (23 files, gitignored — the README setup instructions would strand a fresh clone).
- Doc links target repo root (`./ROADMAP.md`, `./TECHNICAL_CONCEPTS.md`); the living docs moved to `refs/`.
- No mention of the live deployment, Docker, the seed script, MAINTENANCE.md, or LIVE.md — some of which README *does* partially cover but inconsistently.

Given the repo is public and explicitly a résumé artifact ("Kitchi"), the README is the single highest-leverage document in the project and currently undersells it by roughly eighteen stages. A rewrite is an hour's work off the roadmap's own stage summaries.

### 5.2 DATABASE_SCHEMA.md freshness *(low / low)*

Root `DATABASE_SCHEMA.md` predates most of the 23 migrations (cookbooks, meal_plans, reports, notifications, comment_likes, the columns added along the way). Either regenerate it from the live schema or demote it with a banner pointing at `refs/DATABASE_DECISIONS.md` + the migration files as the source of truth — a stale schema doc is worse than none.

### 5.3 ROADMAP.md is becoming write-only *(low / low)*

At ~59k tokens with single-paragraph task entries running 500+ words, the roadmap has drifted from "staged plan" toward "engineering journal." That history is genuinely valuable — but consider splitting: completed stages move to `refs/ROADMAP_ARCHIVE.md` (or collapse to 3-line summaries with links), leaving the active document to carry only in-flight and future stages. This also materially helps AI-assisted sessions, which currently spend a large context budget paging through shipped-stage prose to find the live edges.

---

## 6. Security & operations

*(A dedicated `/review-security` skill exists for the full credential audit; these are structural observations only.)*

- **`credentials.env` at repo root** — untracked (verified via `git ls-files`), so not leaking; but its continued existence next to `.env.local` is a loaded footgun and its name is exactly what the Stage 0 gitignore hardening was about. Migrate any still-relevant values into `.env.local` and delete it.
- **Public-read storage buckets** serving private recipes' images remain a documented, accepted gap (URLs are unguessable UUIDs; exposure requires the URL). Fine at current audience; the revisit trigger should be "first stranger signup," same as the password-policy triggers.
- **Storage orphans** (cover swaps, deleted comments/steps) are accepted by documented policy. When they're worth cleaning, a scheduled Supabase Edge Function that diffs bucket listings against DB paths is the shape — but there is no urgency signal yet.
- **Migration apply-state tracking** — with 23 hand-applied migrations and a "paste into dashboard" workflow (plus the Stage 19 write-path ordering hazard), a tiny `schema_migrations(version, applied_at)` table that each migration file inserts into would let any session answer "did I run 023 yet?" with a query instead of archaeology. The `/apply-migration` skill would get a reliable ground truth.

---

## 7. Dependency & platform posture

| Dependency | Current | Latest major | Note |
|---|---|---|---|
| React | 18.2 | 19.x | 19 is stable and removes friction (no `forwardRef`, better `use`) but nothing here is blocked on it |
| Vite | 5.4 | 7.x | 5 is out of active support; 5→7 has been a low-friction jump for plain SPA configs like this one |
| ESLint | 8.55 | 9.x | 8 is EOL; 9 requires flat-config conversion — small for this repo |
| Vitest | 2.1 | 3.x | Rides along with the Vite bump |
| react-router | 7.x | current | ✅ already current |
| Tailwind | 4.x | current | ✅ already current |

None of these is urgent, but the gap only widens. Recommended as a single "toolchain refresh" branch: Vite + Vitest + ESLint flat config together (they interlock), React 19 separately after (it has its own small breaking surface). CI's lint/test/build/Docker matrix makes this unusually safe to attempt here.

**PWA note:** the deferred "App Format/Distribution" idea lists domain + app-store overhead — but a PWA manifest + service worker (`vite-plugin-pwa`) delivers home-screen install, an offline shell, and offline viewing of recently-viewed recipes (the kitchen scenario where connectivity dies mid-cook) for a weekend's effort, no store, no regulation. It's the natural next step for an app whose flagship features (cooking mode, wake lock, timers, swipe nav) are already phone-native in spirit. It would also let the shopping list — already localStorage-first — work fully offline in the store aisle.

---

## Suggested sequencing

If this became a "Stage 20 — Hardening & Payoff" arc, the ordering that front-loads value:

1. **README rewrite** (§5.1) — hours, and it's the public face. Include DATABASE_SCHEMA banner (§5.2) and `credentials.env` cleanup (§6).
2. **Route-level code splitting + vendor chunk** (§1.1) — biggest user-facing perf win per unit effort.
3. **Error boundary** (§4.1) + **cover/step-photo resize reuse** (§1.3) — two small, high-leverage robustness wins.
4. **Pure-lib test sweep** (§3.1) — mostly mechanical; do it before any refactoring so the refactors land on a green suite.
5. **App.jsx decomposition + context** (§2.1) — the structural fix; benefits every stage after it, and steps 2/4 make it safer.
6. **useLikes split** (§1.2), **notification refetch-on-focus** (§1.5), **toolchain refresh** (§7) — as capacity allows.
7. **Playwright smoke suite** (§3.2) and **PWA** (§7) — larger bets, both well-matched to this app's actual usage patterns.

Items deliberately *not* recommended: Next.js/SSR migration, realtime channels, denormalized counter columns, full TypeScript conversion, server-side image transforms — each already has a documented defer-with-trigger in refs/, and none of the triggers has fired.
