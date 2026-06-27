# Expanding the Tech Stack — DevOps / Cloud Industry Standards

> **Status:** Research only. Nothing here is implemented. This document evaluates whether
> integrating industry-standard infrastructure tooling — **AWS, Kubernetes, Jenkins / GitLab CI,
> Terraform, Azure, Docker** — into Digital Cookbook is worthwhile, from two angles:
> **(1) practicality for a solo individual contributor today**, and **(2) what an upscale to a
> robust, "industrial" deployment would actually require.**
>
> **Date:** 2026-06-25 · Companion to [INSTACART.md](../INSTACART.md) (same research-doc format).

---

## TL;DR

- **The honest headline:** Digital Cookbook is *already* running on a managed serverless stack —
  **Vercel** (static SPA + one Edge Middleware) **+ Supabase** (Postgres, Auth, Storage, RLS).
  That stack already does, for free and with zero ops, most of what AWS / Azure / Kubernetes /
  Terraform would do. For a solo contributor, **migrating the production app onto this enterprise
  tooling would *add* operational burden and *subtract* almost nothing of functional value.**
- **So the value of these tools here is overwhelmingly *portfolio / learning*, not operational.**
  That's a legitimate reason — "I can speak K8s and Terraform" is resume gold — but it should be
  named honestly. Don't re-platform a working app to chase a problem you don't have.
- **The tiering that falls out of that:**
  | Tool | Practical *now* (solo) | Value at *industrial* scale | Verdict |
  |---|---|---|---|
  | **Docker** | 🟢 High | 🟢 High | **Do it** — cheap, real dev-parity win, gateway to everything else |
  | **CI (GitHub Actions / GitLab CI)** | 🟢 High | 🟢 High | **Do it** — genuine value even solo; GitHub Actions is the natural fit |
  | **Terraform** | 🟡 Medium | 🟢 High | **Worthwhile as IaC + portfolio** — codify Vercel/Supabase/DNS |
  | **AWS or Azure** | 🔴 Low (as replacement) | 🟢 High | **Parallel "reference deployment" only** — don't migrate off Vercel/Supabase |
  | **Jenkins** | 🔴 Low | 🟡 Situational | **Skip** — legacy/self-hosted; Actions covers the need |
  | **Kubernetes** | 🔴 Very low | 🟡 Only past real scale | **Learning exercise only** — this app has nothing to orchestrate |
- **Recommended order if you pursue this:** **Docker → CI → Terraform → (optional) one cloud
  reference deploy on AWS *or* Azure → (optional, deliberate) K8s lab.** Each step is independently
  useful and reversible; stop whenever the learning/portfolio return drops below the upkeep cost.

---

## 1. Where we are today (the baseline these tools would touch)

You can't evaluate "should we add AWS" without being precise about what already exists. Today's
"infrastructure" is deliberately minimal:

| Concern | Current implementation | Where |
|---|---|---|
| **Frontend build** | Vite 5 → static `dist/` (React 18 + Tailwind v4, no TypeScript) | [package.json](../package.json) |
| **Hosting / CDN** | Vercel Hobby, blanket SPA rewrite to `index.html` | [vercel.json](../vercel.json) |
| **Server-side compute** | A *single* Vercel Edge Middleware (OG unfurls for crawlers) | [middleware.js](../middleware.js) |
| **Backend / DB / Auth / Storage** | Supabase (managed Postgres + GoTrue + Storage), access via RLS | `src/lib/supabaseClient.js` |
| **Schema changes** | Hand-pasted SQL into the Supabase dashboard, *manually* | [supabase_migration/](../supabase_migration/) (gitignored) |
| **CI/CD** | **None.** `git push` → Vercel auto-builds & deploys. No test/lint gate. | — |
| **Containers** | **None.** No `Dockerfile`, no `docker-compose.yml`. | — |
| **IaC** | **None.** All Vercel/Supabase config is click-ops in dashboards. | — |
| **Secrets** | `.env.local` (gitignored) locally; Vercel/Supabase env panels in prod | [.env.example](../.env.example) |

**Two facts shape every recommendation below:**

1. **There is no server to run.** The app is static files + a managed database + one edge function.
   The classic justifications for Kubernetes/AWS/Docker-in-prod (orchestrating long-lived server
   processes, autoscaling fleets, managing your own runtime) **do not currently apply.**
