import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // host: true binds the dev server to 0.0.0.0 so a phone on the same
  // Wi-Fi can reach it via the PC's LAN IP. Vite prints both Local and
  // Network URLs at startup. Override with `npm run dev -- --host false`
  // if you ever want localhost-only.
  server: { host: true },
})
