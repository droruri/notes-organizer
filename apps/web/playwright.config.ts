import { defineConfig, devices } from '@playwright/test';

// E2E against the local stack: `pnpm db:start` first; the API and web servers are started here.
// Run: pnpm --filter @notes/web e2e
// E2E_API_PORT / E2E_WEB_PORT (defaults 3000 / 5173) let a run coexist with another worktree.

// The local-stack defaults (Supabase URL, anon key, AI_FAKE, …). CI has no `.env`, and Vite reads
// only `.env*` files, so load them here; variables already set win.
process.loadEnvFile(new URL('../../.env.example', import.meta.url));

const apiPort = process.env.E2E_API_PORT || '3000';
const webPort = process.env.E2E_WEB_PORT || '5173';
const apiUrl = `http://localhost:${apiPort}`;
const webUrl = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: webUrl, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: [
    {
      command: 'pnpm --filter @notes/api dev',
      url: `${apiUrl}/health`,
      env: { PORT: apiPort, WEB_ORIGIN: webUrl },
      // API logs in the test output, so a failed request shows why.
      stdout: 'pipe',
      reuseExistingServer: false,
    },
    {
      // Dev server: the dev sign-in button exists only when import.meta.env.DEV.
      command: `VITE_API_URL=${apiUrl} pnpm exec vp dev --port ${webPort} --strictPort`,
      url: webUrl,
      reuseExistingServer: false,
    },
  ],
});
