import { defineConfig } from 'vitest/config'

// Separate from vite.config.js on purpose: the app's Vite config carries
// dev-server options (host/allowedHosts) that are irrelevant to tests, and
// keeping the test config standalone means `vitest` never pulls the React /
// Tailwind plugins it doesn't need. The current suite targets pure, React-free
// modules under src/lib, so the default 'node' environment is enough — no jsdom.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