2. **The biggest *real* operational gap is process, not platform:** there is **no CI gate** (lint
   passes locally or not at all) and **schema migrations are applied by hand** (error-prone, no
   audit trail). Those are the genuine weak points — and they're fixable with CI + IaC, *not* by
   moving clouds.

---

## 2. Per-technology evaluation

Each subsection answers the same four questions: **what it is**, **how it would fit Digital
Cookbook specifically**, **practicality for a solo contributor now**, and **its role in an
industrial upscale**.

### 2.1 Docker 🟢 — *the one to do first*

**What it is:** Packages the app + its runtime into a portable image that runs identically
anywhere. The lingua franca of modern deployment; every other tool here (K8s, CI runners, ECS,
Azure Container Apps) consumes Docker images.

**Fit for Digital Cookbook:**
- A **multi-stage `Dockerfile`** (`node:20` build stage → `nginx`/`caddy` static-serve stage) would
  produce a ~30 MB image serving the same `dist/` Vercel serves today.
- A **`docker-compose.yml`** could stand up the *whole* dev environment — the Vite app **plus a
  local Supabase stack** (`supabase/postgres`, GoTrue, Storage, Studio) — so a fresh clone is one
  `docker compose up` instead of "create a cloud Supabase project, copy keys, run 22 migrations by
  hand." This directly attacks the manual-migration pain point.

**Practicality now (solo): 🟢 High.** Low effort (a day), genuinely useful, *and* reversible —
Vercel keeps deploying from source regardless. The dev-parity and onboarding win is real even if you
never deploy the container. It's also the prerequisite that makes CI, AWS, Azure, and K8s *possible*
later, so it's the highest-leverage first move.

**Industrial role: 🟢 High.** The image becomes the single deployable artifact promoted through
CI → registry → any orchestrator. Non-negotiable at scale.

> **Caveat worth naming:** Vercel does *not* deploy your Dockerfile — it builds from source. So a
> container here is for **local dev parity + as the artifact for a non-Vercel deploy target**, not
> for Vercel itself. That's fine; just don't expect it to change the prod path on its own.

### 2.2 CI/CD: GitHub Actions vs GitLab CI vs Jenkins 🟢 — *the highest real value*

**What it is:** Automated pipelines that lint, build, test, and deploy on every push/PR.

**The honest gap it fills:** Right now nothing stops a broken build or lint error from reaching
`main` except discipline. The repo already has the scripts — `npm run lint`, `npm run build` — they
just aren't *enforced*. A CI gate is the single most valuable item in this entire document for a
solo dev, because it pays off **every PR, today, at zero scale.**

**Which tool:**
- **GitHub Actions — recommended.** The repo lives on GitHub (`dtien00/DigitalCookbook`). A
  `.github/workflows/ci.yml` running lint + build on PRs is ~20 lines and free for public repos.
  Zero infra to host. This is the pragmatic answer to "Jenkins/GitLab CLI."
- **GitLab CI** — equivalent quality, but only makes sense if you *mirror* the repo to GitLab to
  demonstrate `.gitlab-ci.yml` specifically. Reasonable as a deliberate portfolio exercise; pure
  overhead otherwise.
- **Jenkins** — 🔴 **Skip for this project.** Jenkins is a *self-hosted* server you must run, patch,
  and secure (a VM or container of its own). It's still everywhere in large/legacy enterprises, so
  it has resume value, but for a solo static SPA it's a heavyweight, dated choice where Actions does
  the same job with no server to babysit. If you want the Jenkins line on your resume, stand up a
  throwaway `jenkins/jenkins` container locally, wire one pipeline, screenshot it — don't make it
  load-bearing for Digital Cookbook.

**Practicality now (solo): 🟢 High (Actions).** Pipeline ideas, cheapest first:
1. **Lint + build on PR** (the must-have gate).
2. **Add type-checking** — but the project is intentionally **no-TypeScript**, so this is N/A unless
   that decision changes. (A `tsc --noEmit` step is a *reason* to consider TS, not a given.)
3. **Migration linting / a smoke test** that applies `supabase_migration/*.sql` against an
   ephemeral Postgres service container — would have caught real migration bugs.
4. **Deploy step** — mostly redundant with Vercel's own auto-deploy; only worth it if you move the
   deploy target off Vercel.

**Industrial role: 🟢 High.** CI/CD is the backbone of any serious delivery process: gated merges,
preview environments, automated migrations, image build-and-push, promotion across environments.

### 2.3 Terraform 🟡 — *best IaC + portfolio ratio*

