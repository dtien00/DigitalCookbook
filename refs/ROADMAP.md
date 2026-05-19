# Digital Cookbook — Roadmap

Staged plan to evolve the current Vite + React + Supabase scaffold into a Pinterest-style casual recipe hub with bookmarking, likes, and comments.

This roadmap is opinionated about **sequence**, not about exact timelines. Each stage stands alone — finish, ship to yourself, then start the next. Skip ahead only when the prior stage's foundation isn't blocking.

---

## Where We Are Today (baseline)

**Working**: email/password auth (Supabase), recipe CRUD (title, description, cover image, ingredients, steps, servings, public/private), recipe grid with title/description search, profile editing, password change.

**Schema-ready, no UI yet**: `likes`, `favorites` (bookmarks), `comments`, `follows`. The Postgres tables and RLS policies are already in [supabase_migration.sql](./supabase_migration.sql).

**Tech**: React 18 + Vite 5, custom CSS, Supabase (Auth + Postgres + Storage), no TypeScript, no router. See [TECHNICAL_CONCEPTS.md](./TECHNICAL_CONCEPTS.md) for the rationale.

---

## Stage 0 — Foundation & Tidying  *(done)*

Goal: trustworthy starting point. No new features.

- [x] Harden [.gitignore](./.gitignore) — `node_modules/`, `dist/`, `.env.local`, `.env.*.local`, `credentials.env`, editor/OS files, and `.context/` are all now ignored. *Previously only `credentials.env` was ignored — actual Supabase keys in `.env.local` were one `git add .` away from being committed.*
- [x] Reconcile docs with reality — [README.md](./README.md) and [TECHNICAL_CONCEPTS.md](./TECHNICAL_CONCEPTS.md) now describe Vite/React (not Next.js/TS).
- [x] Create `.context/` for working notes (gitignored).
- [x] Remove dead code in [src/App.jsx](./src/App.jsx) (unused `handleRecipeMouseOver` + commented JSX).
- [x] Fix back-label inconsistency in [src/components/Profile.jsx](./src/components/Profile.jsx).

**Exit criteria**: `git status` shows no untracked secrets or `node_modules`, `npm run dev` still works, no functional regressions.

---

## Stage 1 — Tailwind + Pinterest Browse UX

Goal: the home grid feels like Pinterest instead of a basic card list. Adopt Tailwind so future stages are layout-cheap.

**Tasks**
- [x] Install Tailwind. *Done via Tailwind v4 + `@tailwindcss/vite` plugin (configured in [vite.config.js](./vite.config.js)). The v4 approach skips `tailwind.config.js`/`postcss.config.js` and auto-scans the project, so the original task line below is obsolete.*
- [x] ~~Configure `tailwind.config.js` to scan `./index.html` and `./src/**/*.{js,jsx}`.~~ *Not needed with Tailwind v4 — content scanning is automatic.*
- [x] ~~Replace `src/index.css` body with `@tailwind base; @tailwind components; @tailwind utilities;`~~ *Done with the v4 equivalent: `@import "tailwindcss";` at the top of [src/index.css](./src/index.css).*
- [x] Convert the recipe grid in [src/App.jsx](./src/App.jsx) to a responsive masonry-feel layout. *Implemented with `break-inside-avoid` on each card and removed the legacy 4:3 aspect-ratio wrapper so images keep their natural height — that's what produces the varied-height Pinterest look. Column counts are **library-size adaptive** (4 tiers): tiny libraries (≤3) get 1–2 columns / large cards, growing to a 5-column floor at 20+ recipes so cards never drop below ~250px on a 1280px viewport. Tier is computed from `recipes.length`, not `filteredRecipes.length`, so cards don't resize while the user searches.*
- [x] Polish card hover: image scales slightly, title overlay fades in. *Uses `group` / `group-hover:` to coordinate image `scale-105` and overlay opacity transition. Cards also gain a stronger shadow on hover.*
- [x] Convert top-level chrome (header, search bar, primary buttons) to Tailwind classes; delete equivalents from [src/index.css](./src/index.css). *Done — `.container`, `.header`, `.header-right`, `.actions`, `.search-bar input`, and all four button classes (`.btn-primary`, `.btn-secondary`, `.btn-link`, `.btn-danger`) deleted. Replaced with inline Tailwind utilities at each call site (no Button component yet — premature abstraction for the current call-site count). Container widened from `max-width: 800px` → `max-w-7xl` so the masonry can actually reach its `xl:columns-5` floor. Search input gains a focus ring. Hover states added to all button variants (previously absent in legacy CSS). Side-effect fix: Profile.jsx's "My Recipes" list was still referencing `.recipe-card`/`.card-overlay` classes deleted in the masonry PR — converted to the same Tailwind masonry treatment.*
- [x] Add `tags TEXT[]` column to `recipes` in a new migration file (`supabase_migration_002_tags.sql`). Surface tags as a small chip row on cards. Editing tags lives in [CreateRecipe.jsx](./src/components/CreateRecipe.jsx). *Done — migration adds `tags TEXT[] NOT NULL DEFAULT '{}'` plus a GIN index for future tag-filter UIs. Tag chips appear on cards on hover (above the title, alongside the description reveal) for image cards, and persistently in the card body for image-less cards. Capped at 3 visible chips per card to avoid crowding. CreateRecipe.jsx adds a comma-separated text input with a live chip preview below; values are trimmed, lowercased, and deduped before save. Seed script also seeds tags so the test accounts demo the feature out of the box.*

