# Maintenance Mode

Maintenance mode replaces the entire app with a simple holding page — no Supabase calls fire, no data is read or written. Implemented via a `VITE_MAINTENANCE` environment variable checked in [`src/main.jsx`](src/main.jsx) before `<App />` mounts.

---

## Enabling on Vercel (Production)

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add a new variable:
   - **Name:** `VITE_MAINTENANCE`
   - **Value:** `true`
   - **Environment:** check **Production** only
3. Save, then redeploy: Vercel dashboard → **Deployments** → select the latest → **Redeploy**

The live site will show the maintenance holding page until you disable it.

## Disabling

Delete the `VITE_MAINTENANCE` variable (or set its value to anything other than `"true"`) and redeploy.

---

## Testing locally

Add to `.env.local`:

```
VITE_MAINTENANCE=true
```

Restart the dev server (`npm run dev`) — the maintenance page will render at `localhost:5175`. Remove the line and restart to restore the normal app.

---

## How it works

[`src/main.jsx`](src/main.jsx) reads `import.meta.env.VITE_MAINTENANCE` at module load time. If it equals `"true"`, `<MaintenancePage />` is rendered instead of `<App />`. Because the check happens before `<App />` mounts, no Supabase client calls are made and no auth state is initialized.

The holding page ([`src/components/MaintenancePage.jsx`](src/components/MaintenancePage.jsx)) is a static screen using the rustic-paper palette — no external dependencies.
