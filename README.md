# Digital Cookbook

A Pinterest-style recipe hub for casually posting, browsing, bookmarking, liking, and commenting on recipes. Built for personal use first, with a social layer on top.

## Status

Early-stage scaffold. Auth and recipe CRUD work end-to-end against Supabase. Pinterest-style browse UX, bookmarks, likes, and comments are planned — see [ROADMAP.md](./ROADMAP.md) for the staged delivery plan.

## Features

### Built today
- **Authentication** — Email/password login, signup, password reset (Supabase Auth).
- **Recipe CRUD** — Create, view, edit, delete recipes with cover image, ingredients, steps, servings, and a public/private toggle.
- **Image uploads** — Cover images stored in Supabase Storage.
- **Profile** — Username, full name, bio, password change, and a list of your own recipes.
- **Search** — Filter the recipe grid by title or description.

### Planned (see [ROADMAP.md](./ROADMAP.md))
- Pinterest-style responsive masonry grid with Tailwind
- Public browsing for non-authenticated visitors
- Bookmarks, likes, and comments
- Tags and ingredient-based search
- Polish: toasts, loading skeletons, accessibility, lazy-loaded images

## Tech Stack

- **Frontend**: [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/) (JSX, ESM, hot reload).
- **Backend / DB / Auth / Storage**: [Supabase](https://supabase.com/) (PostgreSQL + Auth + Storage + RLS).
- **Styling**: Custom CSS today; [Tailwind CSS](https://tailwindcss.com/) is planned for Stage 1.
- **Lint**: ESLint with React plugins.

> Note: earlier versions of this README described a Next.js + TypeScript + Tailwind stack. That was an aspirational plan, not the actual scaffold. The current code is a plain Vite + React SPA. See [TECHNICAL_CONCEPTS.md](./TECHNICAL_CONCEPTS.md) for the rationale and what's deferred.

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project (free tier works)

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Then edit .env.local and fill in your Supabase URL and anon key
```

### Database

Run [supabase_migration.sql](./supabase_migration.sql) against your Supabase project's SQL editor. It creates all tables (profiles, recipes, ingredients, steps, likes, favorites, follows, comments), indexes, and RLS policies, plus an `on_auth_user_created` trigger that auto-creates a profile row for each new user.

You'll also want a Supabase Storage bucket named `recipe-images` (public read).

### Run

```bash
npm run dev      # Start the dev server (default: http://localhost:5173)
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## File Structure

```text
DigitalCookbook/
├── src/
│   ├── components/
│   │   ├── Auth.jsx          # Login / signup / password reset
│   │   ├── CreateRecipe.jsx  # Create + edit recipe form (with image upload)
│   │   ├── RecipeDetail.jsx  # View a recipe's ingredients and steps
│   │   └── Profile.jsx       # Edit profile, change password, list own recipes
│   ├── lib/
│   │   └── supabaseClient.js # Singleton Supabase client
│   ├── App.jsx               # Top-level state, routing, and recipe grid
│   ├── App.css               # Component styles (legacy — being migrated)
│   ├── index.css             # Global styles
│   └── main.jsx              # Vite/React entry point
├── public/                   # (planned) static assets
├── .context/                 # AI working notes (gitignored)
├── .env.example              # Template for required env vars
├── .gitignore                # Standard Node/Vite ignores + .env.local + .context/
├── DATABASE_SCHEMA.md        # Human-readable schema reference
├── ROADMAP.md                # Staged delivery plan
├── TECHNICAL_CONCEPTS.md     # Architecture rationale
├── index.html                # Vite entry HTML
├── package.json
├── supabase_migration.sql    # Schema + RLS + triggers
└── vite.config.js
```

## Documentation

- [ROADMAP.md](./ROADMAP.md) — Staged plan: what's next, what's deferred.
- [TECHNICAL_CONCEPTS.md](./TECHNICAL_CONCEPTS.md) — Why this stack, what's planned, what's intentionally not done.
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) — Tables, relationships, and RLS overview.