**Optional this stage**
- Install `react-router-dom` for shareable URLs (`/`, `/recipe/:id`, `/profile/:id`). Pinterest's link-shareability is part of its DNA; state-only routing makes that impossible. If scope feels heavy, push to Stage 2.

**Exit criteria**: home grid is responsive, multi-column, with hover overlays; Tailwind is the styling system; tags column exists and can be filled in. *Partial: grid + hover are done. Header chrome conversion and tags column still required.*

---

## Stage 2 — Public Browse (no-auth)  *(done)*

Goal: anonymous visitors can browse public recipes without an account, the way they can on Pinterest.

**Tasks**
- [x] Move the `if (!session) return <Auth />` gate out of the top of [src/App.jsx](./src/App.jsx). Render the recipe grid for everyone. *Done — `showAuth` is now a state-controlled view; the home grid renders regardless of session.*
- [x] Replace the auth gate with a "Sign in" CTA in the header. Hide `+ New Recipe`, bookmark/like/comment actions behind auth — clicking them prompts login. *Done — header conditionally shows Profile/Logout when signed in vs a single "Sign In" primary button when anonymous. The "+ New Recipe" button is hidden for anonymous users (bookmark/like/comment buttons don't exist yet — they'll get the same gating in Stages 3–5).*
- [x] Verify Supabase RLS public-read policy on `recipes` works without a session. *Confirmed — the existing `USING (is_public OR auth.uid() = author_id)` policy returns only `is_public = true` rows when `auth.uid()` is null. No SQL changes needed.*
- [x] The Supabase client query in `fetchRecipes()` needs no change — RLS handles it. *Correct — the only change to `fetchRecipes()` was removing the `if (session)` gate around its `useEffect` so anonymous users also trigger the fetch.*
- [x] New: added a `test-public@example.com` seed account (6 public recipes) so the anonymous browse view shows something. The script schema also gained `account.isPublic` to differentiate public vs private seed accounts; test accounts 1–4 stay private (preserves their density-tier mapping when logged in). Documented density-tier shifts in `refs/TESTING.md`.
- [x] Auth screen gains a "← Back to recipes" button when invoked from the home grid, so anonymous users can dismiss without committing.

**Exit criteria**: opening the app in an incognito window shows the public recipe grid; clicking "Bookmark" opens the login modal. *Met — anonymous view shows the test-public account's 6 recipes. (Bookmark gating is N/A until Stage 3 adds the button.)*

---

## Stage 3 — Bookmarks (Favorites)  *(done)*

Goal: signed-in users can save recipes to a personal collection.

**Tasks**
- [x] New hook for favorites. *Done as `src/hooks/useFavorites.js` (plural) — instead of one hook per card (which would N+1 on a grid of 30+), it bulk-fetches the user's favorited recipe IDs once at the App level into a `Set`. The hook exposes `isFavorited(recipeId)` for O(1) membership and `toggleFavorite(recipeId)` with optimistic UI + rollback on error.*
- [x] Bookmark icon button on each card and on [RecipeDetail.jsx](./src/components/RecipeDetail.jsx). *Done as a shared `<BookmarkButton>` component. Position on cards: `absolute top-3 right-3 z-10` over the image. The card markup was simultaneously extracted into `src/components/RecipeCard.jsx` since it's now reused across the home grid, Profile's "My Recipes", and My Bookmarks. Filled (indigo) when favorited, outline (gray) when not. Click stops propagation so card-click navigation still works.*
- [x] "My Bookmarks" view. *New `src/components/MyBookmarks.jsx`, linked from the header (Bookmarks button next to Profile). Fetches `favorites` joined to `recipes` ordered by `created_at DESC`. Empty state copy: "No bookmarks yet. Save recipes you love by tapping the bookmark icon on any card."*
- [x] Optimistic UI. *Toggle flips the local `Set` immediately, fires the Supabase write, rolls back if the write fails. No spinner — feels instant.*

