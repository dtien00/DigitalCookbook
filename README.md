# Digital Cookbook

[![CI](https://github.com/dtien00/DigitalCookbook/actions/workflows/ci.yml/badge.svg)](https://github.com/dtien00/DigitalCookbook/actions/workflows/ci.yml)

A Pinterest-style recipe hub that grew into a full **plan → shop → cook** loop: browse and bookmark recipes, group them into cookbooks, plan a week of meals, build the shopping list from the plan, then cook hands-free with step-by-step cooking mode and floating kitchen timers.

**Live:** [digital-cookbook-ruddy.vercel.app](https://digital-cookbook-ruddy.vercel.app) — anonymous browsing works without an account. See [refs/LIVE.md](./refs/LIVE.md) for deployment details.

## Status

Actively developed. Twenty roadmap stages have shipped since the original scaffold — see [refs/ROADMAP.md](./refs/ROADMAP.md) for the full staged history and what's next.

## Features

### Browse & discover
- Pinterest-style masonry grid with library-size-adaptive columns, hover overlays, infinite scroll, and a grid-density toggle
- Search across titles, descriptions, and tags (comma syntax for tag filters, chip row above the grid), plus sort by date and popularity
- **Fridge Basket** — enter what's in your fridge and filter to recipes you can actually make (word-boundary token matching, so "egg" ≠ "eggplant")
- Anonymous public browsing — no account needed to read public recipes; shared links unfurl with real Open Graph cards (title, description, cover image) via Vercel Edge Middleware
- "More from this author" and "Similar tags" recommendation rails on every recipe

### Recipes
- Full CRUD with cover image, tags, servings, public/private toggle, per-ingredient notes, per-step photos, and per-step timer durations
- Ingredient entry ergonomics: fraction parsing (`1 1/2`, `½`), unit autocomplete, keyboard-first row management; author-side drag-reorder of ingredients and steps
- Servings multiplier that rescales quantities (with proper fractions), ingredient/step checklists, private-recipe badges
- Visual "closed mini-book" card treatment and a book-spread reading layout, with five switchable backdrop themes

### Social
- Bookmarks, likes, comments (with photo attachments and comment likes), author profiles, follows with in-app new-recipe notifications
- **Cookbooks** — named public/private collections of your own and bookmarked recipes, browsable as books on your profile spread

### Kitchen
- **Cooking mode** — full-screen one-step-at-a-time view with wake lock, swipe navigation, and a slide-up scaled-ingredient sheet
- **Kitchen timers** — preset or ad-hoc, epoch-based (survive reloads and tab-switching), floating widget that follows you between views, chime + vibration on expiry
- **Shopping list** — send a recipe's unchecked ingredients to a cumulative list with per-recipe provenance, overlap-aware removal, and undo; or copy them as plaintext
- **Meal plan** — Mon–Sun × breakfast/lunch/dinner week grid (drag-and-drop on desktop), with one-tap "build shopping list from plan" that subtracts your Fridge Basket

### Sharing & export
- Share links, print-friendly kitchen cards (`@media print`), polished PDF download, GDPR-style "download my data" JSON export

### Auth, admin & operations
- Email/password plus Google and GitHub OAuth (Supabase Auth)
- Admin moderation (delete any content, reset counts, delete users) gated behind **TOTP MFA**; user-facing report flow with an admin review queue
- First-run onboarding tour, maintenance-mode holding page, environment banner on preview deployments

## Tech Stack

- **Frontend:** [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/) SPA, [react-router v7](https://reactrouter.com/), [Tailwind CSS v4](https://tailwindcss.com/) with a custom rustic-paper palette ([refs/COSMETICS.md](./refs/COSMETICS.md)), [react-hot-toast](https://react-hot-toast.com/), [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) (lazy-loaded)
- **Backend:** [Supabase](https://supabase.com/) — Postgres + Auth (incl. OAuth and TOTP MFA) + Storage, with row-level security as the single enforcement layer ([refs/DATABASE_DECISIONS.md](./refs/DATABASE_DECISIONS.md))
- **Hosting:** Vercel (SPA rewrites via [vercel.json](./vercel.json), Edge Middleware in [middleware.js](./middleware.js) for link unfurls)
- **Tests & CI:** [Vitest](https://vitest.dev/) unit suite; GitHub Actions runs lint, tests, a production build, and a Docker image build on every push and PR
- **Docker:** multi-stage image (Node build → nginx with SPA fallback)

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project (free tier works)

### Setup

```bash
npm install

cp .env.example .env.local
# Edit .env.local: fill in your Supabase URL and anon key
```

### Database

Migrations live in [supabase_migration/](./supabase_migration/) as numbered SQL files. Run them **in order** against your Supabase project's SQL editor, starting with `supabase_migration.sql` (base schema: profiles, recipes, ingredients, steps, likes, favorites, follows, comments, RLS policies, and the auto-profile trigger), then `002` through `023`.

You'll also need three Supabase Storage buckets, each public-read with authenticated writes: `recipe-images`, `recipe-steps`, and `comment-photos`.

To populate a fresh project with demo accounts and recipes:

```bash
npm run seed:test   # see refs/TESTING.md for the account list
```

### Run

```bash
npm run dev        # Dev server (LAN-accessible by default for phone testing)
npm run build      # Production build
npm run preview    # Preview the production build
npm run lint       # ESLint
npm test           # Vitest, one-shot
npm run test:watch # Vitest, watch mode
```

## Testing & CI

Unit tests cover the pure, framework-free core modules — currently the shopping-list provenance/merge engine ([src/lib/shoppingListCore.js](./src/lib/shoppingListCore.js)) and the drag-reorder math ([src/lib/dragSortCore.js](./src/lib/dragSortCore.js)). Manual per-feature test checklists live in [refs/TESTING.md](./refs/TESTING.md).

Every push to `main` and every PR runs [GitHub Actions](./.github/workflows/ci.yml): **lint**, **unit tests**, a **production build**, and a **Docker image build**.

## Docker

The app ships as a multi-stage image — Node builds the Vite bundle, then nginx serves the static output with an SPA fallback so client-side routes (`/recipe/:id`, …) resolve:

```bash
# Supabase's URL + anon key are public-by-design (RLS is the guard), so
# they're passed as build args; omit them to get a build that just can't connect.
docker build \
  --build-arg VITE_SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
  --build-arg VITE_SUPABASE_ANON_KEY="your-anon-key" \
  -t digital-cookbook .

# Serve on http://localhost:8080
docker run --rm -p 8080:80 digital-cookbook
```

## Project Layout

```text
DigitalCookbook/
├── src/
│   ├── components/       # ~40 React components (views, modals, buttons, overlays)
│   ├── hooks/            # App-level data hooks (favorites, likes, cookbooks, timers, …)
│   ├── lib/              # Pure modules: parsing, scaling, list merging, drag math
│   ├── App.jsx           # Routing, session, home grid, App-level hook composition
│   └── index.css         # Tailwind entry + book/backdrop/print CSS vocabularies
├── supabase_migration/   # Numbered schema migrations (run in order)
├── scripts/              # seed-test-accounts.js
├── refs/                 # Living docs — roadmap, DB decisions, cosmetics, testing
├── .github/workflows/    # CI pipeline
├── middleware.js         # Vercel Edge Middleware (Open Graph unfurls)
├── Dockerfile            # Multi-stage production image
└── vercel.json           # SPA rewrite rules
```

## Documentation

- [refs/ROADMAP.md](./refs/ROADMAP.md) — staged delivery history and what's next
- [refs/DATABASE_DECISIONS.md](./refs/DATABASE_DECISIONS.md) — schema, RLS, and storage rationale (the schema source of truth, alongside the migration files)
- [refs/COSMETICS.md](./refs/COSMETICS.md) — the rustic-paper visual system
- [refs/TESTING.md](./refs/TESTING.md) — test accounts, seeding, manual checklists
- [refs/TECHNICAL_CONCEPTS.md](./refs/TECHNICAL_CONCEPTS.md) — architecture rationale
- [refs/LIVE.md](./refs/LIVE.md) — deployment reference · [MAINTENANCE.md](./MAINTENANCE.md) — maintenance-mode runbook
- [FABLE.md](./FABLE.md) — 2026-07 whole-project improvement review
