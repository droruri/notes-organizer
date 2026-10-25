import { defineConfig, devices } from '@playwright/test';

// E2E against the local stack: `pnpm db:start` first; the API and web servers are started here.
// Run: pnpm --filter @notes/web e2e
// E2E_API_PORT / E2E_WEB_PORT (defaults 3000 / 5173) let a run coexist with another worktree.
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
      reuseExistingServer: false,
    },
    {
      command: `VITE_API_URL=${apiUrl} pnpm exec vite build && pnpm exec vite preview --port ${webPort} --strictPort`,
      url: webUrl,
      reuseExistingServer: false,
    },
  ],
});
