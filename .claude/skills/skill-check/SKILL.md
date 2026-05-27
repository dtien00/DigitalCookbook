---
name: skill-check
description: Audit recent session transcripts for repeated tasks that aren't already covered by an existing skill, and propose new skills the user could codify. Use whenever the user says "skill check", "find skill candidates", "what should be a skill", "audit my sessions for patterns", "any repeated workflows worth codifying", "am I missing a skill", or otherwise wants a meta-review of their habits to surface skill-able patterns. Also trigger when the user wraps a stage and asks "what did I do twice this stage" — friction patterns surfaced post-stage are prime skill material.
---

# Skill check

This project's session transcripts live as JSONL files under `$env:USERPROFILE\.claude\projects\C--Users-dtien-Professional-Industry-Portfolio-Materials-DigitalCookbook\` — one file per session, one JSON event per line. Existing project skills live under `.claude/skills/<name>/SKILL.md`. Built-in Claude Code skills (verify, code-review, security-review, run, schedule, loop, init, review) are also available in every session.

Your job is to mine the transcripts for *repeated* user requests that no existing skill (project or built-in) already covers, then propose skill candidates the user can accept or reject. A pattern is worth skilling when the same shape of request shows up across **3 or more distinct sessions** AND the workflow is more than a single tool call. One-offs aren't skills; two-times-is-coincidence, three-times-is-a-pattern.

## What to do

1. **Enumerate existing coverage.** List `.claude/skills/` so you know what's already codified at the project level. Also recall the built-in skills available in every session (verify, code-review, security-review, run, schedule, loop, init, review). A candidate must be distinct from both sets.

2. **Pull session opening messages.** The first user message of each session is the cleanest signal of what the user wanted. PowerShell:

   ```powershell
   $proj = "$env:USERPROFILE\.claude\projects\C--Users-dtien-Professional-Industry-Portfolio-Materials-DigitalCookbook"
   Get-ChildItem $proj -Filter *.jsonl |
     Sort-Object LastWriteTime -Descending |
     Select-Object -First 30 |
     ForEach-Object {
       $line = Get-Content $_.FullName -TotalCount 80 |
         Where-Object { $_ -match '"type":"user"' -and $_ -notmatch '"tool_use_id"' } |
         Select-Object -First 1
       [PSCustomObject]@{
         Session = $_.BaseName.Substring(0,8)
         Date    = $_.LastWriteTime.ToString('MM-dd')
         First   = if ($line) { ($line | ConvertFrom-Json).message.content -replace '\s+',' ' } else { '<none>' }
       }
     } | Format-Table -AutoSize -Wrap
   ```

   Cap at the last ~30 sessions. Older sessions reflect older habits and an older project shape — including them dilutes the signal. If the user asks for "all" or "the full history", expand explicitly.

3. **Cluster by intent, not by wording.** Group requests that share a goal even when the phrasing differs — "retint Profile", "swap indigo for rust on MyBookmarks", "migrate Auth to the new palette" all collapse into one cluster (which is already `palette-retint`). Look for clusters with **3+ members across distinct sessions**.

4. **Filter out covered patterns.** For each cluster:
   - Does an existing project skill match? Open its SKILL.md description and check.
   - Does a built-in skill match? (e.g., "verify this fix works" → `verify`; "review my branch" → `code-review`; "scan for secrets" → `security-review` or this project's `review-security`.)
   - If covered, drop the cluster and note the mapping in the report.

5. **Filter out skill anti-patterns.** Drop a cluster if:
   - It's a single ROADMAP stage of work, not a recurring workflow (use the roadmap, not a skill).
   - It's a question rather than a task ("how does X work?" — that's conversation).
   - The workflow is one tool call (grep, read a file) — not enough surface area to codify.
   - It's pure creative judgment that varies every time (UI design from scratch, copywriting).
   - The 3+ matches all happened in the same week and are likely one initiative that's now done.

6. **For each surviving cluster, draft a proposal.** Keep each under ~6 lines:

   ```
   **Candidate: <kebab-case-name>**
   Seen in N sessions (<date>, <date>, <date>...)
   Trigger phrases: "<phrase 1>", "<phrase 2>", "<phrase 3>"
   What it'd do: <one sentence describing the codified workflow>
   Why codify: <friction observed — re-explanation, drift, missed steps>
   Not covered by: <which existing skill is closest and why it doesn't fit>
   ```

7. **End with a menu.** Rank candidates by strength (most-repeated first), then ask which to scaffold. **Do not write any SKILL.md files until the user picks one.** When they pick, draft following the project's conventions: frontmatter (name + description with rich trigger phrases) → intro paragraph → `## What to do` numbered steps → `## Output shape` → `## What NOT to do`.

## Output shape

```
Scanned <N> sessions (<date range>). Existing project skills: <list>.

**Strong candidates (3+ sessions, not covered):**
1. **<name>** — <one-line summary>. Seen <N>× across <dates>.
2. **<name>** — <one-line summary>. Seen <N>× across <dates>.

**Weak candidates (2 sessions, watch list):**
- <name> — <one-line summary>.

**Already covered (no action needed):**
- "<pattern>" → existing skill `<name>`.
- "<pattern>" → built-in `<name>`.

Want me to scaffold any of the strong candidates? Pick by number or name.
```

If nothing crosses the threshold:

```
Scanned <N> sessions. No repeated patterns above the 3-session threshold that aren't already covered. Closest near-miss: <pattern> at 2 sessions — worth watching, not skilling yet.
```

## What NOT to do

- **Don't auto-create SKILL.md files.** This skill ends at "here are candidates" — the user picks, then you draft one. Auto-creating clutters `.claude/skills/` with proposals nobody endorsed.
- **Don't conflate session count with task count.** One long session may contain a single request or ten; ten short sessions may all be one initiative. Verify each cluster spans distinct sessions on distinct days before counting it as a pattern.
- **Don't propose skills that duplicate built-ins.** `verify`, `code-review`, `security-review`, `run`, `schedule`, `loop`, `init`, `review` already cover broad workflows. If a cluster maps cleanly to one of those, the answer is "use the built-in", not "wrap it in a project skill".
- **Don't propose skills for one-stage-only work.** Stage-specific builds (servings multiplier, share button) belong in ROADMAP and get done once. A skill is for *workflows that recur across stages*.
- **Don't read full transcripts when the opening message is enough.** Session files run into megabytes. The first user message carries the intent; only crack the rest open if a candidate is marginal and you want to confirm the work actually happened that way.
- **Don't default to scanning more than ~30 sessions.** Older transcripts reflect older habits. If the user wants a deeper audit, they'll ask — surface the option, don't burn context on it by default.
- **Don't mine for "things Claude did wrong".** The point is to spot user-side recurring *requests*, not to grade past performance. A pattern where the user repeatedly had to correct an approach is feedback memory, not skill material.
