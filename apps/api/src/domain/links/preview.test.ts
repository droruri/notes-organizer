import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../../ai/provider';
import { classify } from '../notes/classify';
import { linkContexts } from '../notes/service';
import { createLinkReader, isPublicAddress, LinkEnv, type LinkReaderOptions } from './preview';

// A local HTTP fixture server stands in for the internet. Hosts ending in `.test` "resolve" to
// a public address (fake lookup) and are served by the fixture (fetch rewrites the target);
// `private.test` resolves to 10.0.0.1. Nothing leaves the machine.

const ARTICLE = `<html><head><title>Fallback title</title>
<meta property="og:title" content="Fixture Article">
<meta property="og:description" content="About fixtures">
<meta property="og:image" content="/img.png">
<meta property="og:site_name" content="Fixtures Inc"></head>
<body><nav>menu</nav><article><h1>Fixture Article</h1>
<p>First paragraph of the article, long enough to be kept by the extractor.</p>
<p>Second paragraph of the article with more words to make it count as content.</p>
<p>Third paragraph, again plenty of words so that Readability sees real prose here.</p>
</article><script>alert(1)</script></body></html>`;

let server: Server;
let port = 0;
const hits: string[] = [];
const uaSeen: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    hits.push(`${req.headers.host}${path}`);
    uaSeen.push(String(req.headers['user-agent']));
    if (path === '/article') res.writeHead(200, { 'content-type': 'text/html' }).end(ARTICLE);
    else if (path === '/title-only') {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<title>Just a title</title>');
    } else if (path === '/to-private') {
      res.writeHead(302, { location: 'http://private.test/secret' }).end();
    } else if (path === '/loop') res.writeHead(302, { location: '/loop' }).end();
    else if (path === '/blocked') {
      const bot = String(req.headers['user-agent']).includes('Chrome');
      res.writeHead(bot ? 200 : 403, { 'content-type': 'text/html' }).end(bot ? ARTICLE : 'no');
    } else if (path === '/always-403') res.writeHead(403).end('no');
    else if (path === '/big') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<title>Big</title>${'x'.repeat(3 * 1024 * 1024)}`);
    } else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const lookup = async (host: string) =>
  host === 'private.test' ? ['10.0.0.1'] : host.endsWith('.test') ? ['93.184.216.34'] : [];

const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** Sends `*.test` requests to the fixture; anything else fails like a dead network. */
const fixtureFetch: typeof fetch = async (input, init) => {
  const url = new URL(urlOf(input));
  if (!url.hostname.endsWith('.test')) throw new Error('network is off in tests');
  return fetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, init);
};
const reader = (o: LinkReaderOptions = {}) =>
  createLinkReader({ fetch: fixtureFetch, lookup, ...o });
const at = (path: string) => `http://fixture.test${path}`;

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '::1',
    'fe80::1',
    'fd00::1',
    '::ffff:10.0.0.1',
    '100.64.0.1',
  ])('rejects %s', (a) => expect(isPublicAddress(a)).toBe(false));
  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])('accepts %s', (a) =>
    expect(isPublicAddress(a)).toBe(true),
  );
});

