---
name: restart-dev
description: Find and kill stale Vite dev-server processes before starting a fresh one. Use whenever the user says "restart the dev server", "kill the dev server", "stop localhost", "free up port 5173", "I keep starting new localhosts", "what's running on 5174", or otherwise wants existing `npm run dev` instances cleaned up. Also trigger before launching `npm run dev` in a session where prior dev-server activity is plausible — the user has explicitly flagged this as a recurring footgun.
---

# Restart dev

The user runs `npm run dev` (Vite) frequently across sessions and worktrees. Vite's default port is 5173, but on conflict it silently bumps to 5174, 5175, … and starts there — so dead-or-detached instances pile up across ports without obvious signal. The user has flagged this as a recurring source of confusion: "I usually miss existing versions and start new localhosts."

Your job is to surface every dev-server-shaped listener in the standard Vite port range, identify which are stale, kill them, and (optionally) start a single fresh `npm run dev`.

## What to do

1. **Scan the Vite port range.** Vite picks the next free port starting at 5173, so check 5173–5183 (a generous range — instances rarely pile higher than 5–6 deep). PowerShell:

   ```powershell
   $ports = 5173..5183
   $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
     Where-Object { $_.LocalPort -in $ports } |
     ForEach-Object {
       $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
       [PSCustomObject]@{
         Port = $_.LocalPort
         PID  = $_.OwningProcess
         Name = if ($proc) { $proc.ProcessName } else { '<gone>' }
         Path = if ($proc) { $proc.Path } else { $null }
       }
     }
   $listeners | Format-Table -AutoSize
   ```

   If nothing is listening, say so and offer to start `npm run dev` directly — no kill step needed.

2. **Identify Vite vs. unrelated.** A Vite dev server shows up as a `node` process. If something non-node is listening on 5173 (unlikely but possible — another tool that uses that port), flag it for the user before killing. Don't auto-kill processes you can't identify as Vite/node.

3. **Show the user before killing.** Output shape:

   ```
   **Found N dev-server processes:**
   - Port 5173 — node (PID 12345)
   - Port 5174 — node (PID 23456)
   - Port 5175 — node (PID 34567)

   Kill all and start a fresh `npm run dev`?
   ```

   Wait for confirmation. The user's general pattern is "show me, then act" — don't kill processes unannounced. Exception: if the user explicitly said "kill them all" or "force restart", skip the confirmation.

4. **Kill on confirmation.** PowerShell:

   ```powershell
   $listeners | ForEach-Object { Stop-Process -Id $_.PID -Force -ErrorAction SilentlyContinue }
   ```

   Then re-scan once to confirm the ports are free — sometimes a node process spawns a child that holds the port for a beat. If anything is still listening after 2 seconds, surface that instead of pretending it worked.

5. **Start fresh (optional).** If the user asked to restart (not just kill), launch `npm run dev` in the background via Bash with `run_in_background: true`. Report the new port (it'll usually be 5173 now that everything's been freed). Don't start a fresh dev server unless the user asked for it — sometimes they just want to stop the old ones to free RAM.

## Output shape

**When nothing is running:**
```
No Vite dev servers listening on 5173–5183. Start a fresh one with `npm run dev`?
```

**When stale instances exist:**
```
**Listening on Vite ports:**
- 5173 — node PID 12345
- 5174 — node PID 23456

Kill both and restart? (Or just kill — say "kill only" if you don't want a fresh server.)
```

**After action:**
```
Killed PIDs 12345, 23456. Ports 5173–5183 are clear.
<if restarting: > Started fresh `npm run dev` in background — should come up on 5173.
```

## What NOT to do

- **Don't `Stop-Process -Name node -Force` to "just kill all node processes".** That nukes anything else the user is running — the seed script, an unrelated CLI tool, a worktree's separate dev server they intend to keep. Always kill by PID, scoped to the ports you scanned.
- **Don't assume the highest port is the live one.** Vite increments on conflict, but a detached old server can be on 5173 while the live tab points at 5176. The fact that *something* is bound to 5173 doesn't tell you which instance the user is actually using. Show all of them and let the user (or default to "kill all and restart fresh").
- **Don't start a new `npm run dev` while old instances are still alive.** That's the whole problem this skill exists to solve. Always kill first, then start.
- **Don't run this skill from a worktree expecting it to find only that worktree's server.** A worktree's `npm run dev` and the main repo's `npm run dev` both bind ports on the same machine — the skill operates machine-wide, not worktree-scoped. That's the right behavior (the user wants *all* stale instances gone), but be clear in the output that you're listing machine-wide listeners.
- **Don't try this on a non-Windows shell.** The PowerShell snippet is Windows-specific (this project's user is on Windows 10). If invoked from a Bash context, fall back to `lsof -i:5173-5183` / `kill -9` but flag that the user is on Windows so this is the unexpected path.
