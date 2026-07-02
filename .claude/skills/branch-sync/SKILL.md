---
name: branch-sync
description: Diagnose a branch's true state (vs its remote, vs main, vs its PR) and run the safe sync operation — refresh from main, resolve a diverged/remote-ahead push rejection, verify a merge, or restart a branch from fresh main. Use whenever the user asks "is this branch merged", "can I switch to main now", "repull this branch from main", "continue this branch from current main", "sync ui-addons with main", "remote is ahead of local", "my push was rejected", or "clean up merged branches". Also trigger when a push fails with non-fast-forward errors mid-session, or when the user wants to start new work right after a PR merged — the first step is re-syncing local main. Distinct from `stage-wrap` (which lands a finished stage on the happy path) — this skill handles the in-between states: stale, diverged, reused, and "am I actually merged?".
---

# Branch sync

This repo's branch topology is unusual in two ways that make generic git advice wrong here:

1. **PRs land as merge commits, and branches are reused.** `ui-addons` produced PR #76 *and* PR #77 without being deleted in between. "This branch was merged" does not mean "this branch is done" — it may already be carrying commits for its next PR.
2. **Branches are refreshed by merging main in, not by rebasing.** History shows `Merge branch 'main' into cooking-mode-timer` — the house style. Pushed branches never get rebased, so force-push is almost never the answer.

The three situations this skill exists for, each seen in a real session: "determine that stage-8-share-button has been pushed and merged, and switch to main" (merge check), "have ui-addons repulled from the current main" (refresh), and "I fixed the lint error but the remote is ahead of local when I repush" (divergence). All three start the same way — establish the branch's true state before touching anything — and end with a small set of safe commands.

## What to do

1. **Fetch first, always.** `git fetch origin --prune`. Every state claim in this skill is made against fresh remote refs. Answering "is it merged?" from stale refs is the root failure mode.

2. **Take the state snapshot.** Run in parallel:
   - `git status` and `git branch --show-current` — working tree + which branch.
   - `git log --oneline origin/main..HEAD` — commits this branch has that main lacks (empty = fully merged content-wise).
   - `git log --oneline HEAD..origin/main` — how far behind main.
   - `git log --oneline "@{u}"..HEAD` and `git log --oneline HEAD.."@{u}"` — divergence vs upstream. (Branch may have no upstream yet — that itself is a finding.)
   - `gh pr list --head <branch> --state all --limit 3 --json number,state,mergedAt,url` — the authoritative merge record. Never assert a PR number from memory ([[feedback_pr_numbering_continuity]]).

3. **Classify into one of four situations** and name it to the user:
   - **Merged & done** — PR merged, `origin/main..HEAD` empty, no local-only work. Safe to `git checkout main && git pull`.
   - **Needs refresh** — branch is behind main (user says "repull from main", "continue from current main"). House style: `git merge origin/main` on the branch, resolve conflicts, push. Do **not** rebase a pushed branch — that's what forces force-pushes.
   - **Diverged from upstream** — remote has commits local doesn't (the "remote is ahead" push rejection). Inspect them first: `git log HEAD.."@{u}" --stat`. If they're recognizable (a web-UI edit, a CI fix pushed elsewhere): `git pull --rebase` when local also has unpushed commits, plain `git pull` (fast-forward) when it doesn't, then push. If the remote commits are unrecognized, stop and show them to the user.
   - **Fresh start from main** — user wants the branch re-begun from current main and the snapshot shows nothing unmerged: `git checkout main && git pull && git checkout -B <branch> && git push --force-with-lease` (the `-B` and force-with-lease are the destructive moment — confirm first, and only if `origin/main..<branch>` was empty).

4. **Show the snapshot and the plan before acting.** Read-only diagnosis, fast-forwards, and merge-main-in can proceed directly. Anything that discards or rewrites — `checkout -B`, branch deletion, any force-push — waits for explicit confirmation.

5. **Execute, then verify.** After the operation: `git status` (expect "up to date with origin/..."), `git log --oneline -3`, and re-check ahead/behind counts. A sync isn't done until the push succeeded and the working tree is clean.

6. **Clean up only what's actually dead.** Stage branches (`stage-8-share-button`) are one-PR-and-done — offer `git branch -d` after their merge is verified. Long-lived branches (`ui-addons`) get merged repeatedly and keep living — never suggest deleting them just because their latest PR merged.

## Output shape

```
Branch: <name>
vs origin/main: ahead <n> / behind <m>
vs upstream:    ahead <n> / behind <m>   (or: no upstream set)
PR: #<n> <OPEN|MERGED 2026-06-26|none>
Working tree: clean | <n> files modified

Situation: merged-and-done | needs-refresh | diverged | fresh-start
Plan:
  1. <command> — <why>
  2. ...
```

After execution:

```
Done: <what ran>
Branch now: up to date with origin/<branch>, ahead of main by <n> (expected: the next PR's commits) | even with main
Cleanup: deleted <stage branch> | kept <long-lived branch>
```

## What NOT to do

- **Don't assert branch state without fetching this session.** "It's merged" from stale refs is how the 06-26 confusion happened. Fetch, then speak.
- **Don't treat "PR merged" as "branch finished."** Reused branches (`ui-addons`) may already carry the next PR's commits. Merged-ness is a property of commits (`origin/main..HEAD` empty), not of the branch name.
- **Don't rebase pushed branches to refresh them.** House style is merge-main-in (see `da5f500`). Rebase creates the exact force-push situation this skill exists to avoid. `git pull --rebase` on your *own* divergence is the one exception.
- **Don't resolve a rejected push with `--force`.** A rejection means the remote knows something local doesn't — inspect `HEAD..@{u}` first. If a rewrite is truly intended, `--force-with-lease` only, after confirmation, and never on main.
- **Don't run `checkout -B` or delete a branch while `origin/main..<branch>` is non-empty** without the user explicitly accepting the loss. Empty output from that command is the license; anything else is unmerged work.
- **Don't invent PR numbers or merge dates.** `gh` is the source of truth ([[feedback_pr_numbering_continuity]]).
- **Don't fix divergence with a fresh clone or a reset to origin.** The slow path (inspect, pull, push) preserves work; the fast path deletes it.
