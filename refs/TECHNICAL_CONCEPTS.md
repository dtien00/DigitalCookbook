# Technical Concepts & Architecture

This document explains the technical choices behind the Digital Cookbook today, and what's intentionally deferred. For the delivery sequence of upcoming features, see [ROADMAP.md](./ROADMAP.md).

## 1. Frontend: React 18 + Vite

### What it is
A single-page React app bundled and dev-served by Vite. JSX (not TypeScript) for now. All routing is currently state-driven in [src/App.jsx](./src/App.jsx) — clicking a card swaps `selectedRecipe`, clicking "Profile" swaps `showProfile`, etc.

### Why
- **Fast iteration.** Vite's dev server starts instantly and hot-reloads sub-second. Good fit for a solo build at this stage.
- **Low ceremony.** No `getServerSideProps`, no app-router conventions, no TypeScript scaffolding to maintain while the product shape is still moving.
- **Easy to migrate later.** If image-heavy browsing or SEO becomes a priority, a Next.js migration is reasonable — see "Deferred" below.

### Trade-offs
- No SSR, no built-in image optimization, no shareable URLs (yet). Acceptable for a personal/small-social cookbook; would be limiting if the app went truly public.

## 2. Styling: Custom CSS today, Tailwind CSS in Stage 1

### Today
Hand-written CSS in [src/index.css](./src/index.css) (and an empty `App.css`). Class names like `recipe-card`, `card-overlay`, `btn-primary` are applied directly. Works fine but is slow to evolve for a layout-driven Pinterest aesthetic.

### Why Tailwind (planned)
- **Speed for layout-heavy UIs.** Masonry grids, hover overlays, responsive breakpoints, and consistent spacing are all utility one-liners.
- **Built-in design system.** Color/spacing scales remove a class of cohesion bugs.
- **No CSS file proliferation.** Tailwind is appended at build time; the source stays in JSX.

## 3. Backend / DB / Auth / Storage: Supabase

### What it is
Supabase is the entire backend: a managed PostgreSQL database, an auth service, an S3-compatible storage bucket, and a generated JS client. The app talks to it directly from the browser via [src/lib/supabaseClient.js](./src/lib/supabaseClient.js); there is no custom server.

### Why
- **No server to run.** Cuts an entire ops surface for a personal project.
- **Row-Level Security (RLS).** Supabase encourages writing security policies in SQL on the table itself. Our `supabase_migration.sql` includes RLS for every table — clients cannot read or write anything the policies don't permit, even though they're talking to the DB directly.
- **Auth + a profiles trigger.** The `on_auth_user_created` Postgres trigger auto-inserts a `profiles` row whenever someone signs up — no custom backend code required.
- **Storage for images.** Recipe cover images live in the `recipe-images` bucket with public read.

### Trade-offs
- All business logic lives in either the client or SQL functions/policies. For complex logic, this can get awkward; we'd reach for Supabase Edge Functions if needed.
- Direct DB access from the browser puts more pressure on getting RLS right. Worth periodic audits.

## 4. Data Model

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) and [supabase_migration.sql](./supabase_migration.sql). Key relationships:

- `auth.users` ←→ `profiles` (1:1, auto-created)
- `profiles` → `recipes` (1:many, `author_id`)
- `recipes` → `ingredients`, `steps` (1:many, ON DELETE CASCADE)
- `recipes` ↔ `profiles` via `likes` and `favorites` (many:many)
- `profiles` ↔ `profiles` via `follows` (many:many, self-relation; deferred from product scope for now)
- `recipes` ↔ `profiles` via `comments` (many:many with content)

Tables for `likes`, `favorites`, and `comments` exist in the schema but have no UI yet — those land in Stages 3–5 of the roadmap.

## 5. State & Hooks

React's built-in `useState` and `useEffect` are doing all the work today. There's no Redux, Zustand, or React Query.

- Session lives in `App.jsx` and is propagated to child components.
- Each component fetches its own data on mount.
- Forms (`CreateRecipe`, `Profile`) manage local state arrays for ingredients and steps.

As features land, we'll likely extract small custom hooks (`useFavorite`, `useLike`, `useComments`) that each wrap a single table's read/write. If data fetching becomes repetitive or stale-state bugs appear, we'll reconsider adding TanStack Query.

## 6. Security Posture

- **Secrets**: `.env.local` holds the Supabase URL and anon key, and is gitignored. `credentials.env` is also gitignored. Anyone cloning the repo must supply their own.
- **RLS-first**: every table has Row Level Security enabled. Public recipes are world-readable; everything else requires `auth.uid()` to match the owner.
- **Anon key is public-by-design**: Supabase's anon key is meant to be shipped to the browser. RLS, not key secrecy, is what protects data.
- **What's not done yet**: rate limiting on writes, abuse moderation on comments, content reporting. These belong to a later stage if/when the social surface gets real traffic.

## 7. Intentionally Deferred

- **Next.js migration**: would unlock `<Image>` optimization, SSR, and SEO-friendly recipe pages. Worth doing if/when the cookbook is opened up beyond a small circle.
- **TypeScript**: not adopted yet. The cost of porting + the slowing of feature iteration outweighs the benefit at this size. Revisit once the app stabilizes.
- **Real-time updates**: Supabase channels can push likes/comments live. Out of scope until the basic flows feel solid.
- **Follows / Discovery feed**: schema is ready (`follows` table), UI is not. Roadmap Stage 7.
- **Tags / ingredient search**: planned for Stage 1 (`tags` column on `recipes`) and Stage 7 (richer search).
- **Server-side validation**: anything beyond what RLS enforces (e.g., string length limits, profanity filtering) would require Postgres CHECK constraints or Edge Functions.
