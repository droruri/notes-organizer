import { z } from 'zod';

/** What `GET /links/preview` returns. `paragraphs` only with `reader=1`. */
export const LinkPreview = z.union([
  z.object({ kind: z.literal('video'), embedUrl: z.string() }),
  z.object({
    kind: z.literal('article'),
    title: z.string().nullable(),
    description: z.string().nullable(),
    image: z.string().nullable(),
    siteName: z.string().nullable(),
    paragraphs: z.array(z.string()).optional(),
  }),
]);
export type LinkPreview = z.infer<typeof LinkPreview>;

/** What Claude is given for one link. `ok: false` = the link could not be read. */
export const LinkContext = z.object({
  url: z.string(),
  ok: z.boolean(),
  title: z.string().optional(),
  description: z.string().optional(),
  siteName: z.string().optional(),
  text: z.string().optional(),
});
export type LinkContext = z.infer<typeof LinkContext>;

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING = /[.,;:!?)\]}»”’]+$/;

/** The distinct http(s) URLs in a text, in order of appearance, trailing punctuation removed. */
export function extractLinks(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(URL_PATTERN)) {
    const url = match[0].replace(TRAILING, '');
    if (!URL.canParse(url)) continue;
    if (!found.includes(url)) found.push(url);
  }
  return found;
}

const YOUTUBE_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);

/** The video id of a YouTube watch / youtu.be / shorts / embed URL. */
export function youtubeId(url: string): string | null {
  if (!URL.canParse(url)) return null;
  const u = new URL(url);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  let id: string | null | undefined = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (YOUTUBE_HOSTS.has(host)) {
    const [, first, second] = u.pathname.split('/');
    if (first === 'watch') id = u.searchParams.get('v');
    else if (first === 'shorts' || first === 'embed') id = second;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** The numeric id of a vimeo.com/<id> or player.vimeo.com/video/<id> URL. */
export function vimeoId(url: string): string | null {
  if (!URL.canParse(url)) return null;
  const u = new URL(url);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    const id = parts[parts.length - 1];
    return id && /^\d+$/.test(id) ? id : null;
  }
  if (host === 'player.vimeo.com' && parts[0] === 'video') {
    const id = parts[1];
    return id && /^\d+$/.test(id) ? id : null;
  }
  return null;
}

/** The iframe `src` for a YouTube or Vimeo URL; null for anything else. */
export function videoEmbed(url: string): string | null {
  const yt = youtubeId(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}`;
  const vimeo = vimeoId(url);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo}`;
  return null;
}
