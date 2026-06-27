# Terraform (Infrastructure as Code) — Integration README

> **Status:** Proposal / reference. **Not yet implemented** — there is no `terraform/` directory in
> the repo today. All infrastructure (the Vercel project, env vars, the Supabase project, DNS) is
> currently configured by **clicking in dashboards** — undocumented, unreproducible, and
> un-reviewable. This README describes Terraform and exactly how it would slot into Digital Cookbook.
>
> Companion docs: [STACKS_EXPAND.md](./STACKS_EXPAND.md) (why), [DOCKER.md](./DOCKER.md) and
> [GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md) (the other two proposed additions).

---

## 1. What Terraform is

**Terraform is a declarative Infrastructure-as-Code (IaC) tool.** You describe your desired infra in
`.tf` files; Terraform compares that against the real world (tracked in *state*) and computes the
minimal set of create/update/delete actions to converge. Instead of remembering which dashboard
checkboxes you clicked, the infra *is* version-controlled, peer-reviewable code.

**Core concepts:**

| Term | What it is |
|---|---|
| **Provider** | A plugin that talks to a platform's API (e.g. `vercel`, `supabase`, `cloudflare`, `aws`, `azurerm`). |
| **Resource** | One managed thing — a Vercel project, an env var, a DNS record. |
| **State** | Terraform's record of what it manages (`terraform.tfstate`). The source of truth for diffs. |
| **`terraform plan`** | A dry-run: shows exactly what *would* change. Safe; makes nothing happen. |
| **`terraform apply`** | Executes the plan against real infra. |
| **Variables / outputs** | Inputs (`var.*`) and exposed values (`output`) for parameterization and wiring. |
| **Backend** | Where state lives — local file, or remote (Terraform Cloud, S3, etc.) for teams/CI. |

**Why it's worthwhile here:** even with a single environment, Terraform converts click-ops into a
**reviewable, reproducible** definition — and it's one of the most credible "I understand IaC"
portfolio artifacts you can show. The payoff compounds the moment you have **more than one
environment** (preview/staging vs prod) or want **"recreate it all from code."**

---

## 2. How Terraform fits Digital Cookbook

### 2.1 What it would manage

| Layer | Provider | What Terraform owns | Caveat |
|---|---|---|---|
| **Hosting** | `vercel/vercel` | The Vercel project, git connection, env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ENV_LABEL`), domains | Mature provider; the best starting point |
| **Backend** | `supabase/supabase` | The Supabase *project* and some project settings | **Partial coverage** — see §2.2 |
| **DNS** | `cloudflare`/`aws` (Route 53) | Records for a custom domain, if/when one replaces `*.vercel.app` | Only relevant once a custom domain exists |

### 2.2 The critical boundary: Terraform manages *infra*, SQL migrations manage *schema*

This is the most important rule for this project. **Terraform does NOT own your database schema or
RLS policies.** Those live — and must keep living — in the SQL files under
[supabase_migration/](../supabase_migration/) (gitignored; applied via the Supabase dashboard / the
`apply-migration` skill). The Supabase Terraform provider's coverage is **partial**: it can manage
*project-level* settings, but **tables, columns, RLS policies, triggers, and storage buckets stay in
SQL migrations.** Don't try to express the schema in `.tf` — you'd fight the tool and fragment the
source of truth.

> Clean division of labor: **Terraform = the project, env vars, domains, DNS. SQL migrations = the
> schema + RLS.** Keep them separate and each stays simple.

### 2.3 The secrets boundary

The Supabase **anon key** is public-by-design (RLS enforces access), so it's fine as a Vercel env var
managed by Terraform. But **never commit a Terraform variable file containing a Supabase
service-role key, a Vercel API token, or any real secret.** Mark sensitive variables `sensitive =
true`, supply them via environment variables (`TF_VAR_*`) or a remote backend's secret store
(Terraform Cloud), and keep `*.tfvars` with real values out of git. State itself can contain secrets
— which is the main argument for a **remote backend** over a committed local `terraform.tfstate`.

---

## 3. Proposed structure

```
terraform/
  main.tf          # providers + backend
  vercel.tf        # the Vercel project + env vars (start here)
  variables.tf     # typed inputs (tokens, ids) — sensitive ones flagged
  outputs.tf       # e.g. the deployed URL
  terraform.tfvars # LOCAL ONLY, gitignored — real values live here
```

### 3.1 `main.tf` — providers and backend

```hcl
terraform {
  required_version = ">= 1.7"
  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.0"
    }
  }

  # Start with local state; graduate to a remote backend (Terraform Cloud / S3)
  # before any CI runs `apply`, so state + secrets aren't on one laptop.
  # backend "remote" { ... }
}

