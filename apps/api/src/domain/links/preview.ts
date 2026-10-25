import { Readability } from '@mozilla/readability';
import { videoEmbed, youtubeId, vimeoId, type LinkContext, type LinkPreview } from '@notes/shared';
import { JSDOM } from 'jsdom';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';

// The one safe fetch path for links: `GET /links/preview` and Claude's link reading both use it.
// Only public http(s) hosts, checked on every redirect hop; bounded time and size; cached.

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5_000;
const READER_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 200;
const TEXT_FOR_CLAUDE = 4_000;
const MAX_PARAGRAPHS = 300;
const BLOCKED_STATUS = new Set([403, 429, 503]);
const BOT_UA = 'Mozilla/5.0 (compatible; NotesOrganizer/1.0; link preview)';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const LinkEnv = z.object({
  JINA_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined)),
});

export type LinkReaderOptions = {
  fetch?: typeof fetch;
  /** Used only for Jina Reader, so tests never reach the real service. */
  readerFetch?: typeof fetch;
  /** All addresses a host resolves to. */
  lookup?: (host: string) => Promise<string[]>;
  jinaApiKey?: string | undefined;
  /** Per-note budgets: 6 s, 15 s once a link falls back to the reader. */
  budgetMs?: number;
  fallbackBudgetMs?: number;
  now?: () => number;
};

export type LinkReader = {
  /** Null = unreachable. */
  preview(url: string, withReader: boolean): Promise<LinkPreview | null>;
  read(url: string): Promise<LinkContext>;
  /** Reads `urls` in parallel under one per-note time budget. Same order as `urls`. */
  readAll(urls: string[]): Promise<LinkContext[]>;
};

type Ctx = { signal: AbortSignal; onFallback: () => void };
type Fetched = { status: number; url: string; type: string; text: string };
type Parsed = {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  paragraphs: string[];
};

class UnsafeUrl extends Error {}

export function isPublicAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (kind === 6) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped?.[1]) return isPublicAddress(mapped[1]);
    if (lower === '::' || lower === '::1') return false;
    const first = Number.parseInt(lower.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7
    if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10
    if ((first & 0xff00) === 0xff00) return false; // multicast
    return true;
  }
  return false;
}

const defaultLookup = async (host: string): Promise<string[]> =>
  (await dnsLookup(host, { all: true })).map((a) => a.address);

