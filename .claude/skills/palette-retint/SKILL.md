---
name: palette-retint
description: Convert legacy indigo/gray/rose-500 Tailwind utilities to the rustic-paper palette tokens defined in refs/COSMETICS.md. Use whenever the user asks to "retint", "repaint", "restyle to rustic", "migrate this component to the new palette", "swap indigo for rust", or otherwise wants legacy color tokens replaced with the rustic-paper system. Also trigger when the user opens a component on the deferred-retint list (Auth, Profile, MyBookmarks, CreateRecipe) and asks for visual consistency — those screens are known to still carry the old palette.
---

# Palette retint

The project is mid-migration from a cool-modern Tailwind palette (indigo/gray/rose-500) to a custom rustic-paper palette documented in [refs/COSMETICS.md](../../../refs/COSMETICS.md) under "Visual theme — rustic paper". Home grid and RecipeDetail have already been retinted; Auth, Profile, MyBookmarks, CreateRecipe still carry the legacy tokens. This skill standardizes the mapping so retints don't drift.

## Authoritative mapping

Always re-read the rustic palette token table in [refs/COSMETICS.md](../../../refs/COSMETICS.md) before applying — the canonical source of truth is the doc, not this skill. The table below is the working summary, but if it ever conflicts with COSMETICS, COSMETICS wins.

| Legacy utility | Rustic replacement | Notes |
|---|---|---|
| `bg-indigo-600` | `bg-rust` | Primary CTA fill |
| `bg-indigo-700` | `bg-rust-dark` | Primary CTA hover |
| `text-indigo-600` / `text-indigo-700` | `text-rust` / `text-rust-dark` | Link buttons |
| `bg-indigo-50` | `bg-tan-soft` | Tag chip background on image-less cards |
| `text-indigo-700` (chip text) | `text-ink` | Tag chip foreground |
| `focus:ring-indigo-500/40` `focus:border-indigo-500` | `focus:ring-rust/40` `focus:border-rust` | Form focus ring |
| `bg-gray-200` / `hover:bg-gray-300` | `bg-paper-shade` / `hover:bg-paper-shade/80` | Secondary button surface |
| `text-gray-800` / `text-gray-900` | `text-ink` | Body text on paper background |
| `text-gray-600` | `text-ink/70` or `text-rose` (if italic-explanatory) | Muted body / loading text |
| `fill-rose-500 stroke-rose-500` | `fill-rose stroke-rose` | "Liked" heart fill (rustic `rose` is dusty, not bright pink-red) |
| `bg-red-500` (Delete) | `bg-rose-dark` | Destructive button — `red-500` reads too modern-alert against rustic |
| `bg-black/85` (gradient overlay) | `bg-ink/90` | Card image overlay |
| `bg-white/25` (frosted chip) | `bg-paper/25` | On-image chip backgrounds |
| Body font default | Body remains sans; headings use serif `Lora` | Don't blanket-swap fonts — heading-only |

## What to do

1. **Identify the file(s) to retint.** If the user pointed at a component, use that. If they said "retint Auth" or "retint Profile", find the relevant files via Glob:
   - Auth: `src/components/Auth.jsx`
   - Profile: `src/components/Profile.jsx`
   - MyBookmarks: `src/components/MyBookmarks.jsx`
   - CreateRecipe: `src/components/CreateRecipe.jsx`
   - Plus any inline class strings in [src/App.jsx](../../../src/App.jsx) gating on these views.

2. **Grep the file for legacy tokens** (`indigo-`, `gray-`, `rose-500`, `red-500`, `bg-black/`, `bg-white/`). Read the matches in context — a `text-gray-600` next to an italic explanatory string maps to `text-rose`, but the same class on a generic muted label maps to `text-ink/70`. Context decides.

3. **Apply replacements.** Prefer `Edit` with `replace_all: false` and enough surrounding context to disambiguate each site. If a single utility appears in 8 places and they all want the same replacement, `replace_all: true` is fine — but verify by reading the file first; one of them might be in a comment or a string literal that shouldn't move.

4. **Don't retouch already-rustic files.** If a file is already using `bg-rust` / `text-ink` / etc., it's been retinted — leave it. The mid-migration state means files split into two cleanly-distinguishable populations; don't muddy them.

5. **Update [refs/COSMETICS.md](../../../refs/COSMETICS.md)** to move the retinted screen out of the "What this branch does *not* touch" / "deferred to a follow-up retheme" list, and into the retinted-surfaces narrative. This is part of the [stage-wrap](../stage-wrap/SKILL.md) hygiene but matters specifically for this skill because the COSMETICS deferred-list is the source of truth for what's still legacy.

## Why this matters

The rustic palette isn't a stylistic preference — it's a brand decision the user made deliberately (aged cookbook page vs. modern web product, source palette at coolors.co/1e1e24-a2666f-b06452-d6aa6c-f2e9e4). Drift between retinted and non-retinted surfaces is visible to users navigating between Home and Profile. Each retint reduces that mismatch.

## What NOT to do

- **Don't retint a screen mid-stage without scope sign-off.** Retints touch many lines and inflate PR diffs. Treat them as their own stage item (typically rolled up under a "polish" or "follow-ups" stage).
- **Don't introduce new palette tokens.** If a utility doesn't have a clear mapping in the COSMETICS table, ask the user — adding `rust-light` or `paper-deep` on the fly fractures the palette.
- **Don't change layout or spacing during a retint.** Retint = color tokens only. Bundling layout changes into a retint PR makes the diff hard to review and hides regressions.
- **Don't touch the legacy CSS in `src/index.css`** unless the user explicitly asks. Several legacy classes (`.auth-card`, `.form-card`, `.recipe-content`) intentionally got palette-only color updates so deferred screens don't look totally broken — replacing them with utilities is a separate, larger refactor.
