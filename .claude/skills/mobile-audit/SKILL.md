---
name: mobile-audit
description: Audit a screen or component for mobile/phone-width usability — typography sizing, tap-target generosity, layout reflow, overlapping chrome. Use whenever the user says "mobile audit", "check this on phone", "responsive check", "phone-width review", "does this look right on mobile", or wraps a stage with a "+ mobile pass" item. Also trigger when the user opens a newly-built component and asks for a final review before shipping — phone-width regressions are the most common late-stage finding in this project.
---

# Mobile audit

The Digital Cookbook is used on phones in the kitchen — that's the actual use case, not a hypothetical. Stage 6 established a mobile-audit pass per stage; this skill encodes what that pass looks like so it's not reinvented each time.

## What to check

For the target component(s), evaluate against these criteria at phone widths (treat `~375px` as the worst-case width to design for, with `~390px` and `~414px` as common targets):

### 1. Typography
- **Body text:** at least `text-base` (16px) on mobile. Smaller than that strains readability in kitchen lighting.
- **Headings:** the rustic theme uses serif `Lora` for headings. The recipe-detail title was specifically tuned for phone widths — match that voice rather than letting headings balloon to desktop sizes on small screens. If a heading uses `text-4xl` or larger unconditionally, propose a `text-2xl md:text-4xl` (or similar) responsive step-down.
- **Italic explanatory text** (loading messages, descriptions) — already in `text-rose` per [refs/COSMETICS.md](../../../refs/COSMETICS.md). On mobile, watch for it wrapping awkwardly into 3+ lines; consider tightening copy.

### 2. Tap targets
- Minimum 44×44px tappable area for any interactive element (Apple HIG; Material's 48px is also fine). The bookmark and like buttons are already at `w-10 h-10` (40px) — borderline. If you're adding new buttons in a similar role, bias up to `w-11` / `h-11`.
- Adjacent tappables need ≥ 8px gap so a thick finger doesn't hit both. Watch for icon clusters in headers.

### 3. Layout reflow
- `flex` rows that work on desktop often need `flex-col md:flex-row` on mobile, or they overflow.
- Masonry grid: the cosmetics table specifies `2 col` on mobile for libraries of 21+ recipes, `1 col` for everything smaller. Verify the current component respects that, especially if it's a grid-like view that isn't the home grid (e.g., MyBookmarks, Profile's "My Recipes").
- Page padding: home view uses `px-5` (20px) — generous enough for thumb-reach margins. RecipeDetail/Profile use `max-width: 900px` — verify they have equivalent horizontal padding on mobile.

### 4. Chrome overlap
- Absolute-positioned elements (the bookmark top-right, like top-left, title-overlay bottom) can collide on narrow cards. If the card width drops below ~200px, the bookmark + like pills can crowd the title area. Check the visual at `375px / 2 cols`.
- The header action row (Bookmarks, Profile, Logout) — three buttons can overflow at narrow widths. The logged-in header should collapse gracefully (consider an icon-only or menu collapse if needed).

### 5. Form usability (Auth, CreateRecipe, Profile)
- Inputs should be `text-base` (16px) minimum — iOS Safari zooms the viewport on focus for any input smaller than 16px, which is a jarring kitchen-use bug.
- Multi-step forms or long forms (CreateRecipe): verify the submit button is reachable without scrolling past the on-screen keyboard. A sticky-bottom submit bar is acceptable for these views.

## How to run the audit

1. **Read the target component(s)** and any sibling CSS / Tailwind classes that style them.
2. **Walk the five categories above**, surfacing findings as a structured list. Be specific — cite the file and line, not just "the header is cramped".
3. **For each finding, propose a concrete fix** as a Tailwind class change. Don't apply the fixes yet — the audit should land as a report the user can scope into a stage item.
4. **If the user asks for a screenshot/preview**, offer to start the dev server and use a browser at a phone viewport size. This requires explicit confirmation — don't start servers unprompted.

## Output shape

```
**Mobile audit — <component>**

**Typography**
- <file:line> — <finding>. Suggested: `<class change>`.
- (or "no findings")

**Tap targets**
- ...

**Layout reflow**
- ...

**Chrome overlap**
- ...

**Form usability** (only if the component is a form)
- ...

**Recommended scope:** <which findings are blockers vs. polish>
```

## What NOT to do

- **Don't apply fixes inline.** The audit is a report. The user decides which findings become commits; some will be deferred to a polish stage. Bundling fixes into the audit defeats the staged-work pattern.
- **Don't test only at 375px.** Sweep 375 / 390 / 414 mentally — a finding at 375 might disappear at 414, which changes how blocker-y it is.
- **Don't critique desktop styling during a mobile audit.** Scope creep — desktop is a separate audit. If you see a desktop issue, jot it as a follow-up bullet, don't expand the audit.
- **Don't recommend introducing breakpoint complexity beyond what Tailwind's defaults give you.** This project uses Tailwind's standard `sm md lg xl` — proposing custom breakpoints fractures the responsive system.
