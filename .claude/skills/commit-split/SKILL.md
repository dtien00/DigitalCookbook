---
name: commit-split
description: Split accumulated session work into one commit per feature instead of a single mixed commit. Use whenever the user says "split into commits", "commit each feature", "break this up into commits", "land these as separate commits", "tidy commit history", "per-feature commits", "one commit per change", or otherwise wants a clean per-feature history out of a session's worth of edits. Also trigger when the user has been iterating in one session (multiple visually distinct adjustments, e.g. layout + carousel + scrollbar fix) and asks to "commit and wrap up" — the right answer is usually multiple commits, not one. Handles both the forward case (a working tree full of uncommitted features) and the retroactive case (one recent unpushed commit that should be unrolled into several).
---

# Commit split

This project's commit history reads as a per-feature log: each commit lands one ROADMAP item or one visibly distinct adjustment (see `git log --oneline` — entries like `Stage 14 item 2.1: recipes carousel on right page` and `Stage 14 item 4: tab spec refinement in roadmap` ship separately). When a session iterates on several adjustments, the default is one commit per adjustment, not one mixed commit covering all of them.

The canonical failure mode this skill exists to fix: in the 2026-05-26 Stage 14 items 4–5 session, seven distinct adjustments (tab system base → detached "Following" tab → vertical left-edge layout → nav/panel split into two divs → visual paradigm refinement → carousel card resize → sideways scrollbar removal) all landed as a single commit `d340c31 Stage 14 item 4: Profile left-page tab system`. That's the kind of bundling this skill prevents.

Your job is to inventory uncommitted (or recently-committed-but-unpushed) work, cluster it by feature boundary, propose a commit plan, and — only on approval — stage and commit each cluster individually. Never auto-commit. Always show the plan first.

## What to do

1. **Determine the mode.** Two scopes; ask if ambiguous:
   - **Forward (uncommitted):** working tree has multiple features that haven't been committed yet. Default mode.
   - **Retroactive (one bad commit):** the user just made a bundled commit (still unpushed) and wants to unroll it. Verify the commit is unpushed first: `git log @{u}..HEAD --oneline` should list it. If pushed, refuse to rewrite — propose a follow-up `git revert`-then-resplit only if the user explicitly accepts the rewrite cost.

2. **Inventory the changes.** Run in parallel:
   - `git status` — full picture including untracked.
   - `git diff --stat` (and `--cached` if anything is staged) — sized list of touched files.
   - `git log --oneline -10` — match the project's commit message voice (`Stage N item M: <terse imperative>`).
   - For retroactive mode also: `git show --stat HEAD` and `git show HEAD` (truncated) to see what's in the commit being unrolled.

3. **Cluster by feature boundary.** Group changes — prefer fewer, larger features over micro-commits. Useful signals:
   - **ROADMAP item or sub-item.** If the session opened with a `/stage-kickoff` for Stage N items X and Y, those are the headline clusters.
   - **Visual / behavioral boundary.** Tab system vs carousel sizing vs scrollbar removal are obviously different features even if they touch overlapping files.
   - **Doc co-changes go with the code they document.** `refs/ROADMAP.md` ticking item 4 belongs with the item-4 commit. `refs/COSMETICS.md` updates for a new palette token belong with the component that uses it. Don't make doc-only commits unless the doc change stands alone.
   - **`package.json` / `package-lock.json` go with whatever required them.** Don't isolate dep bumps into their own commit unless they truly are the change.
   - **Pure-refactor lines that touch many features** are a tiebreaker problem — fold them into the largest related cluster, don't try to make a "refactor" commit.

4. **Draft the commit plan.** Output the proposed sequence before touching git. Format:

   ```
   Plan: N commits

   1. <message>
      Files: <path>, <path>, <path>
      Why grouped: <one phrase>

   2. <message>
      Files: ...

   ...
   ```

   - Commit messages match this repo's style: `Stage N item M: <terse imperative>` when stage-scoped, otherwise `<area>: <terse imperative>` (e.g. `Profile: remove sideways scroll on tabs`).
   - **No Claude co-author trailer.** (See [[feedback_no_claude_coauthor]] — this project omits both `Co-Authored-By: Claude` and the "Generated with Claude Code" PR footer.)
   - Stop here and ask: "Land this plan? Reply with the commit numbers to accept, or edit the grouping."

5. **On approval, execute sequentially.** For each cluster:
   - `git add <specific paths>` — never `git add -A` or `git add .` (per the base Bash tool guidance; avoids dragging in `.env`, untracked debris).
   - `git commit -m "<message>"` via HEREDOC for multi-line messages.
   - If any commit fails a pre-commit hook, stop the sequence, surface the error, and let the user resolve before continuing.

6. **For retroactive mode**, before staging the first cluster:
   - `git reset --soft HEAD~1` — undo the bundled commit but keep changes staged.
   - `git reset HEAD` — unstage everything so step 5 can stage per-cluster.
   - Confirm with the user before running the reset. This is the destructive moment.

7. **Verify and report.** After the last commit:
   - `git log --oneline -<N+2>` — show the new commit sequence.
   - `git status` — confirm clean working tree (or surface any leftover untracked debris the user didn't want committed).
   - Note whether anything still needs pushing.

## Output shape

```
Mode: forward | retroactive (commit <sha> being unrolled)
Inventory: <X> files touched, <Y> lines (+<a>/-<b>) across <areas>

Proposed plan: <N> commits

1. <message>
   Files: <list>
   Why grouped: <phrase>
...

Land this plan? Reply with commit numbers to accept, or edit grouping.
```

After execution:

```
Landed <N> commits:
  <sha1> <message1>
  <sha2> <message2>
  ...
Working tree: clean | <leftover>
Unpushed: <N> commits ahead of <upstream>
```

## What NOT to do

- **Don't auto-commit.** Always show the plan and wait for explicit approval. The base Claude Code rule is "NEVER commit unless the user explicitly asks" — this skill is the user's explicit ask, but it asks once and gets a plan, not a blanket grant to commit anything in the working tree.
- **Don't rewrite pushed commits.** If `git log @{u}..HEAD` doesn't include the commit the user wants to unroll, stop. Force-push to rewrite shared history is destructive and outside this skill's default scope.
- **Don't include the Claude co-author trailer or the "Generated with Claude Code" footer.** This project's [[feedback_no_claude_coauthor]] is explicit.
- **Don't micro-commit.** A scrollbar tweak that's one line in one file is a footnote on the nearest related commit, not its own commit. Aim for 2–6 commits in a typical session, not 12.
- **Don't `git add -A` or `git add .`.** Stage explicit paths only — protects against accidentally committing `.env`, `node_modules` debris, IDE scratch files, or `.claude/sessions/` leakage.
- **Don't skip the inventory step** even if the user says "you know what to commit". The diff is the ground truth; relying on session memory ("we did X and Y") misses files you forgot you touched.
- **Don't propose a "refactor" or "cleanup" commit on top.** If lines look refactor-y, fold them into the most related feature commit. A trailing cleanup commit is usually a signal the clustering is wrong.
- **Don't use `--amend` to fix mistakes mid-sequence.** If a commit lands with the wrong message or wrong files, surface it and let the user decide whether to `reset --soft` and redo, or live with it.
