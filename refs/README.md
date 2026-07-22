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
| [LIVE.md](./LIVE.md) | Deployment reference — Vercel + Supabase hosting and the ongoing-maintenance runbook. |
| [teachings/](./teachings/) | Lessons distilled from shipped features — implementation walkthroughs, dependency costs, and the general patterns underneath. |
| [GLOSSARY.md](./GLOSSARY.md) | Terms from planning/proposals/diffs, explained in the sense used here and grounded in the codebase — a learning record, added on request. |

## Infrastructure & future-work evaluations

Forward-looking **research and proposals**. **Docker and GitHub Actions CI have since shipped**
(PR #75) — their docs are kept as the design rationale and now describe live infrastructure; the rest
remain evaluations of options not (yet) adopted.

| Doc | Status | What it covers |
|---|---|---|
| [STACKS_EXPAND.md](./STACKS_EXPAND.md) | evaluation | Whether to adopt AWS / Kubernetes / Jenkins / Terraform / Azure / Docker — honest cost/benefit for a solo contributor vs. an industrial upscale. |
| [DOCKER.md](./DOCKER.md) | ✅ implemented | Multi-stage `Dockerfile` + nginx SPA serve, and how it fits the Vite + Supabase setup. |
| [GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md) | ✅ implemented | The CI/CD pipeline (lint + test + build + docker) and how it coexists with Vercel's auto-deploy. |
| [TERRAFORM.md](./TERRAFORM.md) | proposal | Infrastructure-as-Code for the Vercel/Supabase project, with the IaC-vs-SQL-migrations boundary. |
| [INSTACART.md](./INSTACART.md) | research | Whether and how to make recipes "shoppable" via Instacart — feasibility, costs, data-model fit; nothing implemented. |
| [MONETIZATION.md](./MONETIZATION.md) | research | Every plausible monetization domain (affiliate commerce, ads, premium, print-on-demand, …) with ethics guardrails, prerequisites, and milestone-based revenue speculation; nothing implemented. |
| [INPUT.md](./INPUT.md) | research | Alternative recipe-input methods beyond typing and paste-import (file drop, batch queue, bookmarklet, OCR, voice, URL/LLM/email), each mapped onto the Stage 22 import funnel with the general pattern named; nothing implemented. |

---

*These documents are intentionally public. The evaluations above include options deliberately
**declined** (e.g. Kubernetes, Jenkins) with the reasoning recorded — knowing when not to adopt a
technology is part of the record.*
