// Web Share Target launch (`/?title=&text=&url=`, declared in vite.config.ts).
import { ROUTES } from '../shell/routes';

const SHARE_PARAMS = ['title', 'text', 'url'] as const;

/**
 * The note body for a Web Share Target launch: `title`, `text` and `url` joined by newlines,
 * skipping empty fields and repeats. `undefined` when nothing was shared.
 */
export function parseSharedNote(search: string): string | undefined {
  const params = new URLSearchParams(search);
  const parts: string[] = [];
  for (const name of SHARE_PARAMS) {
    const value = params.get(name)?.trim() ?? '';
    if (!value) continue;
    // Apps often repeat the link in both `text` and `url`; other fields only dedupe on equality.
    const repeated = parts.some((part) => (name === 'url' ? part.includes(value) : part === value));
    if (!repeated) parts.push(value);
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

// Read once at load, before anything can rewrite the URL.
let shared = parseSharedNote(window.location.search);
if (shared !== undefined) {
  const params = new URLSearchParams(window.location.search);
  for (const name of SHARE_PARAMS) params.delete(name);
  const rest = params.toString();
  // Rewrite to the compose page: back from it returns to the sharing app.
  window.history.replaceState(null, '', ROUTES.compose + (rest ? `?${rest}` : ''));
}

/** The text shared into the app at launch (a pure read, safe under StrictMode double-init). */
export function peekSharedNote(): string | undefined {
  return shared;
}

/** Forget the shared text once the editor has taken it. */
export function clearSharedNote(): void {
  shared = undefined;
}
