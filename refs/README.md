# `refs/` — Design & Decision Documents

This directory is the project's **engineering record**: the reasoning behind what Digital Cookbook
is, how it's built, and what it might become. These are deliberate design documents, kept in-repo on
purpose — a decision log, not scratch notes. (Throwaway working notes live in the gitignored
`.context/` directory instead.)

If you're reading this as a reviewer or a recruiter: this folder is where the *thinking* lives.
The code shows **what** was built; these docs show **why**, what was considered and rejected, and
how trade-offs were weighed.

---

## Living product docs

Maintained alongside the code — updated in the same change that ships work touching them.

| Doc | What it covers |
|---|---|
| [ROADMAP.md](./ROADMAP.md) | Staged plan and sequencing; what's shipped vs. what's next. |
| [FEATURES.md](./FEATURES.md) | The product's feature set and intended behavior. |
| [TECHNICAL_CONCEPTS.md](./TECHNICAL_CONCEPTS.md) | Architecture rationale — why Vite/React/Supabase, why no TypeScript, etc. |
| [DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md) | Schema, RLS policies, storage, and the reasoning behind each migration. |
| [COSMETICS.md](./COSMETICS.md) | The "rustic-paper" design system — palette tokens, typography, component styling. |
| [TESTING.md](./TESTING.md) | Test accounts, seed data, environments, and manual QA checklists. |

## Infrastructure & future-work evaluations

Forward-looking **research and proposals**. Each is explicitly marked *not yet implemented* — they
exist to evaluate options and document the decision, not to describe shipped code.

| Doc | What it covers |
|---|---|
| [STACKS_EXPAND.md](./STACKS_EXPAND.md) | Whether to adopt AWS / Kubernetes / Jenkins / Terraform / Azure / Docker — honest cost/benefit for a solo contributor vs. an industrial upscale. |
| [DOCKER.md](./DOCKER.md) | What Docker is and exactly how it would integrate with the current Vite + Supabase setup. |
| [GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md) | A proposed CI/CD pipeline (lint + build gate) and how it coexists with Vercel's auto-deploy. |
| [TERRAFORM.md](./TERRAFORM.md) | Infrastructure-as-Code for the Vercel/Supabase project, with the IaC-vs-SQL-migrations boundary. |

> A companion evaluation, [INSTACART.md](../INSTACART.md), lives at the repo root (it predates this
> index) and assesses a shoppable-recipes integration in the same research-doc format.

---

*These documents are intentionally public. The evaluations above include options deliberately
**declined** (e.g. Kubernetes, Jenkins) with the reasoning recorded — knowing when not to adopt a
technology is part of the record.*
