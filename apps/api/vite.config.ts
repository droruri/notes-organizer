import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vite-plus';

// scripts/test-env.sh writes this worktree's own test database into .env.test. When it exists it
// wins over the shell's DATABASE_URL, so tests never run against another project's or worktree's
// database. Without it (CI), the environment's DATABASE_URL is used as before.
const envTest = new URL('../../.env.test', import.meta.url);

export default defineConfig({
  test: {
    env: existsSync(envTest) ? parseEnv(readFileSync(envTest, 'utf8')) : {},
  },
});