provider "vercel" {
  api_token = var.vercel_api_token   # supplied via TF_VAR_vercel_api_token
}
```

### 3.2 `vercel.tf` — the slice to start with

```hcl
resource "vercel_project" "digital_cookbook" {
  name      = "digital-cookbook"
  framework = "vite"

  git_repository = {
    type = "github"
    repo = "dtien00/DigitalCookbook"
  }
}

# Env vars — anon key is public-by-design; never put a service-role key here.
resource "vercel_project_environment_variable" "supabase_url" {
  project_id = vercel_project.digital_cookbook.id
  key        = "VITE_SUPABASE_URL"
  value      = var.supabase_url
  target     = ["production", "preview"]
}

resource "vercel_project_environment_variable" "supabase_anon_key" {
  project_id = vercel_project.digital_cookbook.id
  key        = "VITE_SUPABASE_ANON_KEY"
  value      = var.supabase_anon_key
  target     = ["production", "preview"]
}

# VITE_ENV_LABEL scoped to Preview only (matches refs/TESTING.md → Environments).
resource "vercel_project_environment_variable" "env_label" {
  project_id = vercel_project.digital_cookbook.id
  key        = "VITE_ENV_LABEL"
  value      = "preview"
  target     = ["preview"]
}
```

### 3.3 `variables.tf`

```hcl
variable "vercel_api_token" { type = string, sensitive = true }
variable "supabase_url"      { type = string }
variable "supabase_anon_key" { type = string, sensitive = true }
```

### 3.4 Gitignore additions

```
terraform/.terraform/
terraform/*.tfstate
terraform/*.tfstate.*
terraform/terraform.tfvars
```

---

## 4. Workflow

### 4.1 Local

| Step | Command |
|---|---|
| Initialize providers/backend | `terraform init` |
| Preview changes (safe dry-run) | `terraform plan` |
| Apply | `terraform apply` |
| Tear down (careful) | `terraform destroy` |

### 4.2 The grown-up workflow: plan-on-PR, apply-on-merge

Terraform pairs naturally with [GitHub Actions](./GITHUB_ACTIONS.md):

```
PR touches terraform/ ──► Actions runs `terraform plan` ──► posts the diff as a PR comment
merge to main         ──► Actions runs `terraform apply` (with secrets from the backend)
```

This makes every infra change **reviewed before it happens** — the whole point of IaC. It requires a
**remote backend** (so CI and you share one state) and the provider tokens stored as **Actions
secrets**, not in the repo.

### 4.3 Importing what already exists

The Vercel project and Supabase project **already exist** (created via dashboard). You don't recreate
them — you **`terraform import`** them into state so Terraform adopts the live resources, then
reconcile the `.tf` to match. Expect a little iteration getting the first `plan` to show "no
changes" against reality; that's normal for adopting existing infra.

---

## 5. Integration checklist (phased — start tiny)

- [ ] Add `terraform/` with **just the Vercel project + env vars** (§3.1–3.3). Resist scope creep.
- [ ] `terraform import` the existing Vercel project so Terraform adopts it (don't recreate).
- [ ] Add the gitignore entries (§3.4); confirm no `tfstate`/`tfvars` is tracked.
- [ ] Get `terraform plan` to report **no changes** against live infra (the "adoption complete"
      signal).
- [ ] (Optional) Move state to a **remote backend** before wiring CI.
- [ ] (Optional) Add the plan-on-PR / apply-on-merge Actions workflow (§4.2).
- [ ] (Optional, later) Bring **DNS** under Terraform when a custom domain replaces the `*.vercel.app`
      URL.
- [ ] **Leave schema/RLS in [supabase_migration/](../supabase_migration/)** — never in Terraform
      (§2.2).

**Effort:** ~1–2 days for the Vercel slice + import. The CI wiring and DNS are incremental add-ons.

---

## 6. Gotchas & cautions

- **Partial Supabase coverage** (§2.2) — don't try to model tables/RLS in Terraform. That belongs in
  SQL migrations; mixing them fragments your source of truth.
- **State holds secrets** — prefer a remote backend over a committed local `terraform.tfstate`. Never
  commit state or real `*.tfvars`.
- **Importing > recreating** — the prod Vercel/Supabase projects exist; `import` them. A careless
  `apply` against fresh resource definitions could try to create duplicates or, worse, clobber
  config.
- **`plan` before `apply`, always** — and in CI, gate `apply` behind a reviewed PR. The blast radius
  of an unreviewed infra change is the whole site.
- **One environment ≈ modest payoff** — be honest that for a single prod environment this is partly a
  portfolio/discipline play (see [STACKS_EXPAND.md §2.3](./STACKS_EXPAND.md)). The real ROI lands
  with multi-environment or full reproducibility needs. Start with the Vercel slice; expand only as
  it earns its keep.
