// Web Share Target launch (`/?title=&text=&url=`, declared in vite.config.ts).

const SHARE_PARAMS = ['title', 'text', 'url'] as const;

/**
 * The note body for a Web Share Target launch: `title`, `text` and `url` joined by newlines,
 * skipping empty fields and fields already contained in an earlier one (Android apps often
 * repeat the link in both `text` and `url`). `undefined` when nothing was shared.
 */
export function parseSharedNote(search: string): string | undefined {
  const params = new URLSearchParams(search);
  const parts: string[] = [];
  for (const name of SHARE_PARAMS) {
    const value = params.get(name)?.trim() ?? '';
    if (value && !parts.some((part) => part.includes(value))) parts.push(value);
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

// Read once at load, before anything can rewrite the URL.
let shared = parseSharedNote(window.location.search);
if (shared !== undefined) {
  const params = new URLSearchParams(window.location.search);
  for (const name of SHARE_PARAMS) params.delete(name);
  const rest = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
}

/** The text shared into the app at launch, handed out once. */
export function takeSharedNote(): string | undefined {
  const value = shared;
  shared = undefined;
  return value;
}
