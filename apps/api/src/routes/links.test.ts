import { LinkPreview } from '@notes/shared';
import { afterAll, describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../ai/provider';
import { createLinkReader } from '../domain/links/preview';
import { buildServer } from '../server';
import { allowListDb, allowedEmails, fakeVerifyToken } from '../test-auth';

describe('GET /links/preview', () => {
  const links = createLinkReader({
    lookup: async (host) => (host === 'private.test' ? ['10.0.0.1'] : ['93.184.216.34']),
    fetch: async () =>
      new Response('<title>Hi</title><meta property="og:description" content="D">', {
        headers: { 'content-type': 'text/html' },
      }),
  });
  const app = buildServer({
    db: allowListDb,
    ai: createFakeAi(),
    links,
    verifyToken: fakeVerifyToken,
    allowedEmails,
  });
  afterAll(() => app.close());
  const get = (url: string, token = 'allowed') =>
    app.inject({
      method: 'GET',
      url: `/links/preview?url=${encodeURIComponent(url)}`,
      headers: { authorization: `Bearer ${token}` },
    });

  it('requires a signed-in user', async () => {
    const res = await app.inject({ method: 'GET', url: '/links/preview?url=http://a.test' });
    expect(res.statusCode).toBe(401);
  });

  it('returns an article preview, a video embed, and 422 when unreachable', async () => {
    const article = await get('http://news.test/a');
    expect(article.statusCode).toBe(200);
    expect(LinkPreview.parse(article.json())).toMatchObject({ kind: 'article', title: 'Hi' });
    const video = await get('https://vimeo.com/76979871');
    expect(LinkPreview.parse(video.json())).toEqual({
      kind: 'video',
      embedUrl: 'https://player.vimeo.com/video/76979871',
    });
    const bad = await get('http://private.test/x');
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toEqual({ error: 'unreachable' });
  });

  it('rejects a missing or malformed url', async () => {
    expect((await get('not a url')).statusCode).toBe(400);
  });
});
