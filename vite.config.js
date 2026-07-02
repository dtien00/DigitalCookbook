import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // host: true binds the dev server to 0.0.0.0 so a phone on the same
  // Wi-Fi can reach it via the PC's LAN IP. Vite prints both Local and
  // Network URLs at startup. Override with `npm run dev -- --host false`
  // if you ever want localhost-only.
  // allowedHosts: true disables Vite's host-allowlist DNS-rebinding check
  // so LAN IPs and trycloudflare tunnels work in dev. Dev-only — no effect on build.
  server: { host: true, allowedHosts: true },
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks (FABLE.md §1.1): the framework changes far
        // less often than app code, so giving it its own chunk lets
        // returning visitors keep it cached across app deploys.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