**Schema**: technically `favorites` already existed, **but** migration 001 enabled RLS without writing any policies — currently no one can read or write it. Migration 003 (`supabase_migration_003_favorites.sql`) adds:
- Three RLS policies (own-only SELECT / INSERT / DELETE — bookmarks are private to each user)
- A `created_at TIMESTAMPTZ DEFAULT NOW()` column so the My Bookmarks view can sort by recency
- A covering `(user_id, created_at DESC)` index for that query

**Anonymous behavior**: bookmark button is still rendered on cards for anonymous viewers — clicking it opens the Auth view instead of toggling. Pinterest's pattern.

**Exit criteria**: bookmarking from a card persists across reloads; "My Bookmarks" lists everything the user has saved. *Met.*

---

## Stage 4 — Likes

Goal: lightweight "I appreciate this" signal, separate from bookmarks (Pinterest distinguishes "save to board" from a quick like).

**Tasks**
- New hook: `src/hooks/useLike.js` — same shape as `useFavorite`. Writes to `likes`.
- Heart icon with like-count on recipe cards and on [RecipeDetail.jsx](./src/components/RecipeDetail.jsx).
- Counts: either an aggregate query per recipe (cheap at this scale) or a Postgres view that left-joins `recipes` with `COUNT(likes)` to avoid N+1.
- Optimistic UI on toggle.

**Schema**: no change — `likes` already exists.

**Exit criteria**: heart toggles, count updates, persists across reloads, scales reasonably on a grid of 30+ recipes.

---

## Stage 5 — Comments

Goal: casual conversation under each recipe.

**Tasks**
- New component: `src/components/Comments.jsx` — list of comments + an "Add comment" form. Renders on [RecipeDetail.jsx](./src/components/RecipeDetail.jsx).
- New hook: `src/hooks/useComments.js` — `{ comments, addComment, deleteComment, loading }` for a given recipe.
- Joins to `profiles` so each comment shows the author's username and avatar.
- Delete-own-comment only (RLS already enforces this on the server).
- Empty state ("Be the first to comment"), basic relative timestamps ("2h ago").

**Schema**: no change — `comments` already exists.

**Exit criteria**: posting, listing, deleting your own comment all work; another user's "Delete" button is hidden.

---

## Stage 6 — Polish & QA

Goal: the app stops feeling like a prototype.

**Tasks**
- Replace every `alert(...)` call with a toast system. Lightweight option: `react-hot-toast`. Touch [Auth.jsx](./src/components/Auth.jsx), [CreateRecipe.jsx](./src/components/CreateRecipe.jsx), [RecipeDetail.jsx](./src/components/RecipeDetail.jsx), [Profile.jsx](./src/components/Profile.jsx).
- Accessibility pass: alt text on all images, keyboard navigation on cards (Enter to open), visible focus styles, ARIA labels on icon-only buttons (bookmark/like/delete).
- Loading skeletons in the grid and on the detail page (instead of `Loading...` text).
- Empty states across views (no recipes yet, no bookmarks, no comments, etc.).
- Image lazy loading: `loading="lazy"` on every `<img>` in the grid.
- Mobile audit: cook-in-the-kitchen use case. Make sure the detail page reads well on a phone propped against the kettle.

**Exit criteria**: the app is something you'd happily show a friend on their phone.

---

## Stage 7 — Deferred / Later

Things explicitly *not* in the early roadmap. Each is reasonable, none is urgent.

- **Follows + follow feed**: schema is ready (`follows`), but a useful feed needs more recipes than a solo cookbook generates. Build when the social graph has signal.
- **Discovery / Explore page**: trending recipes, recently-liked, by tag. Worth it once there's a corpus to discover from.
- **Tags filtering UI + ingredient search**: tags column is added in Stage 1, but a tag-cloud / chip-filter UI and ingredient-based search are post-MVP.
- **Realtime updates**: Supabase channels can push new likes/comments live. Nice, not necessary.
- **Servings multiplier**: scale ingredient quantities by a serving slider (e.g. recipe is for 4, user wants 6 → multiply quantities by 1.5). Mentioned in the original README; small but quality-of-life.
- **Per-step checklists**: README originally promised checkbox tracking through ingredients and steps. Local state only; useful for cooking-in-progress.
- **Next.js migration**: would unlock `<Image>` optimization, SSR, SEO-friendly recipe pages, App Router. Worth doing *if* the app outgrows a solo/small-circle audience. Don't migrate preemptively.
- **TypeScript migration**: same rationale — wait for the project to stabilize, then port file-by-file.
- **Moderation, rate limiting, reporting**: only matters once there's a non-trivial number of strangers using it.

---

## Working Style

- Each stage is a branch + PR mentally, not a months-long epic. Aim to finish one before starting the next.
- Mark items done in this file as they ship so this stays a live document.
- If reality diverges from the roadmap, update the roadmap — don't pretend.
- `.context/` is for scratch notes; promote anything durable into this file or a code comment.