function decodeEntities(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function metaOf(doc: Document, ...names: string[]): string | null {
  for (const name of names) {
    for (const el of doc.querySelectorAll('meta')) {
      const key = el.getAttribute('property') ?? el.getAttribute('name');
      if (key?.toLowerCase() === name) {
        const content = decodeEntities(el.getAttribute('content') ?? '');
        if (content !== '') return content;
      }
    }
  }
  return null;
}

function absolute(href: string | null, base: string): string | null {
  if (href === null) return null;
  try {
    const u = new URL(href, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export function parsePage(html: string, pageUrl: string): Parsed {
  const dom = new JSDOM(html, { url: pageUrl });
  const doc = dom.window.document;
  const titleTag = decodeEntities(doc.querySelector('title')?.textContent ?? '');
  const title = metaOf(doc, 'og:title', 'twitter:title') ?? (titleTag === '' ? null : titleTag);
  const description = metaOf(doc, 'og:description', 'twitter:description', 'description');
  const image = absolute(metaOf(doc, 'og:image', 'twitter:image'), pageUrl);
  const siteName = metaOf(doc, 'og:site_name');
  let paragraphs: string[] = [];
  try {
    // Readability mutates the document it is given, so it gets its own parse.
    const article = new Readability(new JSDOM(html, { url: pageUrl }).window.document).parse();
    if (article?.content) {
      const body = new JSDOM(article.content).window.document;
      paragraphs = [...body.querySelectorAll('p, li, blockquote, h1, h2, h3, h4')]
        .map((el) => decodeEntities(el.textContent ?? ''))
        .filter((p) => p !== '');
      if (paragraphs.length === 0) {
        paragraphs = (article.textContent ?? '')
          .split(/\n+/)
          .map(decodeEntities)
          .filter((p) => p !== '');
      }
    }
  } catch {
    // Readability failed on odd markup: the meta fields still make a card.
  }
  return { title, description, image, siteName, paragraphs: paragraphs.slice(0, MAX_PARAGRAPHS) };
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      chunks.push(value.subarray(0, value.length - (total - MAX_BYTES)));
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const OEmbed = z.object({
  title: z.string().optional(),
  author_name: z.string().optional(),
  description: z.string().optional(),
});

export function createLinkReader(options: LinkReaderOptions = {}): LinkReader {
  const doFetch = options.fetch ?? fetch;
  const readerFetch = options.readerFetch ?? fetch;
  const resolve = options.lookup ?? defaultLookup;
  const now = options.now ?? Date.now;
  const budgetMs = options.budgetMs ?? 6_000;
  const fallbackBudgetMs = options.fallbackBudgetMs ?? 15_000;
  const jinaApiKey = options.jinaApiKey?.trim() ? options.jinaApiKey.trim() : undefined;
  const cache = new Map<string, { at: number; value: LinkContext & { parsed?: Parsed } }>();

  const cacheGet = (key: string) => {
    const hit = cache.get(key);
    if (!hit) return undefined;
    if (now() - hit.at > CACHE_TTL_MS) {
      cache.delete(key);
      return undefined;
    }
    cache.delete(key); // refresh recency
    cache.set(key, hit);
    return hit.value;
  };
  const cacheSet = (key: string, value: LinkContext & { parsed?: Parsed }) => {
    cache.delete(key);
    cache.set(key, { at: now(), value });
    while (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  };

  async function assertPublic(raw: string): Promise<URL> {
    if (!URL.canParse(raw)) throw new UnsafeUrl('bad url');
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UnsafeUrl('bad scheme');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [host] : await resolve(host).catch(() => []);
    if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
      throw new UnsafeUrl('not a public host');
    }
    return url;
  }

  /** One GET with manual redirects; every hop is checked. Throws UnsafeUrl or a network error. */
  async function get(
    start: string,
    ua: string,
    ctx: Ctx,
    accept = 'text/html,*/*',
  ): Promise<Fetched> {
    let current = start;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = await assertPublic(current);
      const res = await doFetch(url.href, {
        redirect: 'manual',
        headers: { 'user-agent': ua, accept },
        signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => undefined);
        current = new URL(location, url).href;
        continue;
      }
      return {
        status: res.status,
        url: url.href,
        type: res.headers.get('content-type') ?? '',
        text: await readCapped(res),
      };
    }
    throw new UnsafeUrl('too many redirects');
  }

  async function getOrNull(url: string, ua: string, ctx: Ctx, accept?: string) {
    try {
      return await get(url, ua, ctx, accept);
    } catch (err) {
      if (err instanceof UnsafeUrl) throw err;
      return null; // network error: eligible for the retry / reader
    }
  }

  async function viaReader(url: string, ctx: Ctx): Promise<Fetched | null> {
    if (!jinaApiKey) return null;
    try {
      await assertPublic(url);
      ctx.onFallback();
      const res = await readerFetch(`https://r.jina.ai/${url}`, {
        headers: { authorization: `Bearer ${jinaApiKey}`, 'x-return-format': 'html' },
        signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(READER_TIMEOUT_MS)]),
      });
      const text = await readCapped(res);
      return { status: res.status, url, type: 'text/html', text };
    } catch {
      return null;
    }
  }

  /** The page HTML, retried once with a browser UA when blocked, then via Jina Reader. */
  async function fetchPage(url: string, ctx: Ctx): Promise<Fetched | null> {
    try {
      let res = await getOrNull(url, BOT_UA, ctx);
      if (res === null || BLOCKED_STATUS.has(res.status)) {
        res = await getOrNull(url, BROWSER_UA, ctx);
      }
      if (res === null || BLOCKED_STATUS.has(res.status)) res = await viaReader(url, ctx);
      if (res === null || res.status < 200 || res.status >= 300) return null;
      if (!/html|xml|text\/plain/i.test(res.type)) return null;
      return res;
    } catch {
      return null; // unsafe address or hop limit
    }
  }

  async function oembed(endpoint: string, ctx: Ctx): Promise<z.infer<typeof OEmbed> | null> {
    const res = await getOrNull(endpoint, BOT_UA, ctx, 'application/json').catch(() => null);
    if (!res || res.status !== 200) return null;
    try {
      const parsed = OEmbed.safeParse(JSON.parse(res.text));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async function readUncached(url: string, ctx: Ctx): Promise<LinkContext & { parsed?: Parsed }> {
    const failed: LinkContext = { url, ok: false };
    if (youtubeId(url)) {
      const meta = await oembed(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        ctx,
      );
      if (!meta?.title) return failed;
      const page = await fetchPage(url, ctx);
      const description = page ? parsePage(page.text, page.url).description : null;
      return {
        url,
        ok: true,
        title: meta.title,
        ...(meta.author_name ? { siteName: meta.author_name } : {}),
        ...(description ? { description } : {}),
      };
    }
    if (vimeoId(url)) {
      const meta = await oembed(
        `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
        ctx,
      );
      if (!meta?.title) return failed;
      return {
        url,
        ok: true,
        title: meta.title,
        ...(meta.author_name ? { siteName: meta.author_name } : {}),
        ...(meta.description ? { description: meta.description } : {}),
      };
    }
    const page = await fetchPage(url, ctx);
    if (!page) return failed;
    const parsed = parsePage(page.text, page.url);
    const text = parsed.paragraphs.join('\n').slice(0, TEXT_FOR_CLAUDE);
    if (parsed.title === null && parsed.description === null && text === '') return failed;
    return {
      url,
      ok: true,
      ...(parsed.title ? { title: parsed.title } : {}),
      ...(parsed.description ? { description: parsed.description } : {}),
      ...(parsed.siteName ? { siteName: parsed.siteName } : {}),
      ...(text ? { text } : {}),
      parsed,
    };
  }

  async function readWith(url: string, ctx: Ctx): Promise<LinkContext & { parsed?: Parsed }> {
    const hit = cacheGet(url);
    if (hit) return hit;
    const value = await readUncached(url, ctx);
    if (value.ok) cacheSet(url, value);
    return value;
  }

  const strip = ({ parsed: _parsed, ...context }: LinkContext & { parsed?: Parsed }): LinkContext =>
    context;
  const standalone = (): { ctx: Ctx; done: () => void } => {
    const controller = new AbortController();
    return {
      ctx: { signal: controller.signal, onFallback: () => undefined },
      done: () => controller.abort(),
    };
  };

  return {
    async preview(url, withReader) {
      const embedUrl = videoEmbed(url);
      if (embedUrl) return { kind: 'video', embedUrl };
      const { ctx, done } = standalone();
      try {
        const value = await readWith(url, ctx);
        if (!value.ok || !value.parsed) return null;
        const { title, description, image, siteName, paragraphs } = value.parsed;
        return {
          kind: 'article',
          title,
          description,
          image,
          siteName,
          ...(withReader ? { paragraphs } : {}),
        };
      } finally {
        done();
      }
    },

    async read(url) {
      const { ctx, done } = standalone();
      try {
        return strip(await readWith(url, ctx));
      } finally {
        done();
      }
    },

    async readAll(urls) {
      const controller = new AbortController();
      const start = now();
      let limit = budgetMs;
      const ctx: Ctx = {
        signal: controller.signal,
        onFallback: () => {
          limit = fallbackBudgetMs;
        },
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<'expired'>((resolveExpired) => {
        const check = () => {
          const left = start + limit - now();
          if (left <= 0) resolveExpired('expired');
          else timer = setTimeout(check, Math.min(left, 250));
        };
        check();
      });
      try {
        return await Promise.all(
          urls.map(async (url): Promise<LinkContext> => {
            const result = await Promise.race([
              readWith(url, ctx).catch((): LinkContext => ({ url, ok: false })),
              expired,
            ]);
            return result === 'expired' ? { url, ok: false } : strip(result);
          }),
        );
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    },
  };
}