describe('preview', () => {
  it('parses OG meta and resolves relative images', async () => {
    const p = await reader().preview(at('/article'), false);
    expect(p).toEqual({
      kind: 'article',
      title: 'Fixture Article',
      description: 'About fixtures',
      image: 'http://fixture.test/img.png',
      siteName: 'Fixtures Inc',
    });
  });

  it('falls back to <title>', async () => {
    const p = await reader().preview(at('/title-only'), false);
    expect(p).toMatchObject({ kind: 'article', title: 'Just a title', description: null });
  });

  it('returns reader paragraphs as plain text only with reader=1', async () => {
    const p = await reader().preview(at('/article'), true);
    expect(p?.kind === 'article' ? p.paragraphs : undefined).toEqual([
      'First paragraph of the article, long enough to be kept by the extractor.',
      'Second paragraph of the article with more words to make it count as content.',
      'Third paragraph, again plenty of words so that Readability sees real prose here.',
    ]);
  });

  it('maps video URLs without fetching', async () => {
    const before = hits.length;
    expect(await reader().preview('https://youtu.be/dQw4w9WgXcQ', false)).toEqual({
      kind: 'video',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
    expect(hits.length).toBe(before);
  });

  it('rejects a redirect to a private address', async () => {
    const before = hits.length;
    expect(await reader().preview(at('/to-private'), false)).toBeNull();
    expect(hits.slice(before)).toEqual([
      `fixture.test/to-private`.replace('fixture.test', `127.0.0.1:${port}`),
    ]);
  });

  it('rejects private hosts, IP literals, other schemes and redirect loops', async () => {
    const r = reader();
    expect(await r.preview('http://private.test/x', false)).toBeNull();
    expect(await r.preview('http://127.0.0.1/x', false)).toBeNull();
    expect(await r.preview('http://[::1]/x', false)).toBeNull();
    expect(await r.preview('ftp://fixture.test/article', false)).toBeNull();
    expect(await r.preview(at('/loop'), false)).toBeNull();
  });

  it('caps the body at 2 MB but still parses what it has', async () => {
    const p = await reader().preview(at('/big'), false);
    expect(p).toMatchObject({ title: 'Big' });
  });

  it('caches for an hour', async () => {
    let t = 0;
    const r = reader({ now: () => t });
    const before = hits.length;
    await r.preview(at('/article'), false);
    await r.preview(at('/article'), true);
    expect(hits.length - before).toBe(1);
    t = 61 * 60 * 1000;
    await r.preview(at('/article'), false);
    expect(hits.length - before).toBe(2);
  });
});

describe('readLink', () => {
  it('returns OG fields plus the readability text, capped at 4000 chars', async () => {
    const c = await reader().read(at('/article'));
    expect(c).toMatchObject({
      url: at('/article'),
      ok: true,
      title: 'Fixture Article',
      description: 'About fixtures',
      siteName: 'Fixtures Inc',
    });
    expect(c.text).toContain('Second paragraph');
    expect(c.text?.length ?? 0).toBeLessThanOrEqual(4000);
  });

  it('is not ok for an unreachable or private link', async () => {
    expect(await reader().read(at('/missing'))).toEqual({ url: at('/missing'), ok: false });
    expect((await reader().read('http://private.test/x')).ok).toBe(false);
  });

  it('reads YouTube through oEmbed plus the watch page description', async () => {
    const seen: string[] = [];
    const r = reader({
      fetch: async (input) => {
        const url = urlOf(input);
        seen.push(url);
        if (url.startsWith('https://www.youtube.com/oembed')) {
          return Response.json({ title: 'A video', author_name: 'A channel' });
        }
        return new Response('<meta property="og:description" content="Video blurb">', {
          headers: { 'content-type': 'text/html' },
        });
      },
      lookup: async () => ['142.250.0.1'],
    });
    const c = await r.read('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(c).toEqual({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      ok: true,
      title: 'A video',
      siteName: 'A channel',
      description: 'Video blurb',
    });
    expect(seen[0]).toContain('format=json');
  });

  it('reads Vimeo through oEmbed', async () => {
    const r = reader({
      fetch: async (input) => {
        expect(urlOf(input)).toContain('https://vimeo.com/api/oembed.json?url=');
        return Response.json({ title: 'V', author_name: 'Auth', description: 'Desc' });
      },
      lookup: async () => ['142.250.0.1'],
    });
    expect(await r.read('https://vimeo.com/76979871')).toMatchObject({
      ok: true,
      title: 'V',
      description: 'Desc',
    });
  });
});

describe('blocked sites', () => {
  it('retries once with a browser user-agent', async () => {
    uaSeen.length = 0;
    const c = await reader().read(at('/blocked'));
    expect(c.ok).toBe(true);
    expect(uaSeen).toHaveLength(2);
    expect(uaSeen[1]).toContain('Chrome');
  });

  it('reads a still-blocked page through the reader when JINA_API_KEY is set', async () => {
    const calls: { url: string; headers: Headers }[] = [];
    const readerFetch: typeof fetch = async (input, init) => {
      calls.push({ url: urlOf(input), headers: new Headers(init?.headers) });
      return new Response(ARTICLE, { headers: { 'content-type': 'text/html' } });
    };
    const c = await reader({ jinaApiKey: 'k', readerFetch }).read(at('/always-403'));
    expect(c).toMatchObject({ ok: true, title: 'Fixture Article' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`https://r.jina.ai/${at('/always-403')}`);
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer k');
    expect(calls[0]?.headers.get('x-return-format')).toBe('html');
  });

  it('stays unread without the key and never calls the reader', async () => {
    let called = false;
    const readerFetch: typeof fetch = async () => {
      called = true;
      return new Response('');
    };
    expect((await reader({ readerFetch }).read(at('/always-403'))).ok).toBe(false);
    expect(called).toBe(false);
  });

  it('never sends a private URL to the reader', async () => {
    let called = false;
    const readerFetch: typeof fetch = async () => {
      called = true;
      return new Response('');
    };
    await reader({ jinaApiKey: 'k', readerFetch }).read('http://private.test/x');
    expect(called).toBe(false);
  });

  it('treats an empty JINA_API_KEY as absent', () => {
    expect(LinkEnv.parse({ JINA_API_KEY: '  ' }).JINA_API_KEY).toBeUndefined();
    expect(LinkEnv.parse({}).JINA_API_KEY).toBeUndefined();
    expect(LinkEnv.parse({ JINA_API_KEY: 'abc' }).JINA_API_KEY).toBe('abc');
  });
});

describe('per-note reading', () => {
  it('reads only the first 3 links and passes the rest on as unread', async () => {
    const seen: string[] = [];
    const r = reader({
      fetch: async (input, init) => {
        seen.push(urlOf(input));
        return fixtureFetch(input, init);
      },
    });
    const body = [1, 2, 3, 4, 5].map((n) => at(`/article?n=${n}`)).join(' ');
    const contexts = await linkContexts(r, body);
    expect(contexts.map((c) => c.ok)).toEqual([true, true, true, false, false]);
    expect(seen).toHaveLength(3);
  });

  it('gives up on slow links after the budget instead of blocking', async () => {
    const r = createLinkReader({
      fetch: () => new Promise<Response>(() => undefined),
      lookup,
      budgetMs: 50,
    });
    const started = Date.now();
    expect(await r.readAll([at('/article')])).toEqual([{ url: at('/article'), ok: false }]);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("a fixture page's title reaches the classify prompt, a failing link is unread", async () => {
    const body = `read ${at('/article')} and ${at('/missing')}`;
    const contexts = await linkContexts(reader(), body);
    const ai = createFakeAi([{ value: {} }]);
    const s = await classify(ai, {
      body,
      today: '2026-10-25',
      locale: 'en',
      taxonomy: { categories: [] },
      links: contexts,
    });
    expect(ai.calls[0]?.prompt).toContain('<linked_content>');
    expect(ai.calls[0]?.prompt).toContain('Fixture Article');
    expect(s.unreadLinks).toEqual([at('/missing')]);
  });
});