**What it is:** Declarative Infrastructure-as-Code. You describe infra in `.tf` files; Terraform
diffs and applies it. Replaces click-ops with reviewable, version-controlled, reproducible config.

**Fit for Digital Cookbook:** Today every piece of infra is configured by clicking in the Vercel and
Supabase dashboards — **undocumented, unreproducible, un-reviewable.** Terraform could codify:
- **Vercel** (project, domains, env vars) via the official `vercel` provider.
- **Supabase** via its Terraform provider (projects, some settings) — *with the caveat that the
  provider's coverage is partial; RLS policies and schema still belong in SQL migrations, not TF.*
- **DNS** (Cloudflare/Route 53) if/when a custom domain replaces the `*.vercel.app` URL.

**Practicality now (solo): 🟡 Medium.** Honest tension: for a *single* environment that rarely
changes, Terraform can feel like ceremony over three dashboard clicks. The payoff arrives when you
have **more than one environment** (staging + prod) or want **"blow it away and recreate from code"**
reproducibility — and as a **portfolio artifact**, a clean `terraform/` directory is one of the most
credible "I understand IaC" signals you can show. Start tiny: put **just the Vercel project + env
vars** under Terraform; expand only if it earns its keep.

**Industrial role: 🟢 High.** Multi-environment, multi-region, auditable, peer-reviewed infra is
table stakes at scale. Terraform (or Pulumi/CDK) is how grown-up teams avoid snowflake
infrastructure. Pairs naturally with CI ("plan" on PR, "apply" on merge).

### 2.4 AWS 🔴/🟢 — *don't migrate; deploy a parallel reference*

**What it is:** The broadest cloud. Relevant services for an app like this:
- **Static/SPA hosting:** **S3 + CloudFront**, or **AWS Amplify** (the closest Vercel analog).
- **Containers:** **ECS on Fargate** (serverless containers — the sane middle ground) or **EKS**
  (managed Kubernetes — see §2.6).
- **Database:** **RDS Postgres** or **Aurora** (the Supabase-Postgres replacement).
- **Serverless fns:** **Lambda** (the Edge Middleware / Instacart-proxy replacement).
- **Auth:** **Cognito** (the Supabase-Auth replacement).

**Fit / the real question:** You *could* rebuild the entire app on AWS — S3+CloudFront for the SPA,
RDS for Postgres, Cognito for auth, Lambda for edge logic. But that **re-implements, with more
moving parts and a real monthly bill, what Supabase + Vercel give you managed and largely free.**
For a solo contributor that's a strict downgrade in operational comfort.

**Practicality now (solo): 🔴 Low *as a replacement* / 🟢 reasonable *as an addition*.** The smart
move isn't migration — it's a **parallel "reference deployment"**: take the Docker image from §2.1
and deploy a copy to **ECS Fargate** or **Amplify** behind a subdomain. You keep Vercel+Supabase as
the real prod, and you get a genuine, demonstrable "I deployed a containerized app to AWS with
RDS/IAM/CloudWatch" story — **without betting the live site on it.** Watch the bill: RDS and NAT
gateways are the usual surprise charges; stay inside Free Tier and tear down when not demoing.

**Industrial role: 🟢 High.** If Digital Cookbook ever needed VPC isolation, compliance boundaries,
fine-grained IAM, multi-region failover, or services Supabase doesn't offer, AWS is the canonical
destination. That's a "real company" scenario, not a portfolio one.

### 2.5 Azure 🔴/🟢 — *same logic as AWS; pick one, not both*

**What it is:** Microsoft's cloud; feature-comparable to AWS. The relevant analogs:
- **Static Web Apps** ≈ Vercel/Amplify (SPA + managed functions; generous free tier).
- **Container Apps** ≈ ECS Fargate (serverless containers, scale-to-zero).
- **Azure Database for PostgreSQL** ≈ RDS.
- **Azure AD B2C / Enter External ID** ≈ Cognito/Supabase Auth.
- **AKS** ≈ EKS (managed Kubernetes).

**Fit & practicality:** Everything in §2.4 applies almost verbatim. **Azure Static Web Apps** and
**Container Apps** are particularly nice fits and arguably have a friendlier free tier than the AWS
equivalents for a hobby project. Azure is the stronger choice **if you're targeting .NET / Microsoft
/ enterprise-IT employers**, who skew Azure.

