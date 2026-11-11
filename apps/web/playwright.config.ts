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
// These create and delete workspaces on the dev user's account, and note-workspace asserts the
// editor shows no workspace select while only one exists, so no other spec may run alongside them.
// Playwright has no per-project worker limit, so each gets its own project, chained in order.
const WORKSPACE_SPECS = [
  'workspaces.e2e.ts',
  'all-workspaces.e2e.ts',
  'note-workspace.e2e.ts',
  'today-badge.e2e.ts',
];
const SETTINGS_SPECS = ['form-settings.e2e.ts', 'quick-actions.e2e.ts', 'category-pin.e2e.ts'];

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: webUrl, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome'],
      testIgnore: [...SETTINGS_SPECS, ...WORKSPACE_SPECS],
    },
    ...WORKSPACE_SPECS.map((spec, i) => ({
      name: `workspaces-${i + 1}`,
      use: devices['Desktop Chrome'],
      testMatch: spec,
      dependencies: [i === 0 ? 'chromium' : `workspaces-${i}`],
    })),
    // These change, or compare a snapshot of, the dev user's settings and category strip that every
    // other spec shares (hidden fields, quick actions, pins), so they run after the rest finishes.
    {
      name: 'settings',
      use: devices['Desktop Chrome'],
      testMatch: SETTINGS_SPECS,
      dependencies: [`workspaces-${WORKSPACE_SPECS.length}`],
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @notes/api dev',
      url: `${apiUrl}/health`,
      // Every spec shares the one dev user, so the per-user LLM limit (30/min) would trip.
      env: { PORT: apiPort, WEB_ORIGIN: webUrl, AI_FAKE: '1', RATE_LIMIT: 'off' },
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
