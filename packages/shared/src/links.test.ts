import { describe, expect, it } from 'vite-plus/test';
import { extractLinks, videoEmbed } from './links';

describe('videoEmbed', () => {
  const yt = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s',
    'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
  ])('maps %s', (url) => expect(videoEmbed(url)).toBe(yt));

  it.each([
    ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871'],
    ['https://player.vimeo.com/video/76979871?h=abc', 'https://player.vimeo.com/video/76979871'],
  ])('maps %s', (url, embed) => expect(videoEmbed(url)).toBe(embed));

  it.each([
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/@channel',
    'https://vimeo.com/channels/staffpicks',
    'https://evil.com/youtu.be/dQw4w9WgXcQ',
    'ftp://youtu.be/dQw4w9WgXcQ',
    'not a url',
  ])('rejects %s', (url) => expect(videoEmbed(url)).toBeNull());
});

describe('extractLinks', () => {
  it('finds links in order, deduped, without trailing punctuation', () => {
    const body = 'see https://a.com/x, then (https://b.com/y). Again https://a.com/x!';
    expect(extractLinks(body)).toEqual(['https://a.com/x', 'https://b.com/y']);
  });
  it('ignores non-http schemes and plain text', () => {
    expect(extractLinks('ftp://a.com mailto:x@y.com nothing')).toEqual([]);
  });
  it('works across lines in Hebrew text', () => {
    expect(extractLinks('לקרוא\nhttps://a.com/p?q=1\nמחר')).toEqual(['https://a.com/p?q=1']);
  });
});