**Practicality now (solo): 🔴 Low as replacement / 🟢 fine as the *one* cloud reference deploy.**
**Recommendation: do not stand up both AWS and Azure.** The marginal portfolio value of a second
cloud is low and the upkeep doubles. Pick the one that matches the jobs you want — **AWS for
breadth/startups, Azure for enterprise/.NET shops** — and go deep on it.

### 2.6 Kubernetes 🔴 — *learning lab only; this app has nothing to orchestrate*

**What it is:** A container orchestrator — declarative scheduling, self-healing, scaling, and
networking across a *fleet* of containers. Solves problems of **many** services and **many**
replicas.

**Fit for Digital Cookbook — the blunt truth:** This app is **static files + a managed database +
one edge function.** There is no fleet, no inter-service mesh, no horizontal-scaling pressure,
nothing to self-heal. Putting it on Kubernetes is using a container ship to cross a swimming pool.
You'd containerize the static server (§2.1), write Deployment/Service/Ingress manifests, and run a
cluster — to serve files a CDN already serves better and cheaper.

**Practicality now (solo): 🔴 Very low — *as production*.** The operational surface (cluster
upgrades, ingress controllers, secrets, RBAC, cert-manager, monitoring) dwarfs the app itself. As a
**deliberate learning exercise**, though, it's legitimate and resume-relevant:
- **Cheapest path:** local `kind`/`minikube`/`k3d` — write real manifests (Deployment, Service,
  Ingress, ConfigMap, Secret, HPA), `kubectl apply`, demo it, tear it down. **$0**, and you learn
  the actual objects.
- **Managed path:** **EKS / AKS / GKE** if you want "I ran a real cloud cluster" — but these bill by
  the hour for the control plane and nodes; spin up, demo, **destroy the same day.**

**Industrial role: 🟡 Real, but only past genuine scale.** K8s earns its complexity when you have
many independently-deployed services, polyglot runtimes, multi-team ownership, or
portability/compliance requirements no PaaS satisfies. Until Digital Cookbook is a multi-service
system with real traffic, K8s is **architecture cosplay** in prod — valuable to *know*, wrong to
*adopt* here.

---

## 3. What an "industrial-grade" Digital Cookbook would actually look like

If the goal were a robust, team-scale deployment (the upscale half of the brief), a credible target
architecture — and which tool owns each layer — is:

```
 Developer ──PR──► GitHub
                     │  GitHub Actions (or GitLab CI):
                     │   • lint + build + (type-check) + unit tests
                     │   • build & push Docker image → registry (ECR/ACR/GHCR)
                     │   • terraform plan  (infra diff as a PR comment)
                     ▼
              merge to main
                     │  CD pipeline:
                     │   • terraform apply        (infra: cloud, DNS, DB, secrets)
                     │   • run DB migrations       (gated, audited — not hand-pasted)
                     │   • deploy image → runtime  (ECS Fargate / Container Apps / K8s)
                     ▼
   ┌─────────────── Cloud (AWS *or* Azure) ───────────────┐
   │  CDN (CloudFront / Front Door)  →  static SPA          │
   │  Serverless containers/fns      →  API + edge logic    │
   │  Managed Postgres (RDS/Aurora / Azure PG)             │
   │  Managed Auth (Cognito / Entra) or keep Supabase Auth │
   │  Secrets manager · observability (CloudWatch/Monitor) │
   └───────────────────────────────────────────────────────┘
```

**Notice what changes and what doesn't:**
- **Docker, CI, and Terraform appear in *every* serious version** — they're the universal spine,
  cloud-agnostic, and worth learning first.
- **AWS *or* Azure** is one choice, not two.
- **Kubernetes is optional** even in the industrial version — ECS Fargate / Container Apps deliver
  "serverless containers" with a fraction of the ops. K8s only enters when service count and team
  count justify it.
- **You may never need to leave Supabase.** A perfectly respectable "industrial" version keeps
  Supabase as managed Postgres/Auth and just wraps it in CI + Terraform + a containerized frontend.
  Re-platforming the database is the most expensive, least reversible move — defer it hardest.

---

## 4. Recommended adoption path (portfolio-driven, reversible)

Ordered by **value-per-effort**, each step independently useful; stop at any point.

**Phase 0 — Containerize (≈1 day).** Add a multi-stage `Dockerfile` + a `docker-compose.yml` that
runs the app against **local Supabase**. Win: one-command onboarding, dev/prod parity, and the
artifact every later phase needs. *Lowest risk, highest leverage.*

