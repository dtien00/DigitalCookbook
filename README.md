# Digital Cookbook

I am looking to create a digital cookbook application that contains recipes, ingredients, and cooking techniques that I can access from any device for an individual person.

## Features

- **Landing Page**: Login, Register, Password Recovery.
- **User Recipes**: Create and view recipes with images, tags, ingredients, and steps.
- **Social Features**: Share recipes, follow users, and comment on recipes.
- **Recipe Management**: Servings multiplier, detailed metrics (views, likes, favorites).
- **Interactive Checklists**: Ingredient and cooking step completion tracking.

---

## Technical Stack

Based on the requirements, this project uses a modern full-stack architecture:

- **Frontend & Backend**: [Next.js](https://nextjs.org/) (React framework for server-side rendering and API routes).
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) (Utility-first CSS framework for premium UI design).
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL database, Authentication, and Storage).
- **Deployment**: [Vercel](https://vercel.com/) (Optimized hosting for Next.js).

---

## File Structure

```text
digital-cookbook/
├── app/                  # Next.js App Router (Pages & API)
│   ├── (auth)/           # Authentication routes (login, register)
│   ├── recipes/          # Recipe listing and detail pages
│   ├── profile/          # User profile and settings
│   ├── api/              # Backend API endpoints
│   ├── layout.tsx        # Global layout
│   └── page.tsx          # Landing page
├── components/           # Reusable UI components (Tailwind-styled)
├── lib/                  # Utility functions (Supabase client, etc.)
├── hooks/                # Custom React hooks
├── types/                # TypeScript definitions
├── public/               # Static assets
└── styles/               # Global CSS
```

For a detailed explanation of why these technologies were chosen, see [TECHNICAL_CONCEPTS.md](./TECHNICAL_CONCEPTS.md).