**Phase 1 — Real CI (≈half a day).** Add `.github/workflows/ci.yml`: lint + build on every PR; bonus
points for a migration smoke-test against an ephemeral Postgres service container. Win: an actual
quality gate, paying off every PR. *This is the most genuinely useful item here.*

**Phase 2 — Terraform a slice (≈1–2 days).** Put the **Vercel project + env vars** (and DNS if you
add a custom domain) under Terraform. Win: reviewable, reproducible infra + a credible IaC portfolio
artifact. Expand coverage only as it earns its keep.

**Phase 3 — One cloud reference deploy (≈2–3 days, optional).** Deploy the Phase-0 image to **AWS
(ECS Fargate / Amplify)** *or* **Azure (Container Apps / Static Web Apps)** — pick the cloud matching
your target employers. Keep Vercel+Supabase as real prod. Win: a true "I shipped a containerized app
to a major cloud" story. **Mind the bill; tear down when idle.**

**Phase 4 — Kubernetes lab (optional, deliberate).** Only as a *learning* exercise: real manifests
on local `kind`, or a same-day spin-up/tear-down on EKS/AKS/GKE. Win: K8s fluency. **Never make it
load-bearing for the live site.**

**What to skip:** **Jenkins** (Actions covers it without a server to run), and **adopting a second
cloud** (diminishing returns, doubled upkeep).

---

## 5. Honest recommendation

For Digital Cookbook **as a solo portfolio project, the operationally correct answer is to add very
little of this to production** — Vercel + Supabase is already the right-sized stack, and most of
these tools would replace something that currently works with something you'd have to babysit.

But "operationally correct" isn't the only goal here: **demonstrating fluency in this exact toolset
is itself a deliverable** for a portfolio aimed at industry roles. The resolution is to **layer the
tools in where they're cheap, reversible, and genuinely instructive — without re-platforming the
live app off the managed stack that's serving it well.**

Concretely: **Do Docker and CI now** (they're real wins even ignoring portfolio value). **Do a slice
of Terraform** (best IaC-credibility-per-hour). **Do *one* cloud reference deployment** if you want a
named-cloud line on the resume. **Treat Kubernetes as a lab**, not a production target. **Skip
Jenkins and a second cloud.** Above all, **don't migrate the Supabase database or abandon Vercel to
prove a point** — that's the one move with high cost, real risk, and little upside at this stage.

> Like the Instacart research: **build it for the learning and the portfolio story, named honestly —
> not because the current architecture needs it.** It doesn't. That's a feature, not a gap.

---

## 6. Open questions before committing time

1. **What's the actual goal?** Portfolio signalling, hands-on learning, or anticipated real scale?
   The honest answer reorders everything below it.
2. **Which employers?** That single fact decides **AWS vs Azure** (startups/breadth → AWS;
   enterprise/.NET → Azure) and whether **Jenkins** is worth a token demo.
3. **Is the no-TypeScript stance fixed?** It caps how much a CI type-check step can offer
   (cf. [TECHNICAL_CONCEPTS.md](./TECHNICAL_CONCEPTS.md)).
4. **Budget tolerance for cloud bills?** Decides how far the AWS/Azure/K8s phases can run before
   tear-down. RDS, NAT gateways, and idle clusters are the classic surprises.
5. **Migrations:** is the manual paste-and-run process (see the `apply-migration` skill and
   [supabase_migration/](../supabase_migration/)) painful enough to prioritize the CI/Docker
   migration-automation work? It's the strongest *operational* (non-portfolio) case in this doc.

---

## 7. Notes & references

- Current infra surface, for grounding: [vercel.json](../vercel.json), [middleware.js](../middleware.js),
  [package.json](../package.json), [supabase_migration/](../supabase_migration/),
  [LIVE.md](../LIVE.md) (deployment reference), [MAINTENANCE.md](../MAINTENANCE.md).
- Sibling research in the same format and spirit: [INSTACART.md](../INSTACART.md).
- **Roadmap note:** if any phase is pursued, it's a clean candidate for its own stage item in
  [ROADMAP.md](./ROADMAP.md), with a paired [DATABASE_DECISIONS.md](./DATABASE_DECISIONS.md) entry
  only if the database platform itself is touched (it shouldn't be, until §4 Phase 3+).
- All effort estimates are order-of-magnitude for a solo contributor already fluent in the app, and
  assume learning the tool is *part of* the time, not separate from it.
